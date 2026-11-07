const { ApplicationModel } = require("../models/Application");
const { StorageService } = require("../services/storageService");

/**
 * @controller  getAllApplications
 * @route       GET /admin/applications
 * @desc        Fetch all submitted and draft applications with statistics
 */
async function getAllApplications(req, res) {
  try {
    const { status, search, district } = req.query;

    const rawApplications = await ApplicationModel.getAll({ status, district });

    // Only include incoming new applicants; exclude already enrolled students and alumni
    const applications = (rawApplications || []).filter((app) => {
      const isExistingStudentOrAlumni =
        app.current_stage === "admitted" ||
        app.application_number?.startsWith("MF-SCH-") ||
        app.application_number?.startsWith("MF-ALUM-") ||
        app.email?.includes("@student.") ||
        app.email?.includes("@alumni.");
      return !isExistingStudentOrAlumni;
    });

    let filtered = applications.map((app) => {
      let ext = {};
      if (app.additional_remarks) {
        try {
          if (app.additional_remarks.startsWith("{")) {
            ext = JSON.parse(app.additional_remarks);
          }
        } catch {}
      }
      return {
        ...app,
        ...ext,
        // Resolved Media / Document URLs
        studentPhoto: StorageService.getMediaUrl(ext.studentPhoto || ""),
        document10thMarksheet: StorageService.getMediaUrl(app.document_10th_marksheet || ""),
        document11thMarksheet: StorageService.getMediaUrl(app.document_11th_marksheet || ""),
        document12thMarksheet: StorageService.getMediaUrl(app.document_12th_marksheet || ""),
        documentCommunityCertificate: StorageService.getMediaUrl(ext.documentCommunityCertificate || ""),
        documentIncomeCertificate: StorageService.getMediaUrl(ext.documentIncomeCertificate || ""),
        documentAadhaarCard: StorageService.getMediaUrl(app.document_aadhaar_card || ""),
        documentParentIdProof: StorageService.getMediaUrl(ext.documentParentIdProof || ""),
      };
    });

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
    const application = await ApplicationModel.findById(id);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    let ext = {};
    if (application.additional_remarks) {
      try {
        if (application.additional_remarks.startsWith("{")) {
          ext = JSON.parse(application.additional_remarks);
        }
      } catch {}
    }

    return res.status(200).json({
      success: true,
      data: {
        ...application,
        ...ext,
        // Resolved Media / Document URLs
        studentPhoto: StorageService.getMediaUrl(ext.studentPhoto || ""),
        document10thMarksheet: StorageService.getMediaUrl(application.document_10th_marksheet || ""),
        document11thMarksheet: StorageService.getMediaUrl(application.document_11th_marksheet || ""),
        document12thMarksheet: StorageService.getMediaUrl(application.document_12th_marksheet || ""),
        documentCommunityCertificate: StorageService.getMediaUrl(ext.documentCommunityCertificate || ""),
        documentIncomeCertificate: StorageService.getMediaUrl(ext.documentIncomeCertificate || ""),
        documentAadhaarCard: StorageService.getMediaUrl(application.document_aadhaar_card || ""),
        documentParentIdProof: StorageService.getMediaUrl(ext.documentParentIdProof || ""),
      },
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
 * @desc        Update application status
 */
async function updateApplicationStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

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

    const data = await ApplicationModel.update(id, { status });

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

    const data = await ApplicationModel.update(id, {
      volunteer_suggestion: suggestion || "",
      volunteer_name: volunteer_name || null,
    });

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
 * @desc        Bulk sync volunteer suggestions
 */
async function bulkUpdateVolunteerSuggestions(req, res) {
  try {
    const { suggestions } = req.body;

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
      try {
        if (item.id) {
          await ApplicationModel.update(item.id, {
            volunteer_suggestion: item.suggestion,
            volunteer_name: item.volunteer_name || null,
          });
          updatedCount++;
        }
      } catch (e) {
        errors.push({ item, error: e.message });
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

    // 1. Fetch application to clean up any S3 documents
    const application = await ApplicationModel.findById(id);
    if (application) {
      let ext = {};
      if (application.additional_remarks) {
        try {
          if (application.additional_remarks.startsWith("{")) {
            ext = JSON.parse(application.additional_remarks);
          }
        } catch {}
      }
      const s3KeysToDelete = [
        application.document_10th_marksheet,
        application.document_11th_marksheet,
        application.document_12th_marksheet,
        application.document_aadhaar_card,
        ext.studentPhoto,
        ext.documentCommunityCertificate,
        ext.documentIncomeCertificate,
        ext.documentParentIdProof,
      ].filter((k) => k && typeof k === "string" && !k.startsWith("data:"));

      if (s3KeysToDelete.length > 0) {
        console.log(`[AWS S3] Deleting ${s3KeysToDelete.length} application documents for app ${id}`);
        await StorageService.deleteMultipleMedia(s3KeysToDelete);
      }
    }

    // 2. Delete application record from database
    await ApplicationModel.delete(id);

    return res.status(200).json({
      success: true,
      message: "Application and associated S3 documents deleted successfully",
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
  getAllApplications,
  getApplicationById,
  updateApplicationStatus,
  updateVolunteerSuggestion,
  bulkUpdateVolunteerSuggestions,
  deleteApplication,
};
