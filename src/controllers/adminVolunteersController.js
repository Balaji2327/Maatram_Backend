const { VolunteerModel } = require("../models/Volunteer");

/**
 * @controller  registerVolunteer
 * @route       POST /admin/volunteers/register
 * @desc        Register student or alumni as a foundation volunteer
 */
async function registerVolunteer(req, res) {
  try {
    const { email, name, role, phone, college, department, year_of_study, company, designation, batch, skills } = req.body;

    if (!email || !name) {
      return res.status(400).json({
        success: false,
        message: "Name and email are required for volunteer registration.",
      });
    }

    const volunteer = await VolunteerModel.register({
      name,
      email,
      role: role === "alumni" ? "alumni" : "student",
      phone,
      college,
      department,
      year_of_study,
      company,
      designation,
      batch,
      skills,
    });

    return res.status(201).json({
      success: true,
      message: `Congratulations ${name}! You are successfully registered as a Maatram Foundation volunteer.`,
      data: volunteer,
    });
  } catch (err) {
    console.error("registerVolunteer error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error registering volunteer",
    });
  }
}

/**
 * @controller  getRegisteredVolunteers
 * @route       GET /admin/volunteers/list
 * @desc        Get all registered volunteers
 */
async function getRegisteredVolunteers(req, res) {
  try {
    const volunteers = await VolunteerModel.getAll();
    return res.status(200).json({
      success: true,
      data: volunteers,
      count: volunteers.length,
    });
  } catch (err) {
    console.error("getRegisteredVolunteers error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error fetching registered volunteers",
    });
  }
}

/**
 * @controller  checkVolunteerStatus
 * @route       GET /admin/volunteers/status/:email
 * @desc        Check if user is already registered as a volunteer
 */
async function checkVolunteerStatus(req, res) {
  try {
    const { email } = req.params;
    const volunteer = await VolunteerModel.getByEmail(email);
    return res.status(200).json({
      success: true,
      isRegistered: !!volunteer,
      data: volunteer || null,
    });
  } catch (err) {
    console.error("checkVolunteerStatus error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error checking volunteer status",
    });
  }
}

module.exports = {
  registerVolunteer,
  getRegisteredVolunteers,
  checkVolunteerStatus,
};
