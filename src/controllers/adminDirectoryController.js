const { buildProfile } = require("./scholarProfileController");
const { memberRole } = require("../services/membershipService");
const { admissionStatus } = require("../models/Application");
const { supabaseAdmin } = require("../config/supabase");

/**
 * @controller  getAllStudents
 * @route       GET /admin/students
 * @desc        Fetch all students from Supabase Auth & Applications database
 */
async function getAllStudents(req, res) {
  try {
    const users = [];
    for (let page = 1; ; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      users.push(...data.users);
      if (data.users.length < 200) break;
    }

    const { data: applications, error: appErr } = await supabaseAdmin.from("applications").select("*");

    if (appErr) throw appErr;
    const appMap = new Map();
    (applications || []).forEach((app) => {
      if (app.user_id) appMap.set(app.user_id, app);
    });

    const studentUsers = (users || []).filter(
      (u) => memberRole(appMap.get(u.id), u.app_metadata?.role) === "student"
    );

    const students = studentUsers.map((u) => {
      const meta = u.user_metadata || {};
      const app = appMap.get(u.id);
      const profile = buildProfile({ user: u, app }).values;

      return {
        id: u.id,
        user_id: u.id,
        email: u.email,
        full_name: profile.fullName, roll_number: profile.rollNumber || profile.applicationNumber,
        phone: profile.mobileNumber, dob: profile.dob, gender: profile.gender, blood_group: profile.bloodGroup,
        district: profile.district, college: profile.collegeName, degree: profile.degreeBranch,
        year: profile.currentYear, cgpa: profile.cgpa, status: admissionStatus(app?.status) || "admitted",
        current_stage: app?.current_stage || "admitted", created_at: u.created_at,
        academic_records: meta.academic_records || [],
        academic_updated_at: meta.updated_academic_at || null,
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

    const { data: rows, error } = await supabaseAdmin.from("applications").select("user_id,status,current_stage,application_number");
    if (error) throw error;
    const memberApps = new Map(rows.map(row => [row.user_id, row]));
    const alumniUsers = (users || []).filter(
      (u) => memberRole(memberApps.get(u.id), u.app_metadata?.role) === "alumni"
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
async function findByEmail(email) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find(item => item.email?.toLowerCase() === email?.toLowerCase());
    if (user || data.users.length < 200) return user;
  }
}

async function getStudentAcademicRecords(req, res) {
  try {
    const user = req.scholar?.user || await findByEmail(req.params.email);
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
    const { records, cgpa } = req.body;
    if (!Array.isArray(records)) return res.status(400).json({ success: false, message: "Invalid academic records." });
    const user = req.scholar?.user || await findByEmail(req.params.email);
    if (!user) {
      return res.status(404).json({ success: false, message: "Student account not found." });
    }

    const updatedMetadata = {
      academic_records: records,
      ...(cgpa !== undefined ? { cgpa } : {}),
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

