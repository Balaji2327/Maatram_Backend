const { ApplicationModel, admissionStatus, familyAnnualIncome } = require("../models/Application");
const { StorageService } = require("../services/storageService");
const { EmailService } = require("../services/emailService");
const { GoogleMeetService } = require("../services/googleMeetService");

const photoSlots = ["front_view_home", "inside_home", "furniture", "with_student", "backward"];

function storedPhotos(app, remarks) {
  const nested = remarks.physical_verification_photos || remarks.photos || app.physical_verification_photos || app.photos || {};
  return Object.fromEntries(photoSlots.map(slot => {
    const alias = slot.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    return [slot, remarks[slot] || remarks[alias] || nested[slot] || nested[alias] || app[slot] || app[alias] || ""];
  }));
}

function photoKey(value) {
  if (typeof value !== "string") return "";
  const match = value.match(/(?:^|\/admin\/media\/|\.amazonaws\.com\/)(physical_verification\/[\w.-]+)$/);
  return match?.[1] || "";
}

function displayPhotos(photos) {
  return Object.fromEntries(photoSlots.map(slot => {
    const value = photos[slot];
    return [slot, value.startsWith("data:image/") ? value : StorageService.getMediaUrl(photoKey(value) || value)];
  }));
}

/**
 * @controller  getAllApplications
 * @route       GET /admin/applications
 * @desc        Fetch all submitted and draft applications with statistics
 */
async function getAllApplications(req, res) {
  try {
    const { status, search, district } = req.query;

    const rawApplications = await ApplicationModel.getAll({ status, district });

    // Only include incoming new applicants who have actually filled/submitted their application form.
    // Exclude:
    // 1. Enrolled students / alumni
    // 2. Fresh signups who only have an empty registration placeholder (status is draft without submitted form details)
    const applications = (rawApplications || []).filter((app) => {
      const isExistingStudentOrAlumni =
        app.current_stage === "admitted" ||
        app.application_number?.startsWith("MF-SCH-") ||
        app.application_number?.startsWith("MF-ALUM-") ||
        app.email?.includes("@student.") ||
        app.email?.includes("@alumni.");
      if (isExistingStudentOrAlumni) return false;

      // If status is submitted, under_review, shortlisted, selected, etc., they definitely filled it
      if (app.status && app.status !== "draft") return true;

      // If status is "draft", only show if the student actually started filling the form
      // (e.g. entered school, marks, degree, parent name, district, or address)
      const hasFilledDetails = Boolean(
        app.twelfth_school_name ||
        app.tenth_school_name ||
        app.father_name ||
        app.mother_name ||
        app.preferred_degree ||
        app.twelfth_cutoff ||
        app.annual_income ||
        app.family_annual_income ||
        (app.district && app.district.trim() !== "") ||
        (app.address && app.address.trim() !== "")
      );

      return hasFilledDetails;
    });

    let filtered = applications.map((app) => {
      let ext = {};
      if (app.additional_remarks) {
        if (typeof app.additional_remarks === "object" && app.additional_remarks !== null) {
          ext = { ...app.additional_remarks };
        } else if (typeof app.additional_remarks === "string") {
          try {
            ext = JSON.parse(app.additional_remarks.trim());
          } catch {}
        }
      }

      const resolvedPhotos = displayPhotos(storedPhotos(app, ext));

      return {
        ...app,
        ...ext,
        family_annual_income: familyAnnualIncome(app, ext),
        whyNeedSupport: ext.whyNeedSupport || app.whyNeedSupport || ext.why_scholarship || app.why_scholarship,
        volunteer_suggestion: ext.volunteer_suggestion || app.volunteer_suggestion || ext.tele_volunteer_suggestion || "",
        volunteer_name: ext.volunteer_name || app.volunteer_name || ext.tele_volunteer_name || "",
        tele_volunteer_name: ext.tele_volunteer_name || ext.volunteer_name || app.volunteer_name || "",
        tele_volunteer_email: ext.tele_volunteer_email || "",
        tele_volunteer_phone: ext.tele_volunteer_phone || "",
        tele_volunteer_role: ext.tele_volunteer_role || "",
        tele_volunteer_affiliation: ext.tele_volunteer_affiliation || "",
        tele_volunteer_suggestion: ext.tele_volunteer_suggestion || ext.volunteer_suggestion || app.volunteer_suggestion || "",
        physical_volunteer_name: ext.physical_volunteer_name || "",
        physical_volunteer_email: ext.physical_volunteer_email || "",
        physical_volunteer_phone: ext.physical_volunteer_phone || "",
        physical_volunteer_role: ext.physical_volunteer_role || "",
        physical_volunteer_affiliation: ext.physical_volunteer_affiliation || "",
        physical_volunteer_suggestion: ext.physical_volunteer_suggestion || "",
        physical_verification_notes: ext.physical_verification_notes || "",
        physical_student_description: ext.physical_student_description || ext.student_description || "",
        physical_verification_photos: resolvedPhotos,
        front_view_home: resolvedPhotos.front_view_home,
        inside_home: resolvedPhotos.inside_home,
        furniture: resolvedPhotos.furniture,
        with_student: resolvedPhotos.with_student,
        backward: resolvedPhotos.backward,
        // Video Interview details
        video_interview_link: ext.video_interview_link || ext.google_meet_link || ext.meet_link || "",
        video_interview_time: ext.video_interview_time || "",
        video_interview_event_id: ext.video_interview_event_id || "",
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

    if (req.user && !req.admin) {
      const email = req.user.email?.toLowerCase();
      filtered = filtered.filter(app => email && [app.tele_volunteer_email, app.physical_volunteer_email].some(value => value?.toLowerCase() === email));
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
        ? applications.filter((a) => a.status === "selected")
            .length
        : 0,
      rejected: applications ? applications.filter((a) => a.status === "rejected").length : 0,
    };

    return res.status(200).json({
      success: true,
      stats: req.admin ? stats : undefined,
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
      if (typeof application.additional_remarks === "object" && application.additional_remarks !== null) {
        ext = { ...application.additional_remarks };
      } else if (typeof application.additional_remarks === "string") {
        try {
          ext = JSON.parse(application.additional_remarks.trim());
        } catch {}
      }
    }

    const resolvedPhotos = displayPhotos(storedPhotos(application, ext));

    return res.status(200).json({
      success: true,
      data: {
        ...application,
        ...ext,
        family_annual_income: familyAnnualIncome(application, ext),
        whyNeedSupport: ext.whyNeedSupport || application.whyNeedSupport || ext.why_scholarship || application.why_scholarship,
        volunteer_suggestion: ext.volunteer_suggestion || application.volunteer_suggestion || ext.tele_volunteer_suggestion || "",
        volunteer_name: ext.volunteer_name || application.volunteer_name || ext.tele_volunteer_name || "",
        tele_volunteer_name: ext.tele_volunteer_name || ext.volunteer_name || application.volunteer_name || "",
        tele_volunteer_email: ext.tele_volunteer_email || "",
        tele_volunteer_phone: ext.tele_volunteer_phone || "",
        tele_volunteer_role: ext.tele_volunteer_role || "",
        tele_volunteer_affiliation: ext.tele_volunteer_affiliation || "",
        tele_volunteer_suggestion: ext.tele_volunteer_suggestion || ext.volunteer_suggestion || application.volunteer_suggestion || "",
        physical_volunteer_name: ext.physical_volunteer_name || "",
        physical_volunteer_email: ext.physical_volunteer_email || "",
        physical_volunteer_phone: ext.physical_volunteer_phone || "",
        physical_volunteer_role: ext.physical_volunteer_role || "",
        physical_volunteer_affiliation: ext.physical_volunteer_affiliation || "",
        physical_volunteer_suggestion: ext.physical_volunteer_suggestion || "",
        physical_verification_notes: ext.physical_verification_notes || "",
        physical_student_description: ext.physical_student_description || ext.student_description || "",
        physical_verification_photos: resolvedPhotos,
        front_view_home: resolvedPhotos.front_view_home,
        inside_home: resolvedPhotos.inside_home,
        furniture: resolvedPhotos.furniture,
        with_student: resolvedPhotos.with_student,
        backward: resolvedPhotos.backward,
        // Video Interview details
        video_interview_link: ext.video_interview_link || ext.google_meet_link || ext.meet_link || "",
        video_interview_time: ext.video_interview_time || "",
        video_interview_event_id: ext.video_interview_event_id || "",
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
    const status = admissionStatus(req.body.status);
    const { reason, email: directEmail, name: directName, rejectionStage: directRejectionStage } = req.body;

    const allowedStatuses = [
      "draft",
      "submitted",
      "under_review",
      "telephonic_done",
      "televerification_done",
      "physical_verification_in_progress",
      "physical_verification_done",
      "home_visit_done",
      "video_interview_in_progress",
      "video_interview_done",
      "shortlisted",
      "direct_interview_in_progress",
      "direct_interview_done",
      "selected",
      "rejected",
    ];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed values: ${allowedStatuses.join(", ")}`,
      });
    }

    const entersDirectInterview = ["video_interview_done", "shortlisted", "direct_interview_in_progress"].includes(status);
    const location = typeof req.body.directInterviewLocation === "string" ? req.body.directInterviewLocation.trim() : "";

    // Load existing record for metadata and email notification
    let existing = null;
    try {
      existing = await ApplicationModel.findById(id);
    } catch (eFind) {
      if (entersDirectInterview) throw eFind;
      console.warn("Could not fetch existing application:", eFind.message);
    }

    const phaseOf = value => [
      ["submitted", "under_review"],
      ["telephonic_done", "televerification_done", "physical_verification_in_progress"],
      ["physical_verification_done", "home_visit_done", "video_interview_in_progress"],
      ["video_interview_done", "shortlisted", "direct_interview_in_progress"],
      ["direct_interview_done", "selected"]
    ].findIndex(group => group.includes(value));
    const from = phaseOf(existing?.status);
    const to = phaseOf(status);
    if (to > 0 && (from < 0 || to > from + 1)) {
      return res.status(409).json({ success: false, message: "Complete the current verification stage before advancing." });
    }
    if (from === 1 && to === 2) {
      let remarks = existing.additional_remarks || {};
      if (typeof remarks === "string") {
        try { remarks = JSON.parse(remarks); } catch { remarks = {}; }
      }
      const photos = storedPhotos(existing, remarks);
      if (!photoSlots.every(slot => photoKey(photos[slot])) || !remarks.physical_volunteer_suggestion?.trim() || !remarks.physical_student_description?.trim()) {
        return res.status(409).json({ success: false, message: "Complete the physical verification report and all five photos before advancing." });
      }
    }

    if (status === "selected" &&
        !["video_interview_done", "shortlisted", "direct_interview_in_progress", "direct_interview_done", "selected"].includes(existing?.status)) {
      return res.status(409).json({ success: false, message: "Complete the final direct interview before approving admission." });
    }

    // Automatically synchronize current_stage and stage_status based on updated status across the 4 phases:
    // First phase: Televerification
    // Second phase: Physical Verification
    // Third phase: Video Call Interview
    // Fourth phase: Direct Interview (Final Stage)
    let current_stage = "Phase 1: Televerification";
    let stage_status = "In Progress";
    if (status === "draft") {
      current_stage = "Draft";
      stage_status = "Not Submitted";
    } else if (status === "submitted") {
      current_stage = "Phase 1: Televerification";
      stage_status = "Application Submitted";
    } else if (status === "under_review") {
      current_stage = "Phase 1: Televerification";
      stage_status = "Televerification In Progress";
    } else if (status === "telephonic_done" || status === "televerification_done") {
      current_stage = "Phase 2: Physical Verification";
      stage_status = "Waiting for Physical Verification";
    } else if (status === "physical_verification_in_progress") {
      current_stage = "Phase 2: Physical Verification";
      stage_status = "Physical Verification In Progress";
    } else if (status === "physical_verification_done" || status === "home_visit_done") {
      current_stage = "Phase 3: Video Call Interview";
      stage_status = "Waiting for Video Call Interview";
    } else if (status === "video_interview_in_progress") {
      current_stage = "Phase 3: Video Call Interview";
      stage_status = "Video Call Interview In Progress";
    } else if (status === "video_interview_done" || status === "shortlisted") {
      current_stage = "Phase 4: Direct Interview";
      stage_status = "Waiting for Direct Interview (Final Stage)";
    } else if (status === "direct_interview_in_progress") {
      current_stage = "Phase 4: Direct Interview";
      stage_status = "Direct Interview In Progress";
    } else if (status === "direct_interview_done") {
      current_stage = "Final Selection";
      stage_status = "Direct Interview Cleared";
    } else if (status === "selected") {
      current_stage = "Final Selection";
      stage_status = "Admission Confirmed";
    } else if (status === "rejected") {
      current_stage = "Closed";
      stage_status = "Rejected";
    }

    const updatePayload = {
      status,
      current_stage,
      stage_status,
    };

    if (entersDirectInterview) {
      if (!existing) return res.status(404).json({ success: false, message: "Application not found." });
      let remarks = existing.additional_remarks || {};
      if (typeof remarks === "string") {
        try { remarks = JSON.parse(remarks); }
        catch { remarks = { customRemarks: existing.additional_remarks }; }
      }
      if (!remarks || typeof remarks !== "object" || Array.isArray(remarks)) remarks = { customRemarks: existing.additional_remarks };
      const venue = location || remarks.direct_interview_location;
      if (typeof venue !== "string" || !venue.trim()) {
        return res.status(400).json({ success: false, message: "Enter the direct interview location." });
      }
      updatePayload.additional_remarks = JSON.stringify({ ...remarks, direct_interview_location: venue.trim() });
    }

    // If status is rejected, persist the rejection reason
    if (status === "rejected") {
      try {
        let additionalRemarks = {};
        if (typeof existing?.additional_remarks === "string") {
          try {
            additionalRemarks = JSON.parse(existing.additional_remarks || "{}");
          } catch {
            additionalRemarks = { customRemarks: existing.additional_remarks };
          }
        } else if (existing?.additional_remarks && typeof existing.additional_remarks === "object") {
          additionalRemarks = { ...existing.additional_remarks };
        }
        const rejectionText = reason || "Application not shortlisted based on verification criteria.";
        additionalRemarks.rejectionReason = rejectionText;

        // Determine which phase was rejected (1: Initial, 2: Televerification, 3: Physical Verification, 4: Video Call, 5: Direct Interview)
        const currentAppStatus = existing?.status || "";
        let computedRejectionStage = 1;
        if (
          currentAppStatus === "direct_interview_done" ||
          currentAppStatus === "direct_interview_in_progress"
        ) {
          computedRejectionStage = 5;
        } else if (
          currentAppStatus === "video_interview_done" ||
          currentAppStatus === "video_interview_in_progress" ||
          currentAppStatus === "shortlisted"
        ) {
          computedRejectionStage = 4;
        } else if (
          currentAppStatus === "physical_verification_done" ||
          currentAppStatus === "physical_verification_in_progress" ||
          currentAppStatus === "home_visit_done"
        ) {
          computedRejectionStage = 3;
        } else if (
          currentAppStatus === "telephonic_done" ||
          currentAppStatus === "televerification_done" ||
          currentAppStatus === "under_review" ||
          additionalRemarks.volunteer_suggestion ||
          additionalRemarks.volunteer_name ||
          existing?.volunteer_name
        ) {
          computedRejectionStage = 2;
        } else {
          computedRejectionStage = 1;
        }

        additionalRemarks.rejectionStage = directRejectionStage || computedRejectionStage;
        updatePayload.additional_remarks = JSON.stringify(additionalRemarks);
      } catch (errRemarks) {
        console.warn("Could not attach rejectionReason to additional_remarks:", errRemarks.message);
      }
    }

    // Automatically generate Google Meet link when advancing to Phase 3 (Video Call Interview)
    if (status === "physical_verification_done" || status === "home_visit_done" || status === "video_interview_in_progress") {
      try {
        let additionalRemarks = {};
        if (typeof existing?.additional_remarks === "string") {
          try {
            additionalRemarks = JSON.parse(existing.additional_remarks || "{}");
          } catch {
            additionalRemarks = { customRemarks: existing.additional_remarks };
          }
        } else if (existing?.additional_remarks && typeof existing.additional_remarks === "object") {
          additionalRemarks = { ...existing.additional_remarks };
        }

        // Only generate if not already generated, or if specifically moving to Phase 3
        if (!additionalRemarks.video_interview_link && !additionalRemarks.google_meet_link) {
          const studentName = existing?.full_name || directName || "Applicant";
          const studentEmail = existing?.email || directEmail || "";
          const applicationNumber = existing?.application_number || "MF-2025-APP";

          const meetingResult = await GoogleMeetService.createMeeting({
            studentName,
            studentEmail,
            applicationNumber,
          });

          if (meetingResult?.meetLink) {
            additionalRemarks.video_interview_link = meetingResult.meetLink;
            additionalRemarks.google_meet_link = meetingResult.meetLink;
            additionalRemarks.video_interview_time = meetingResult.scheduledTime;
            additionalRemarks.video_interview_event_id = meetingResult.eventId;
            updatePayload.additional_remarks = JSON.stringify(additionalRemarks);
            console.log(`[Phase 3 Auto-Meet] Generated meet link for application ${id}: ${meetingResult.meetLink}`);
          }
        }
      } catch (errMeet) {
        console.error("[Phase 3 Auto-Meet] Error generating meet link:", errMeet.message);
      }
    }

    const data = await ApplicationModel.update(id, updatePayload, entersDirectInterview ? existing.updated_at : undefined);
    if (entersDirectInterview && !data) {
      return res.status(409).json({ success: false, message: "The application changed. Reopen it and try again." });
    }

    // If application was rejected, send notification email to student via Resend
    if (status === "rejected") {
      const studentEmail = existing?.email || directEmail || data?.email;
      const studentName = existing?.full_name || directName || data?.full_name || "Applicant";
      const appNumber = existing?.application_number || data?.application_number || "MF-2025-APP";

      if (studentEmail) {
        EmailService.sendApplicationRejectionEmail({
          toEmail: studentEmail,
          studentName,
          applicationNumber: appNumber,
          rejectionReason: reason || "",
        }).catch((emailErr) => {
          console.error(`Failed to send rejection email to ${studentEmail}:`, emailErr.message);
        });
      } else {
        console.warn(`⚠️ No email found for application ${id}; rejection email skipped.`);
      }
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
 * @desc        Update volunteer suggestion note for a student (Tele or Physical)
 */
async function updateVolunteerSuggestion(req, res) {
  try {
    const { id } = req.params;
    const suggestion =
      req.body.suggestion !== undefined
        ? req.body.suggestion
        : req.body.volunteer_suggestion;
    const volunteer_name =
      req.body.volunteer_name !== undefined
        ? req.body.volunteer_name
        : (req.body.volunteerName || req.body.volunteer_name);
    const phase = req.body.phase || "tele"; // "tele" or "physical"
    const volunteer_email = req.body.volunteer_email || req.body.email;
    const volunteer_phone = req.body.volunteer_phone || req.body.phone;
    const volunteer_role = req.body.volunteer_role || req.body.role;
    const volunteer_affiliation = req.body.volunteer_affiliation || req.body.affiliation;

    const existing = await ApplicationModel.findById(id);
    if (!existing) return res.status(404).json({ success: false, message: "Application not found" });
    const targetId = existing.id;
    const uploadedKeys = [];
    const replacedKeys = [];

    let additionalRemarks = {};
    if (typeof existing?.additional_remarks === "string") {
      try {
        additionalRemarks = JSON.parse(existing.additional_remarks.trim() || "{}");
      } catch {
        additionalRemarks = { customRemarks: existing.additional_remarks };
      }
    } else if (existing?.additional_remarks && typeof existing.additional_remarks === "object") {
      additionalRemarks = { ...existing.additional_remarks };
    }

    if (phase === "physical") {
      if (suggestion !== undefined) {
        additionalRemarks.physical_volunteer_suggestion = suggestion;
      }
      if (volunteer_name !== undefined) {
        additionalRemarks.physical_volunteer_name = volunteer_name;
      }
      if (volunteer_email !== undefined) {
        additionalRemarks.physical_volunteer_email = volunteer_email;
      }
      if (volunteer_phone !== undefined) {
        additionalRemarks.physical_volunteer_phone = volunteer_phone;
      }
      if (volunteer_role !== undefined) {
        additionalRemarks.physical_volunteer_role = volunteer_role;
      }
      if (volunteer_affiliation !== undefined) {
        additionalRemarks.physical_volunteer_affiliation = volunteer_affiliation;
      }

      const studentDesc =
        req.body.student_description !== undefined
          ? req.body.student_description
          : req.body.physical_student_description;
      if (studentDesc !== undefined) {
        additionalRemarks.physical_student_description = studentDesc;
        additionalRemarks.student_description = studentDesc;
      }

      if (typeof suggestion !== "string" || !suggestion.trim() || typeof studentDesc !== "string" || !studentDesc.trim()) {
        return res.status(400).json({ success: false, message: "Enter the student description and final recommendation." });
      }

      const previous = storedPhotos(existing, additionalRemarks);
      const incoming = req.body.photos || req.body.physical_verification_photos || {};
      const photos = {};
      for (const slot of photoSlots) {
        const alias = slot.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        const value = req.body[slot] ?? incoming[slot] ?? incoming[alias] ?? previous[slot];
        if (typeof value === "string" && /^data:image\/(?:jpeg|png|webp|gif|avif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(value)) {
          photos[slot] = value;
        } else if (photoKey(value) && photoKey(value) === photoKey(previous[slot])) {
          photos[slot] = photoKey(value);
        } else {
          return res.status(400).json({ success: false, message: `Upload the required photo for ${slot.replace(/_/g, " ")}.` });
        }
      }

      try {
        for (const slot of photoSlots) {
          if (!photos[slot].startsWith("data:")) continue;
          photos[slot] = await StorageService.uploadMedia(photos[slot], "physical_verification", `${targetId}_${slot}`);
          uploadedKeys.push(photos[slot]);
          if (photoKey(previous[slot])) replacedKeys.push(photoKey(previous[slot]));
        }
      } catch (error) {
        await StorageService.deleteMultipleMedia(uploadedKeys);
        throw error;
      }
      Object.assign(additionalRemarks, photos, { physical_verification_photos: photos });
      additionalRemarks.physical_verification_completed_at = new Date().toISOString();
    } else {
      if (suggestion !== undefined) {
        additionalRemarks.volunteer_suggestion = suggestion;
        additionalRemarks.tele_volunteer_suggestion = suggestion;
      }
      if (volunteer_name !== undefined) {
        additionalRemarks.volunteer_name = volunteer_name;
        additionalRemarks.tele_volunteer_name = volunteer_name;
      }
      if (volunteer_email !== undefined) {
        additionalRemarks.tele_volunteer_email = volunteer_email;
      }
      if (volunteer_phone !== undefined) {
        additionalRemarks.tele_volunteer_phone = volunteer_phone;
      }
      if (volunteer_role !== undefined) {
        additionalRemarks.tele_volunteer_role = volunteer_role;
      }
      if (volunteer_affiliation !== undefined) {
        additionalRemarks.tele_volunteer_affiliation = volunteer_affiliation;
      }
    }

    const updatePayload = {
      additional_remarks: JSON.stringify(additionalRemarks),
      ...(phase === "physical"
        ? {
            physical_volunteer_suggestion: suggestion,
            physical_volunteer_name: volunteer_name,
            physical_volunteer_email: volunteer_email,
            physical_volunteer_phone: volunteer_phone,
            physical_volunteer_role: volunteer_role,
            physical_volunteer_affiliation: volunteer_affiliation,
          }
        : {
            volunteer_suggestion: suggestion,
            volunteer_name: volunteer_name,
            tele_volunteer_suggestion: suggestion,
            tele_volunteer_name: volunteer_name,
            tele_volunteer_email: volunteer_email,
            tele_volunteer_phone: volunteer_phone,
            tele_volunteer_role: volunteer_role,
            tele_volunteer_affiliation: volunteer_affiliation,
          }),
    };

    const data = await ApplicationModel.update(targetId, updatePayload, phase === "physical" ? existing.updated_at : undefined);
    if (!data) {
      await StorageService.deleteMultipleMedia(uploadedKeys);
      return res.status(409).json({ success: false, message: "The application changed. Reopen the report and try again." });
    }
    if (phase === "physical") {
      const retained = Object.values(additionalRemarks.physical_verification_photos);
      await StorageService.deleteMultipleMedia(replacedKeys.filter(key => !retained.includes(key)));
    }

    return res.status(200).json({
      success: true,
      message: `${phase === "physical" ? "Physical" : "Telephonic"} volunteer suggestion saved successfully`,
      data: {
        ...(data || existing || {}),
        ...additionalRemarks,
        volunteer_suggestion: additionalRemarks.volunteer_suggestion,
        volunteer_name: additionalRemarks.volunteer_name,
        tele_volunteer_suggestion: additionalRemarks.tele_volunteer_suggestion,
        tele_volunteer_name: additionalRemarks.tele_volunteer_name,
        physical_volunteer_suggestion: additionalRemarks.physical_volunteer_suggestion,
        physical_volunteer_name: additionalRemarks.physical_volunteer_name,
        physical_student_description: additionalRemarks.physical_student_description,
        physical_verification_photos: additionalRemarks.physical_verification_photos,
        front_view_home: additionalRemarks.front_view_home,
        inside_home: additionalRemarks.inside_home,
        furniture: additionalRemarks.furniture,
        with_student: additionalRemarks.with_student,
        backward: additionalRemarks.backward,
      },
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
 * @controller  assignVolunteer
 * @route       PATCH /admin/applications/:id/assign-volunteer
 * @desc        Assign or reassign volunteer for Televerification or Physical Verification
 */
async function assignVolunteer(req, res) {
  try {
    const { id } = req.params;
    const {
      phase = "tele", // "tele" or "physical"
      name,
      email,
      phone,
      role,
      affiliation,
      eventId,
      eventTitle,
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Volunteer name is required for assignment",
      });
    }

    let existing = null;
    try {
      existing = await ApplicationModel.findById(id);
    } catch (eFind) {
      console.warn("Could not fetch existing application:", eFind.message);
    }

    const targetId = existing?.id || id;
    let additionalRemarks = {};
    if (typeof existing?.additional_remarks === "string") {
      try {
        additionalRemarks = JSON.parse(existing.additional_remarks.trim() || "{}");
      } catch {
        additionalRemarks = { customRemarks: existing.additional_remarks };
      }
    } else if (existing?.additional_remarks && typeof existing.additional_remarks === "object") {
      additionalRemarks = { ...existing.additional_remarks };
    }

    const updatePayload = {};

    if (phase === "physical") {
      if (!["televerification_done","telephonic_done","physical_verification_in_progress"].includes(existing?.status)) return res.status(409).json({ success: false, message: "Complete televerification before assigning a home visit." });
      additionalRemarks.physical_volunteer_name = name;
      if (email) additionalRemarks.physical_volunteer_email = email;
      if (phone) additionalRemarks.physical_volunteer_phone = phone;
      if (role) additionalRemarks.physical_volunteer_role = role;
      if (affiliation) additionalRemarks.physical_volunteer_affiliation = affiliation;
      if (eventId) {
        additionalRemarks.physical_event_id = eventId;
        additionalRemarks.event_id = eventId;
      }
      if (eventTitle) {
        additionalRemarks.physical_event_title = eventTitle;
        additionalRemarks.event_title = eventTitle;
      }

      updatePayload.status = "physical_verification_in_progress";
      updatePayload.current_stage = "Phase 2: Physical Verification";
      updatePayload.stage_status = "Physical Verification In Progress";
      updatePayload.physical_volunteer_name = name;
      updatePayload.physical_volunteer_email = email;
      updatePayload.physical_volunteer_phone = phone;
      updatePayload.physical_volunteer_role = role;
      updatePayload.physical_volunteer_affiliation = affiliation;
    } else {
      additionalRemarks.volunteer_name = name;
      additionalRemarks.tele_volunteer_name = name;
      if (email) additionalRemarks.tele_volunteer_email = email;
      if (phone) additionalRemarks.tele_volunteer_phone = phone;
      if (role) additionalRemarks.tele_volunteer_role = role;
      if (affiliation) additionalRemarks.tele_volunteer_affiliation = affiliation;
      if (eventId) {
        additionalRemarks.tele_event_id = eventId;
        additionalRemarks.event_id = eventId;
      }
      if (eventTitle) {
        additionalRemarks.tele_event_title = eventTitle;
        additionalRemarks.event_title = eventTitle;
      }

      if (existing?.status === "submitted" || existing?.status === "draft") {
        updatePayload.status = "under_review";
        updatePayload.current_stage = "Phase 1: Televerification";
        updatePayload.stage_status = "Televerification In Progress";
      }
      updatePayload.volunteer_name = name;
      updatePayload.tele_volunteer_name = name;
      updatePayload.tele_volunteer_email = email;
      updatePayload.tele_volunteer_phone = phone;
      updatePayload.tele_volunteer_role = role;
      updatePayload.tele_volunteer_affiliation = affiliation;
    }

    updatePayload.additional_remarks = JSON.stringify(additionalRemarks);
    const data = await ApplicationModel.update(targetId, updatePayload);

    return res.status(200).json({
      success: true,
      message: `Volunteer ${name} successfully assigned for ${phase === "physical" ? "Physical Verification" : "Televerification"}`,
      data: {
        ...(data || existing || {}),
        ...additionalRemarks,
        ...updatePayload,
      },
    });
  } catch (err) {
    console.error("assignVolunteer error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error assigning volunteer",
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
      const appId = item.id || item.application_id;
      if (!appId) continue;
      try {
        const existing = await ApplicationModel.findById(appId);
        let additionalRemarks = {};
        if (typeof existing?.additional_remarks === "string") {
          try {
            additionalRemarks = JSON.parse(existing.additional_remarks || "{}");
          } catch {
            additionalRemarks = { customRemarks: existing.additional_remarks };
          }
        } else if (existing?.additional_remarks && typeof existing.additional_remarks === "object") {
          additionalRemarks = { ...existing.additional_remarks };
        }

        if (item.suggestion !== undefined) {
          additionalRemarks.volunteer_suggestion = item.suggestion;
        }
        if (item.volunteer_name !== undefined) {
          additionalRemarks.volunteer_name = item.volunteer_name;
        }

        await ApplicationModel.update(appId, {
          additional_remarks: JSON.stringify(additionalRemarks),
        });
        updatedCount++;
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
  assignVolunteer,
  bulkUpdateVolunteerSuggestions,
  deleteApplication,
};
