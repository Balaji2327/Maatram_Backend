const { supabaseAdmin } = require("../config/supabase");

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@maatram.org";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin@maatram2026";

/**
 * @controller  adminLogin
 * @route       POST /admin/login
 * @desc        Authenticate admin management credentials
 */
async function adminLogin(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Admin email/username and password are required",
      });
    }

    const cleanInput = email.trim().toLowerCase();
    const isEmailMatch =
      cleanInput === ADMIN_EMAIL.toLowerCase() ||
      cleanInput === "admin" ||
      cleanInput === "admin@maatram.org";
    const isPasswordMatch = password.trim() === ADMIN_PASSWORD;

    if (!isEmailMatch || !isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin credentials. Please check your email and password.",
      });
    }

    const adminUser = {
      id: "maatram-admin-01",
      email: ADMIN_EMAIL,
      name: "Maatram Administrator",
      role: "admin",
      permissions: ["view_all", "update_status", "export_data"],
    };

    const adminToken = "adm_token_" + Buffer.from(Date.now() + ":" + ADMIN_EMAIL).toString("base64");

    return res.status(200).json({
      success: true,
      message: "Admin login successful",
      adminToken,
      user: adminUser,
    });
  } catch (err) {
    console.error("adminLogin error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error during admin authentication",
      error: err.message,
    });
  }
}

/**
 * @controller  getAllApplications
 * @route       GET /admin/applications
 * @desc        Fetch all submitted and draft applications with statistics
 */
async function getAllApplications(req, res) {
  try {
    const { status, search, district, sortBy = "created_at" } = req.query;

    let query = supabaseAdmin
      .from("applications")
      .select("*")
      .order("created_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (district && district !== "all") {
      query = query.ilike("district", `%${district}%`);
    }

    const { data: applications, error } = await query;

    if (error) {
      console.error("Supabase fetch all applications error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch applications from database",
        error: error.message,
      });
    }

    let filtered = applications || [];

    // Ensure all applications have MF-2025-001 format
    let maxSequence = 0;
    filtered.forEach((app) => {
      if (app.application_number && app.application_number.startsWith("MF-2025-")) {
        const parts = app.application_number.split("-");
        const seq = parseInt(parts[2], 10);
        if (!isNaN(seq) && seq > maxSequence) maxSequence = seq;
      }
    });

    for (let i = 0; i < filtered.length; i++) {
      const app = filtered[i];
      if (!app.application_number || !app.application_number.startsWith("MF-2025-")) {
        maxSequence++;
        const newAppNum = `MF-2025-${String(maxSequence).padStart(3, "0")}`;
        app.application_number = newAppNum;

        // Persist to Supabase database
        supabaseAdmin
          .from("applications")
          .update({ application_number: newAppNum })
          .eq("id", app.id)
          .then(() => {})
          .catch((e) => console.warn(`Failed to update application_number for ${app.id}:`, e.message));
      }
    }

    // Search query filter (Name, Email, Mobile, Application Number, District)
    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      filtered = filtered.filter((app) => {
        return (
          app.full_name?.toLowerCase().includes(s) ||
          app.application_number?.toLowerCase().includes(s) ||
          app.mobile_number?.includes(s) ||
          app.email?.toLowerCase().includes(s) ||
          app.district?.toLowerCase().includes(s) ||
          app.preferred_branch?.toLowerCase().includes(s)
        );
      });
    }

    // Compute statistics across all applications
    const stats = {
      total: applications ? applications.length : 0,
      submitted: applications ? applications.filter((a) => a.status === "submitted").length : 0,
      draft: applications ? applications.filter((a) => a.status === "draft").length : 0,
      under_review: applications
        ? applications.filter((a) => a.status === "under_review" || a.status === "telephonic_done")
            .length
        : 0,
      shortlisted: applications
        ? applications.filter((a) => a.status === "shortlisted" || a.status === "home_visit_done")
            .length
        : 0,
      selected: applications
        ? applications.filter((a) => a.status === "selected" || a.status === "scholarship_awarded")
            .length
        : 0,
      rejected: applications ? applications.filter((a) => a.status === "rejected").length : 0,
    };

    return res.status(200).json({
      success: true,
      stats,
      count: filtered.length,
      data: filtered,
    });
  } catch (err) {
    console.error("getAllApplications error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error fetching applications",
      error: err.message,
    });
  }
}

/**
 * @controller  getApplicationById
 * @route       GET /admin/applications/:id
 * @desc        Fetch complete details of a single student application
 */
async function getApplicationById(req, res) {
  try {
    const { id } = req.params;

    const { data: application, error } = await supabaseAdmin
      .from("applications")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
        error: error?.message,
      });
    }

    return res.status(200).json({
      success: true,
      data: application,
    });
  } catch (err) {
    console.error("getApplicationById error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error fetching application details",
      error: err.message,
    });
  }
}

/**
 * @controller  updateApplicationStatus
 * @route       PATCH /admin/applications/:id/status
 * @desc        Update application status (submitted, under_review, shortlisted, selected, rejected)
 */
async function updateApplicationStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const allowedStatuses = [
      "draft",
      "submitted",
      "under_review",
      "telephonic_done",
      "home_visit_done",
      "shortlisted",
      "selected",
      "scholarship_awarded",
      "rejected",
    ];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed values: ${allowedStatuses.join(", ")}`,
      });
    }

    const updatePayload = {
      status,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("applications")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to update application status",
        error: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Application status updated to ${status}`,
      data,
    });
  } catch (err) {
    console.error("updateApplicationStatus error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error updating status",
      error: err.message,
    });
  }
}

/**
 * @controller  updateVolunteerSuggestion
 * @route       PATCH /admin/applications/:id/volunteer-suggestion
 * @desc        Update volunteer suggestion note for a student
 */
async function updateVolunteerSuggestion(req, res) {
  try {
    const { id } = req.params;
    const { suggestion, volunteer_name } = req.body;

    const updatePayload = {
      volunteer_suggestion: suggestion || "",
      volunteer_name: volunteer_name || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("applications")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to update volunteer suggestion",
        error: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Volunteer suggestion saved successfully",
      data,
    });
  } catch (err) {
    console.error("updateVolunteerSuggestion error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error saving volunteer suggestion",
      error: err.message,
    });
  }
}

/**
 * @controller  bulkUpdateVolunteerSuggestions
 * @route       POST /admin/applications/bulk-volunteer-suggestions
 * @desc        Bulk sync volunteer suggestions from Google Sheets / Excel
 */
async function bulkUpdateVolunteerSuggestions(req, res) {
  try {
    const { suggestions } = req.body; // Array of { id or application_number, suggestion, volunteer_name }

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No suggestions provided for sync",
      });
    }

    let updatedCount = 0;
    const errors = [];

    for (const item of suggestions) {
      if (!item.suggestion && item.suggestion !== "") continue;

      let query = supabaseAdmin.from("applications").update({
        volunteer_suggestion: item.suggestion,
        volunteer_name: item.volunteer_name || null,
        updated_at: new Date().toISOString(),
      });

      if (item.id) {
        query = query.eq("id", item.id);
      } else if (item.application_number) {
        query = query.eq("application_number", item.application_number);
      } else {
        continue;
      }

      const { error } = await query;
      if (error) {
        errors.push({ item, error: error.message });
      } else {
        updatedCount++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Successfully synchronized ${updatedCount} volunteer suggestions`,
      updatedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("bulkUpdateVolunteerSuggestions error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error syncing volunteer suggestions",
      error: err.message,
    });
  }
}

/**
 * @controller  deleteApplication
 * @route       DELETE /admin/applications/:id
 * @desc        Delete an application record
 */
async function deleteApplication(req, res) {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from("applications")
      .delete()
      .eq("id", id);

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to delete application",
        error: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Application deleted successfully",
    });
  } catch (err) {
    console.error("deleteApplication error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error deleting application",
      error: err.message,
    });
  }
}

module.exports = {
  adminLogin,
  getAllApplications,
  getApplicationById,
  updateApplicationStatus,
  updateVolunteerSuggestion,
  bulkUpdateVolunteerSuggestions,
  deleteApplication,
};
