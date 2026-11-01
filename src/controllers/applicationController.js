const { supabaseAdmin } = require("../config/supabase");
const { generateNextApplicationNumber } = require("../utils/appNumberGenerator");
const { StorageService } = require("../services/storageService");

/**
 * Uploads any base64 document or image to AWS S3 under 'applications' folder
 * and returns the S3 Key alone (or original value if already uploaded/remote)
 */
async function processDocumentUpload(docVal, fieldName) {
  if (!docVal || typeof docVal !== "string") return docVal;
  if (docVal.startsWith("data:")) {
    try {
      const s3Key = await StorageService.uploadMedia(docVal, "applications", fieldName);
      return s3Key;
    } catch (err) {
      console.error(`[AWS S3] Failed to upload document ${fieldName}:`, err.message);
      return docVal;
    }
  }
  return docVal;
}

/**
 * Resolves all 7 document fields from base64 into AWS S3 keys
 */
async function uploadAllApplicationDocuments(formData) {
  if (!formData || typeof formData !== "object") return formData;
  const processed = { ...formData };

  const docFields = [
    { key: "studentPhoto", name: "student_photo" },
    { key: "document10thMarksheet", name: "10th_marksheet" },
    { key: "document11thMarksheet", name: "11th_marksheet" },
    { key: "document12thMarksheet", name: "12th_marksheet" },
    { key: "documentCommunityCertificate", name: "community_cert" },
    { key: "documentIncomeCertificate", name: "income_cert" },
    { key: "documentAadhaarCard", name: "aadhaar_doc" },
    { key: "documentParentIdProof", name: "parent_id_proof" },
  ];

  for (const { key, name } of docFields) {
    if (processed[key]) {
      processed[key] = await processDocumentUpload(processed[key], name);
    }
  }

  return processed;
}

function mapFormDataToDb(formData) {
  // Extract and serialize any extended fields into additional_remarks JSON wrapper
  const extendedData = {
    whatsappNumber: formData.whatsappNumber || "",
    community: formData.community || "",
    nationality: formData.nationality || "Indian",
    maritalStatus: formData.maritalStatus || "Single",
    fatherEmploymentStatus: formData.fatherEmploymentStatus || "",
    motherEmploymentStatus: formData.motherEmploymentStatus || "",
    familyMembersCount: formData.familyMembersCount || "",
    familyType: formData.familyType || "",
    familySituation: formData.familySituation || "",
    guardianRelation: formData.guardianRelation || "",
    siblingCount: formData.siblingCount || "",
    siblingsStudyingCount: formData.siblingsStudyingCount || "",
    permanentAddress: formData.permanentAddress || "",
    currentAddress: formData.currentAddress || "",
    sameAsPermanent: formData.sameAsPermanent ?? false,
    villageTown: formData.villageTown || "",
    residenceType: formData.residenceType || "",
    collegeDistance: formData.collegeDistance || "",
    firstGraduate: formData.firstGraduate ?? false,
    secondBranch: formData.secondBranch || "",
    preferredCollegeLocation: formData.preferredCollegeLocation || "",
    monthlyFamilyIncome: formData.monthlyFamilyIncome || "",
    incomeSources: formData.incomeSources || "",
    familyDebts: formData.familyDebts || "",
    educationLoans: formData.educationLoans || "",
    financialDifficulties: formData.financialDifficulties || "",
    whyNeedSupport: formData.whyNeedSupport || "",
    affordabilityWithoutSupport: formData.affordabilityWithoutSupport || "",
    specialCircumstances: formData.specialCircumstances || "",
    careerAmbition: formData.careerAmbition || "",
    higherEducationReason: formData.higherEducationReason || "",
    willingToRelocateTN: formData.willingToRelocateTN ?? true,
    futureGoals: formData.futureGoals || "",
    documentCommunityCertificate: formData.documentCommunityCertificate || "",
    documentIncomeCertificate: formData.documentIncomeCertificate || "",
    documentParentIdProof: formData.documentParentIdProof || "",
    studentPhoto: formData.studentPhoto || "",
    customRemarks: formData.additionalRemarks || "",
  };

  return {
    full_name: formData.fullName,
    dob: formData.dob || null,
    gender: formData.gender,
    blood_group: formData.bloodGroup,
    aadhaar_number: formData.aadhaarNumber,
    mobile_number: formData.mobileNumber,
    alt_mobile_number: formData.altMobileNumber || formData.whatsappNumber,
    email: formData.email,
    address: formData.currentAddress || formData.permanentAddress || formData.address,
    district: formData.district,
    pincode: formData.pincode,

    // Family Details
    father_name: formData.fatherName,
    father_occupation: formData.fatherOccupation,
    father_income: formData.fatherIncome || formData.fatherMonthlyIncome,
    mother_name: formData.motherName,
    mother_occupation: formData.motherOccupation,
    mother_income: formData.motherIncome || formData.motherMonthlyIncome,
    guardian_name: formData.guardianName,
    guardian_occupation: formData.guardianOccupation,
    guardian_income: formData.guardianIncome || formData.guardianMonthlyIncome,
    family_annual_income: formData.annualIncome || formData.familyAnnualIncome || formData.annualFamilyIncome,
    housing_status: formData.residenceType || formData.housingStatus,
    first_graduate: Boolean(formData.firstGraduate),
    single_parent: Boolean(formData.singleParent || formData.familySituation === "Single parent"),
    orphan: Boolean(formData.orphan || formData.familySituation === "Orphan"),
    differently_abled: Boolean(formData.differentlyAbled),
    siblings: formData.siblings || [],

    // 10th Standard
    tenth_school_name: formData.tenthSchoolName || formData.tenthSchool,
    tenth_school_address: formData.tenthSchoolAddress,
    tenth_board: formData.tenthBoard,
    tenth_pass_year: formData.tenthPassYear || formData.tenthYear,
    tenth_marks_obtained: formData.tenthMarksObtained || formData.tenthTotalMarks ? parseFloat(formData.tenthMarksObtained || formData.tenthTotalMarks) : null,
    tenth_max_marks: formData.tenthMaxMarks ? parseFloat(formData.tenthMaxMarks) : null,
    tenth_percentage: formData.tenthPercentage ? parseFloat(formData.tenthPercentage) : null,

    // 11th Standard
    eleventh_school_name: formData.eleventhSchoolName || formData.eleventhSchool,
    eleventh_school_address: formData.eleventhSchoolAddress,
    eleventh_board: formData.eleventhBoard,
    eleventh_pass_year: formData.eleventhPassYear || formData.eleventhYear,
    eleventh_subjects: formData.eleventhSubjects || [],
    eleventh_total_marks: formData.eleventhTotalMarks ? parseFloat(formData.eleventhTotalMarks) : null,
    eleventh_max_marks: formData.eleventhMaxMarks ? parseFloat(formData.eleventhMaxMarks) : null,
    eleventh_percentage: formData.eleventhPercentage ? parseFloat(formData.eleventhPercentage) : null,

    // 12th Standard
    twelfth_school_name: formData.twelfthSchoolName || formData.twelfthSchool,
    twelfth_school_address: formData.twelfthSchoolAddress,
    twelfth_board: formData.twelfthBoard,
    twelfth_pass_year: formData.twelfthPassYear || formData.twelfthYear,
    twelfth_group: formData.twelfthGroup || formData.twelfthStream,
    twelfth_subjects: formData.twelfthSubjects || [],
    twelfth_total_marks: formData.twelfthTotalMarks ? parseFloat(formData.twelfthTotalMarks) : null,
    twelfth_max_marks: formData.twelfthMaxMarks ? parseFloat(formData.twelfthMaxMarks) : null,
    twelfth_percentage: formData.twelfthPercentage ? parseFloat(formData.twelfthPercentage) : null,
    twelfth_cutoff: formData.twelfthCutoff ? parseFloat(formData.twelfthCutoff) : null,

    // Preferences
    preferred_degree: formData.preferredDegree,
    preferred_courses: formData.preferredCourses || (formData.preferredBranch ? [formData.preferredBranch, formData.secondBranch].filter(Boolean) : []),
    preferred_districts: formData.preferredDistricts || (formData.preferredCollegeLocation ? [formData.preferredCollegeLocation] : []),
    hostel_required: Boolean(formData.hostelRequired),
    additional_remarks: JSON.stringify(extendedData),

    // Documents
    document_10th_marksheet: formData.document10thMarksheet,
    document_11th_marksheet: formData.document11thMarksheet,
    document_12th_marksheet: formData.document12thMarksheet,
    document_aadhaar_card: formData.documentAadhaarCard || formData.documentAadhaar,
  };
}

// Helper to map snake_case DB columns to camelCase frontend fields
function mapDbToFormData(row) {
  if (!row) return null;

  // Attempt to parse extended data stored in additional_remarks
  let ext = {};
  if (row.additional_remarks) {
    try {
      if (row.additional_remarks.startsWith("{")) {
        ext = JSON.parse(row.additional_remarks);
      }
    } catch {
      ext = {};
    }
  }

  const preferredCourses = row.preferred_courses || [];
  const primaryCourse = (Array.isArray(preferredCourses) && preferredCourses[0]) || row.preferred_branch || "";
  const secondaryCourse = (Array.isArray(preferredCourses) && preferredCourses[1]) || ext.secondBranch || "";

  return {
    id: row.id,
    applicationNumber: row.application_number,
    status: row.status,
    currentStage: row.current_stage,
    stageStatus: row.stage_status,
    submittedAt: row.submitted_at,

    // A. Personal Information
    fullName: row.full_name || "",
    dob: row.dob || "",
    gender: row.gender || "",
    bloodGroup: row.blood_group || "",
    mobileNumber: row.mobile_number || "",
    whatsappNumber: ext.whatsappNumber || row.alt_mobile_number || "",
    altMobileNumber: row.alt_mobile_number || "",
    email: row.email || "",
    aadhaarNumber: row.aadhaar_number || "",
    community: ext.community || "",
    nationality: ext.nationality || "Indian",
    maritalStatus: ext.maritalStatus || "Single",

    // B. Family Information
    fatherName: row.father_name || "",
    fatherOccupation: row.father_occupation || "",
    fatherMonthlyIncome: row.father_income || "",
    fatherIncome: row.father_income || "",
    fatherEmploymentStatus: ext.fatherEmploymentStatus || "",
    motherName: row.mother_name || "",
    motherOccupation: row.mother_occupation || "",
    motherMonthlyIncome: row.mother_income || "",
    motherIncome: row.mother_income || "",
    motherEmploymentStatus: ext.motherEmploymentStatus || "",
    annualIncome: row.family_annual_income || "",
    familyAnnualIncome: row.family_annual_income || "",
    annualFamilyIncome: row.family_annual_income || "",
    familyMembersCount: ext.familyMembersCount || "",
    familyType: ext.familyType || "Nuclear",
    familySituation: ext.familySituation || (row.orphan ? "Orphan" : row.single_parent ? "Single parent" : "Both parents"),
    guardianName: row.guardian_name || "",
    guardianOccupation: row.guardian_occupation || "",
    guardianMonthlyIncome: row.guardian_income || "",
    guardianIncome: row.guardian_income || "",
    guardianRelation: ext.guardianRelation || "",

    // C. Siblings Information
    siblingCount: ext.siblingCount || (row.siblings?.length ? String(row.siblings.length) : ""),
    siblingsStudyingCount: ext.siblingsStudyingCount || "",
    siblings: row.siblings || [],

    // D. Address Information
    permanentAddress: ext.permanentAddress || row.address || "",
    currentAddress: ext.currentAddress || row.address || "",
    sameAsPermanent: ext.sameAsPermanent ?? true,
    address: row.address || "",
    villageTown: ext.villageTown || "",
    district: row.district || "",
    state: ext.state || "Tamil Nadu",
    pincode: row.pincode || "",
    residenceType: ext.residenceType || row.housing_status || "Own",
    housingStatus: row.housing_status || ext.residenceType || "Own",
    collegeDistance: ext.collegeDistance || "",

    // E. Educational Information
    tenthSchool: row.tenth_school_name || "",
    tenthSchoolName: row.tenth_school_name || "",
    tenthSchoolAddress: row.tenth_school_address || "",
    tenthBoard: row.tenth_board || "State Board",
    tenthYear: row.tenth_pass_year || "",
    tenthPassYear: row.tenth_pass_year || "",
    tenthTotalMarks: row.tenth_marks_obtained?.toString() || "",
    tenthMarksObtained: row.tenth_marks_obtained?.toString() || "",
    tenthMaxMarks: row.tenth_max_marks?.toString() || "500",
    tenthPercentage: row.tenth_percentage?.toString() || "",

    eleventhSchool: row.eleventh_school_name || "",
    eleventhSchoolName: row.eleventh_school_name || "",
    eleventhSchoolAddress: row.eleventh_school_address || "",
    eleventhBoard: row.eleventh_board || "State Board",
    eleventhPassYear: row.eleventh_pass_year || "",
    eleventhSubjects: row.eleventh_subjects || [],
    eleventhTotalMarks: row.eleventh_total_marks?.toString() || "",
    eleventhMaxMarks: row.eleventh_max_marks?.toString() || "600",
    eleventhPercentage: row.eleventh_percentage?.toString() || "",

    twelfthSchool: row.twelfth_school_name || "",
    twelfthSchoolName: row.twelfth_school_name || "",
    twelfthSchoolAddress: row.twelfth_school_address || "",
    twelfthBoard: row.twelfth_board || "State Board",
    twelfthYear: row.twelfth_pass_year || "",
    twelfthPassYear: row.twelfth_pass_year || "",
    twelfthGroup: row.twelfth_group || "",
    twelfthStream: row.twelfth_group || "",
    twelfthSubjects: row.twelfth_subjects || [],
    twelfthTotalMarks: row.twelfth_total_marks?.toString() || "",
    twelfthMaxMarks: row.twelfth_max_marks?.toString() || "600",
    twelfthPercentage: row.twelfth_percentage?.toString() || "",
    twelfthCutoff: row.twelfth_cutoff?.toString() || "",
    firstGraduate: row.first_graduate ?? ext.firstGraduate ?? false,
    preferredDegree: row.preferred_degree || "",
    preferredBranch: primaryCourse,
    secondBranch: secondaryCourse,
    preferredCourses: row.preferred_courses || [],
    preferredCollegeLocation: ext.preferredCollegeLocation || (row.preferred_districts && row.preferred_districts[0]) || "",
    preferredDistricts: row.preferred_districts || [],
    hostelRequired: row.hostel_required ?? false,

    // F. Financial Information
    monthlyFamilyIncome: ext.monthlyFamilyIncome || "",
    incomeSources: ext.incomeSources || "",
    familyDebts: ext.familyDebts || "",
    educationLoans: ext.educationLoans || "",
    financialDifficulties: ext.financialDifficulties || "",
    whyNeedSupport: ext.whyNeedSupport || "",
    affordabilityWithoutSupport: ext.affordabilityWithoutSupport || "",

    // G. Personal and Background Information
    orphan: row.orphan ?? (ext.familySituation === "Orphan"),
    singleParent: row.single_parent ?? (ext.familySituation === "Single parent"),
    firstGenerationLearner: ext.firstGraduate || row.first_graduate || false,
    differentlyAbled: row.differently_abled ?? false,
    specialCircumstances: ext.specialCircumstances || "",
    careerAmbition: ext.careerAmbition || "",
    higherEducationReason: ext.higherEducationReason || "",
    willingToRelocateTN: ext.willingToRelocateTN ?? true,
    futureGoals: ext.futureGoals || "",
    additionalRemarks: ext.customRemarks || row.additional_remarks || "",

    // H. Document Uploads (Resolved to streamable URLs, preserving S3 keys)
    studentPhoto: StorageService.getMediaUrl(ext.studentPhoto || ""),
    document10thMarksheet: StorageService.getMediaUrl(row.document_10th_marksheet || ""),
    document11thMarksheet: StorageService.getMediaUrl(row.document_11th_marksheet || ""),
    document12thMarksheet: StorageService.getMediaUrl(row.document_12th_marksheet || ""),
    documentCommunityCertificate: StorageService.getMediaUrl(ext.documentCommunityCertificate || ""),
    documentIncomeCertificate: StorageService.getMediaUrl(ext.documentIncomeCertificate || ""),
    documentAadhaarCard: StorageService.getMediaUrl(row.document_aadhaar_card || ""),
    documentParentIdProof: StorageService.getMediaUrl(ext.documentParentIdProof || ""),

    // Raw S3 Keys
    s3_student_photo_key: ext.studentPhoto || "",
    s3_document_10th_key: row.document_10th_marksheet || "",
    s3_document_11th_key: row.document_11th_marksheet || "",
    s3_document_12th_key: row.document_12th_marksheet || "",
    s3_document_community_key: ext.documentCommunityCertificate || "",
    s3_document_income_key: ext.documentIncomeCertificate || "",
    s3_document_aadhaar_key: row.document_aadhaar_card || "",
    s3_document_parent_id_key: ext.documentParentIdProof || "",
  };
}

/**
 * @controller  getMyApplication
 * @route       GET /api/application/me
 * @desc        Fetch authenticated student's application from Supabase
 */
async function getMyApplication(req, res) {
  try {
    const userId = req.user.id;

    const { data: app, error } = await supabaseAdmin
      .from("applications")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching application:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve application from database",
        error: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      hasApplication: !!app,
      data: mapDbToFormData(app),
    });
  } catch (err) {
    console.error("getMyApplication error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
}

/**
 * @controller  saveDraft
 * @route       POST /api/application/save-draft
 * @desc        Save partial application draft into Supabase database
 */
async function saveDraft(req, res) {
  try {
    const userId = req.user.id;
    const rawFormData = req.body;
    // 1. Upload any base64 document attachments directly to AWS S3
    const formData = await uploadAllApplicationDocuments(rawFormData);
    const dbPayload = mapFormDataToDb(formData);

    const { data: existing } = await supabaseAdmin
      .from("applications")
      .select("id, status, application_number")
      .eq("user_id", userId)
      .maybeSingle();

    let result;
    if (existing) {
      const updatePayload = {
        ...dbPayload,
        updated_at: new Date().toISOString(),
      };
      if (!existing.application_number || !existing.application_number.startsWith("MF-2025-")) {
        updatePayload.application_number = await generateNextApplicationNumber();
      }
      result = await supabaseAdmin
        .from("applications")
        .update(updatePayload)
        .eq("user_id", userId)
        .select()
        .single();
    } else {
      const appNum = await generateNextApplicationNumber();
      result = await supabaseAdmin
        .from("applications")
        .insert({
          user_id: userId,
          application_number: appNum,
          ...dbPayload,
          status: "draft",
        })
        .select()
        .single();
    }

    if (result.error) {
      console.error("Error saving draft:", result.error);
      return res.status(400).json({
        success: false,
        message: "Failed to save application draft",
        error: result.error.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Application draft saved successfully",
      data: mapDbToFormData(result.data),
    });
  } catch (err) {
    console.error("saveDraft error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error saving draft",
      error: err.message,
    });
  }
}

/**
 * @controller  submitApplication
 * @route       POST /api/application/submit
 * @desc        Final submit of scholarship application into Supabase database
 */
async function submitApplication(req, res) {
  try {
    const userId = req.user.id;
    const rawFormData = req.body;
    // 1. Upload any base64 document attachments directly to AWS S3
    const formData = await uploadAllApplicationDocuments(rawFormData);
    const dbPayload = mapFormDataToDb(formData);

    const { data: existingApp } = await supabaseAdmin
      .from("applications")
      .select("id, application_number")
      .eq("user_id", userId)
      .maybeSingle();

    const appNumber =
      existingApp?.application_number && existingApp.application_number.startsWith("MF-2025-")
        ? existingApp.application_number
        : await generateNextApplicationNumber();

    const { data: updated, error } = await supabaseAdmin
      .from("applications")
      .upsert(
        {
          user_id: userId,
          application_number: appNumber,
          ...dbPayload,
          status: "submitted",
          current_stage: "Stage 01",
          stage_status: "In Progress",
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("Error submitting application:", error);
      return res.status(400).json({
        success: false,
        message: "Failed to submit application",
        error: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Scholarship application submitted successfully!",
      applicationNumber: updated.application_number,
      data: mapDbToFormData(updated),
    });
  } catch (err) {
    console.error("submitApplication error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error submitting application",
      error: err.message,
    });
  }
}

/**
 * @controller  getStatus
 * @route       GET /api/application/status
 * @desc        Get selection process stage and verification tracking
 */
async function getStatus(req, res) {
  try {
    const userId = req.user.id;

    const { data: app } = await supabaseAdmin
      .from("applications")
      .select("application_number, status, current_stage, stage_status, submitted_at")
      .eq("user_id", userId)
      .maybeSingle();

    return res.status(200).json({
      success: true,
      applicationNumber: app?.application_number || "MF-2025-001",
      status: app?.status || "draft",
      currentStage: app?.current_stage || "Stage 01",
      stageStatus: app?.stage_status || "In Progress",
      submittedAt: app?.submitted_at,
    });
  } catch (err) {
    console.error("getStatus error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error fetching status",
      error: err.message,
    });
  }
}

module.exports = {
  getMyApplication,
  saveDraft,
  submitApplication,
  getStatus,
};
