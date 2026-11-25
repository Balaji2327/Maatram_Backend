const { supabaseAdmin } = require("../config/supabase");
const { ApplicationModel, annualizeMonthly } = require("../models/Application");
const { memberRole, portalRole } = require("../services/membershipService");
const { mapDbToFormData } = require("./applicationController");

const { StorageService } = require("../services/storageService");

const sections = {
  "College and enrollment": "collegeName degreeBranch currentYear rollNumber attendance cgpa",
  "Personal details": "applicationNumber fullName submittedAt dob gender bloodGroup mobileNumber altMobileNumber whatsappNumber email aadhaarNumber community nationality",
  "Family and siblings": "fatherName fatherOccupation fatherAnnualIncome fatherEmploymentStatus motherName motherOccupation motherAnnualIncome motherEmploymentStatus annualIncome familyMembersCount familyType familySituation guardianName guardianRelation guardianOccupation guardianAnnualIncome siblingCount siblingsStudyingCount siblings",
  "Residence": "permanentAddress currentAddress sameAsPermanent villageTown district state pincode residenceType rentAmount collegeDistance",
  "Schooling": "tenthSchool tenthSchoolAddress tenthYear tenthBoard tenthSubjects tenthTotalMarks tenthMaxMarks tenthPercentage eleventhSchool eleventhSchoolAddress eleventhBoard eleventhStream eleventhPassYear eleventhSubjects eleventhTotalMarks eleventhMaxMarks eleventhPercentage twelfthSchool twelfthSchoolAddress twelfthYear twelfthBoard twelfthStream twelfthSubjects twelfthTotalMarks twelfthMaxMarks twelfthPercentage twelfthCutoff mediumOfInstruction",
  "Study preferences": "preferredDegree preferredBranch secondBranch preferredCourses preferredCollegeLocation preferredDistricts hostelRequired firstGraduate careerGoal",
  "Finances and goals": "incomeSources familyDebts educationLoans affordabilityWithoutSupport financialDifficulties whyNeedSupport orphan singleParent firstGenerationLearner differentlyAbled specialCircumstances careerAmbition willingToRelocateTN futureGoals additionalRemarks declarationAgreed",
  "Application documents": "studentPhoto document10thMarksheet document12thMarksheet documentAadhaarCard",
};
const fields = Object.values(sections).flatMap(group => group.split(" "));
const readOnly = new Set(("applicationNumber submittedAt email cgpa declarationAgreed tenthSubjects eleventhSubjects twelfthSubjects preferredCourses preferredDistricts " + sections["Application documents"]).split(" "));

async function loadScholar(req, res, next) {
  try {
    const id = req.params.studentId || req.user.id;
    const [{ data, error }, app] = await Promise.all([supabaseAdmin.auth.admin.getUserById(id), ApplicationModel.findByUserId(id)]);
    if (error || !data?.user) return res.status(404).json({ success: false, message: "Student not found." });
    const role = req.params.studentId ? memberRole(app, data.user.app_metadata?.role) : portalRole(data.user, app);
    if (role !== "student") return res.status(403).json({ success: false, message: "Student access is required." });
    req.scholar = { user: data.user, app };
    return next();
  } catch (error) { next(error); }
}

function buildProfile({ user, app }) {
  const meta = user.user_metadata || {};
  const form = app ? mapDbToFormData(app) : {};
  const base = { ...form, email: form.email || user.email, fullName: form.fullName || meta.full_name,
    mobileNumber: form.mobileNumber || meta.phone || user.phone, collegeName: meta.college_name || meta.college,
    degreeBranch: meta.degree_branch || meta.degree, currentYear: meta.current_year, rollNumber: meta.roll_number,
    attendance: meta.attendance, cgpa: meta.cgpa };
  const values = Object.fromEntries(fields.map(key => [key, (!readOnly.has(key) ? meta["scholar_" + key] : undefined) ?? base[key] ?? ""]));
  for (const person of ["father", "mother", "guardian"]) {
    const field = person + "AnnualIncome";
    if (meta["scholar_" + field] == null) {
      values[field] = annualizeMonthly(meta["scholar_" + person + "MonthlyIncome"]) || values[field];
    }
  }
  if (!values.annualIncome) values.annualIncome = annualizeMonthly(meta.scholar_monthlyFamilyIncome);
  const sheets = Object.keys(meta).filter(key => /^marksheet_[1-8]_(CAT_[123]|Semester_Exam)$/.test(key) && typeof meta[key] === "string" && meta[key].startsWith("scholar_marksheets/" + user.id + "/"));
  for (const key of sheets) values[key] = true;
  return { sections: sheets.length ? { ...sections, "Semester marksheets": sheets.join(" ") } : sections, values, readOnly: [...readOnly, ...sheets] };
}

function getProfile(req, res) {
  return res.json({ success: true, data: buildProfile(req.scholar) });
}

function validChange(key, value) {
  if (!fields.includes(key) || readOnly.has(key)) return false;
  if (key === "siblings") {
    const allowed = ["id", "name", "relationship", "age", "education", "institution"];
    return Array.isArray(value) && value.length <= 80 && value.every(person =>
      person && typeof person === "object" && !Array.isArray(person) &&
      Object.entries(person).every(([field, item]) => allowed.includes(field) &&
        (typeof item === "string" && item.length <= 1000 || typeof item === "number" && Number.isFinite(item))));
  }
  return typeof value === "boolean" || (typeof value === "string" && value.length <= 10000);
}

async function saveProfile(req, res, next) {
  const changes = req.body.changes;
  if (!changes || typeof changes !== "object" || Array.isArray(changes) ||
      Object.entries(changes).some(([key, value]) => !validChange(key, value))) {
    return res.status(400).json({ success: false, message: "Invalid profile fields." });
  }
  try {
    const { user } = req.scholar;
    // Supabase merges top-level metadata keys. Use one key per edited field so separate edits survive.
    const metadata = Object.fromEntries(Object.entries(changes).map(([key, value]) => ["scholar_" + key, value]));
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user.id, { user_metadata: metadata });
    if (error) throw error;
    return res.json({ success: true, data: buildProfile({ ...req.scholar, user: data.user }) });
  } catch (error) { next(error); }
}

async function uploadMarksheet(req, res, next) {
  const { semester, exam, file } = req.body;
  if (!Number.isInteger(semester) || semester < 1 || semester > 8 || !["CAT 1","CAT 2","CAT 3","Semester Exam"].includes(exam) ||
      typeof file !== "string" || !/^data:(application\/pdf|image\/(png|jpeg));base64,[A-Za-z0-9+/]+=*$/.test(file) ||
      Buffer.byteLength(file.slice(file.indexOf(",")+1), "base64") > 5 * 1024 * 1024) {
    return res.status(400).json({ success: false, message: "Choose a PDF, PNG or JPEG up to 5 MB and a valid semester and exam." });
  }
  try {
    const key = await StorageService.uploadMedia(file, "scholar_marksheets/" + req.scholar.user.id, exam);
    const field = "marksheet_" + semester + "_" + exam.replace(/ /g, "_");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.scholar.user.id, { user_metadata: { [field]: key } });
    if (error) throw error;
    return res.json({ success: true });
  } catch (error) { next(error); }
}

async function downloadMarksheet(req, res, next) {
  const { user } = req.scholar;
  const field = req.params.field;
  const key = user.user_metadata?.[field];
  if (!/^marksheet_[1-8]_(CAT_[123]|Semester_Exam)$/.test(field) || typeof key !== "string" || !key.startsWith("scholar_marksheets/" + user.id + "/")) return res.sendStatus(404);
  try {
    const { s3Client, AWS_S3_BUCKET } = require("../services/storageService");
    const { GetObjectCommand } = require("@aws-sdk/client-s3");
    const object = await s3Client.send(new GetObjectCommand({ Bucket: AWS_S3_BUCKET, Key: key }));
    res.type(object.ContentType || "application/octet-stream").set("Cache-Control", "private, no-store");
    object.Body.on("error", error => res.destroy(error)).pipe(res);
  } catch (error) { next(error); }
}

module.exports = { downloadMarksheet, uploadMarksheet, loadScholar, buildProfile, getProfile, saveProfile };
