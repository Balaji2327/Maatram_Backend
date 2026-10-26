const { supabaseAdmin } = require("../config/supabase");
const { generateNextApplicationNumber } = require("../utils/appNumberGenerator");

// Helper to map camelCase frontend fields to snake_case DB columns
function mapFormDataToDb(formData) {
  return {
    full_name: formData.fullName,
    dob: formData.dob || null,
    gender: formData.gender,
    blood_group: formData.bloodGroup,
    aadhaar_number: formData.aadhaarNumber,
    mobile_number: formData.mobileNumber,
    alt_mobile_number: formData.altMobileNumber,
    email: formData.email,
    address: formData.address,
    district: formData.district,
    pincode: formData.pincode,

    // Family Details
    father_name: formData.fatherName,
    father_occupation: formData.fatherOccupation,
    father_income: formData.fatherIncome,
    mother_name: formData.motherName,
    mother_occupation: formData.motherOccupation,
    mother_income: formData.motherIncome,
    guardian_name: formData.guardianName,
    guardian_occupation: formData.guardianOccupation,
    guardian_income: formData.guardianIncome,
    family_annual_income: formData.familyAnnualIncome || formData.annualIncome,
    housing_status: formData.housingStatus,
    first_graduate: formData.firstGraduate || false,
    single_parent: formData.singleParent || false,
    orphan: formData.orphan || false,
    differently_abled: formData.differentlyAbled || false,
    siblings: formData.siblings || [],

    // 10th Standard
    tenth_school_name: formData.tenthSchoolName,
    tenth_school_address: formData.tenthSchoolAddress,
    tenth_board: formData.tenthBoard,
    tenth_pass_year: formData.tenthPassYear,
    tenth_marks_obtained: formData.tenthMarksObtained ? parseFloat(formData.tenthMarksObtained) : null,
    tenth_max_marks: formData.tenthMaxMarks ? parseFloat(formData.tenthMaxMarks) : null,
    tenth_percentage: formData.tenthPercentage ? parseFloat(formData.tenthPercentage) : null,

    // 11th Standard
    eleventh_school_name: formData.eleventhSchoolName,
    eleventh_school_address: formData.eleventhSchoolAddress,
    eleventh_board: formData.eleventhBoard,
    eleventh_pass_year: formData.eleventhPassYear,
    eleventh_subjects: formData.eleventhSubjects || [],
    eleventh_total_marks: formData.eleventhTotalMarks ? parseFloat(formData.eleventhTotalMarks) : null,
    eleventh_max_marks: formData.eleventhMaxMarks ? parseFloat(formData.eleventhMaxMarks) : null,
    eleventh_percentage: formData.eleventhPercentage ? parseFloat(formData.eleventhPercentage) : null,

    // 12th Standard
    twelfth_school_name: formData.twelfthSchoolName,
    twelfth_school_address: formData.twelfthSchoolAddress,
    twelfth_board: formData.twelfthBoard,
    twelfth_pass_year: formData.twelfthPassYear,
    twelfth_group: formData.twelfthGroup,
    twelfth_subjects: formData.twelfthSubjects || [],
    twelfth_total_marks: formData.twelfthTotalMarks ? parseFloat(formData.twelfthTotalMarks) : null,
    twelfth_max_marks: formData.twelfthMaxMarks ? parseFloat(formData.twelfthMaxMarks) : null,
    twelfth_percentage: formData.twelfthPercentage ? parseFloat(formData.twelfthPercentage) : null,
    twelfth_cutoff: formData.twelfthCutoff ? parseFloat(formData.twelfthCutoff) : null,

    // Preferences
    preferred_degree: formData.preferredDegree,
    preferred_courses: formData.preferredCourses || [],
    preferred_districts: formData.preferredDistricts || [],
    hostel_required: formData.hostelRequired || false,
    additional_remarks: formData.additionalRemarks,

    // Documents
    document_10th_marksheet: formData.document10thMarksheet,
    document_11th_marksheet: formData.document11thMarksheet,
    document_12th_marksheet: formData.document12thMarksheet,
    document_aadhaar_card: formData.documentAadhaarCard,
  };
}

// Helper to map snake_case DB columns to camelCase frontend fields
function mapDbToFormData(row) {
  if (!row) return null;
  return {
    id: row.id,
    applicationNumber: row.application_number,
    status: row.status,
    currentStage: row.current_stage,
    stageStatus: row.stage_status,
    submittedAt: row.submitted_at,

    fullName: row.full_name || "",
    dob: row.dob || "",
    gender: row.gender || "",
    bloodGroup: row.blood_group || "",
    aadhaarNumber: row.aadhaar_number || "",
    mobileNumber: row.mobile_number || "",
    altMobileNumber: row.alt_mobile_number || "",
    email: row.email || "",
    address: row.address || "",
    district: row.district || "",
    pincode: row.pincode || "",

    fatherName: row.father_name || "",
    fatherOccupation: row.father_occupation || "",
    fatherIncome: row.father_income || "",
    motherName: row.mother_name || "",
    motherOccupation: row.mother_occupation || "",
    motherIncome: row.mother_income || "",
    guardianName: row.guardian_name || "",
    guardianOccupation: row.guardian_occupation || "",
    guardianIncome: row.guardian_income || "",
    familyAnnualIncome: row.family_annual_income || "",
    annualIncome: row.family_annual_income || "",
    housingStatus: row.housing_status || "",
    firstGraduate: !!row.first_graduate,
    singleParent: !!row.single_parent,
    orphan: !!row.orphan,
    differentlyAbled: !!row.differently_abled,
    siblings: row.siblings || [],

    tenthSchoolName: row.tenth_school_name || "",
    tenthSchoolAddress: row.tenth_school_address || "",
    tenthBoard: row.tenth_board || "",
    tenthPassYear: row.tenth_pass_year || "",
    tenthMarksObtained: row.tenth_marks_obtained?.toString() || "",
    tenthMaxMarks: row.tenth_max_marks?.toString() || "",
    tenthPercentage: row.tenth_percentage?.toString() || "",

    eleventhSchoolName: row.eleventh_school_name || "",
    eleventhSchoolAddress: row.eleventh_school_address || "",
    eleventhBoard: row.eleventh_board || "",
    eleventhPassYear: row.eleventh_pass_year || "",
    eleventhSubjects: row.eleventh_subjects || [],
    eleventhTotalMarks: row.eleventh_total_marks?.toString() || "",
    eleventhMaxMarks: row.eleventh_max_marks?.toString() || "",
    eleventhPercentage: row.eleventh_percentage?.toString() || "",

    twelfthSchoolName: row.twelfth_school_name || "",
    twelfthSchoolAddress: row.twelfth_school_address || "",
    twelfthBoard: row.twelfth_board || "",
    twelfthPassYear: row.twelfth_pass_year || "",
    twelfthGroup: row.twelfth_group || "",
    twelfthSubjects: row.twelfth_subjects || [],
    twelfthTotalMarks: row.twelfth_total_marks?.toString() || "",
    twelfthMaxMarks: row.twelfth_max_marks?.toString() || "",
    twelfthPercentage: row.twelfth_percentage?.toString() || "",
    twelfthCutoff: row.twelfth_cutoff?.toString() || "",

    preferredDegree: row.preferred_degree || "",
    preferredBranch: (Array.isArray(row.preferred_courses) && row.preferred_courses[0]) || row.preferred_branch || "",
    preferredCourses: row.preferred_courses || [],
    preferredDistricts: row.preferred_districts || [],
    hostelRequired: !!row.hostel_required,
    additionalRemarks: row.additional_remarks || "",

    document10thMarksheet: row.document_10th_marksheet || "",
    document11thMarksheet: row.document_11th_marksheet || "",
    document12thMarksheet: row.document_12th_marksheet || "",
    documentAadhaarCard: row.document_aadhaar_card || "",
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
    const formData = req.body;
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
    const formData = req.body;
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
