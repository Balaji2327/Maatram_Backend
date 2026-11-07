const { supabaseAdmin } = require("../config/supabase");

/**
 * @controller  getAllStudents
 * @route       GET /admin/students
 * @desc        Fetch all students from Supabase Auth & Applications database
 */
async function getAllStudents(req, res) {
  try {
    const { data: { users }, error: authErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 100 });
    if (authErr) {
      throw authErr;
    }

    const { data: applications, error: appErr } = await supabaseAdmin.from("applications").select("*");

    const appMap = new Map();
    (applications || []).forEach((app) => {
      if (app.email) appMap.set(app.email.toLowerCase(), app);
      if (app.user_id) appMap.set(app.user_id, app);
    });

    const studentUsers = (users || []).filter(
      (u) => u.user_metadata?.role === "student" || u.email?.includes("student")
    );

    const students = studentUsers.map((u) => {
      const meta = u.user_metadata || {};
      const app = appMap.get(u.email?.toLowerCase()) || appMap.get(u.id) || {};

      return {
        id: u.id,
        user_id: u.id,
        email: u.email,
        full_name: meta.full_name || meta.name || app.full_name || "Scholar",
        roll_number: meta.roll_number || app.application_number || "MF-SCH-2024",
        phone: meta.phone || app.mobile_number || "",
        dob: meta.dob || app.dob || "",
        gender: meta.gender || app.gender || "",
        blood_group: meta.blood_group || app.blood_group || "",
        district: meta.district || app.district || "Tamil Nadu",
        college: meta.college_name || app.college_name || "Engineering College",
        degree: meta.degree_branch || app.degree_branch || app.preferred_branch || "Engineering",
        year: meta.current_year || "Active Scholar",
        cgpa: meta.cgpa || "8.5+",
        status: app.status || "selected",
        current_stage: app.current_stage || "admitted",
        created_at: u.created_at,
        academic_records: meta.academic_records || [],
        academic_updated_at: meta.updated_academic_at || null,
        metadata: meta,
      };
    });

    return res.status(200).json({
      success: true,
      count: students.length,
      data: students,
    });
  } catch (err) {
    console.error("getAllStudents error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error fetching students",
      error: err.message,
    });
  }
}

/**
 * @controller  getAllAlumni
 * @route       GET /admin/alumni
 * @desc        Fetch all alumni from Supabase Auth & user_metadata
 */
async function getAllAlumni(req, res) {
  try {
    const { data: { users }, error: authErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 100 });
    if (authErr) {
      throw authErr;
    }

    const alumniUsers = (users || []).filter(
      (u) => u.user_metadata?.role === "alumni" || u.email?.includes("alumni")
    );

    const alumni = alumniUsers.map((u) => {
      const meta = u.user_metadata || {};

      return {
        id: u.id,
        user_id: u.id,
        email: u.email,
        full_name: meta.full_name || meta.name || "Alumni Scholar",
        roll_number: meta.roll_number || "MF-ALUM",
        phone: meta.phone || meta.whatsapp || "",
        whatsapp: meta.whatsapp || "",
        company: meta.company || "Leading Tech Firm",
        designation: meta.designation || "Software Engineer",
        experience_years: meta.experience_years || "3+ Years",
        grad_batch: meta.grad_batch || "Class of 2021",
        grad_college: meta.grad_college || "Anna University",
        grad_degree: meta.grad_degree || "B.E. Computer Science",
        current_city: meta.current_city || "Chennai, Tamil Nadu",
        industry_domain: meta.industry_domain || "Information Technology",
        linkedin: meta.linkedin || "",
        created_at: u.created_at,
        metadata: meta,
      };
    });

    return res.status(200).json({
      success: true,
      count: alumni.length,
      data: alumni,
    });
  } catch (err) {
    console.error("getAllAlumni error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error fetching alumni",
      error: err.message,
    });
  }
}

/**
 * @controller  getStudentAcademicRecords
 * @route       GET /admin/students/:email/academics
 * @desc        Fetch student 8-semester academic records from Supabase
 */
async function getStudentAcademicRecords(req, res) {
  try {
    const emailParam = (req.params.email || "").toLowerCase().trim();
    if (!emailParam) {
      return res.status(400).json({ success: false, message: "Student email is required" });
    }

    const { data: { users }, error: authErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (authErr) throw authErr;

    const user = (users || []).find((u) => u.email?.toLowerCase().trim() === emailParam);
    if (!user) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "No user found with email, returning empty records",
      });
    }

    const records = user.user_metadata?.academic_records || [];
    return res.status(200).json({
      success: true,
      data: records,
    });
  } catch (err) {
    console.error("getStudentAcademicRecords error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error fetching student academic records",
      error: err.message,
    });
  }
}

/**
 * @controller  saveStudentAcademicRecords
 * @route       POST /admin/students/:email/academics
 * @desc        Save or update student 8-semester academic records to Supabase user_metadata
 */
async function saveStudentAcademicRecords(req, res) {
  try {
    const emailParam = (req.params.email || "").toLowerCase().trim();
    const { records, cgpa } = req.body;

    if (!emailParam) {
      return res.status(400).json({ success: false, message: "Student email is required" });
    }

    if (!Array.isArray(records)) {
      return res.status(400).json({ success: false, message: "Records must be an array" });
    }

    const { data: { users }, error: authErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (authErr) throw authErr;

    const user = (users || []).find((u) => u.email?.toLowerCase().trim() === emailParam);
    if (!user) {
      return res.status(404).json({ success: false, message: "Student user not found with email: " + emailParam });
    }

    const currentMetadata = user.user_metadata || {};
    const updatedMetadata = {
      ...currentMetadata,
      academic_records: records,
      ...(cgpa ? { cgpa } : {}),
      updated_academic_at: new Date().toISOString(),
    };

    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: updatedMetadata,
    });

    if (updateErr) throw updateErr;

    return res.status(200).json({
      success: true,
      message: "Academic records saved successfully to database",
      data: records,
    });
  } catch (err) {
    console.error("saveStudentAcademicRecords error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error saving academic records",
      error: err.message,
    });
  }
}

module.exports = {
  getAllStudents,
  getAllAlumni,
  getStudentAcademicRecords,
  saveStudentAcademicRecords,
};

