const { EventModel } = require("../models/Event");
const { VolunteerModel } = require("../models/Volunteer");
const { EmailService } = require("../services/emailService");
const { StorageService } = require("../services/storageService");

/**
 * @controller  getAllEvents
 * @route       GET /admin/events
 * @desc        Retrieve all events with resolved S3 URLs
 */
async function getAllEvents(req, res) {
  try {
    const events = await EventModel.getAll();

    const formatted = events.map((ev) => ({
      ...ev,
      s3_image_key: ev.image_url,
      image_url: ev.image_url ? StorageService.getMediaUrl(ev.image_url) : null,
    }));

    return res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (err) {
    console.error("getAllEvents error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve events",
      error: err.message,
    });
  }
}

/**
 * @controller  createEvent
 * @route       POST /admin/events
 * @desc        Create new event with AWS S3 banner image key storage
 */
async function createEvent(req, res) {
  try {
    const {
      title,
      description,
      date,
      time,
      location,
      category,
      targetAudience,
      imageUrl,
      status,
      // Volunteer event specific fields
      mode,
      studentVolunteersNeeded,
      student_volunteers_needed,
      alumniVolunteersNeeded,
      alumni_volunteers_needed,
      taskToComplete,
      task_to_complete,
      duration,
      startTime,
      start_time,
      endTime,
      end_time,
      eligibleYears,
      eligible_years,
      sendEmailNotification,
      send_email_notification,
    } = req.body;

    const eventMode = mode === "remote" ? "remote" : "offline";
    const eventTitle = (title || "").trim();
    const eventDescription = (description || "").trim();

    if (!eventTitle) {
      return res.status(400).json({
        success: false,
        message: "Event title/name is required.",
      });
    }

    const sCount = parseInt(studentVolunteersNeeded ?? student_volunteers_needed ?? 0, 10);
    const aCount = parseInt(alumniVolunteersNeeded ?? alumni_volunteers_needed ?? 0, 10);
    const eventTask = (taskToComplete || task_to_complete || "").trim();
    const eventDuration = (duration || "").trim();
    const sTime = startTime || start_time || "";
    const eTime = endTime || end_time || "";
    const eventDate = date || new Date().toISOString().split("T")[0];
    const eventLocation = eventMode === "remote" ? "Online / Remote" : (location || "Chennai").trim();
    const parsedYears = eligibleYears || eligible_years || ["1", "2", "3", "4"];

    let s3BannerKey = imageUrl;
    if (imageUrl && imageUrl.startsWith("data:")) {
      s3BannerKey = await StorageService.uploadMedia(imageUrl, "events", "event_banner");
    }

    const eventRecord = await EventModel.create({
      title: eventTitle,
      description: eventDescription,
      event_date: eventDate,
      event_time: sTime && eTime ? `${sTime} - ${eTime}` : time || null,
      location: eventLocation,
      category: category || "Volunteer Drive",
      target_audience: targetAudience || null,
      image_url: s3BannerKey || null,
      status: status || "upcoming",
      mode: eventMode,
      student_volunteers_needed: sCount,
      alumni_volunteers_needed: aCount,
      task_to_complete: eventTask,
      duration: eventDuration,
      start_time: sTime,
      end_time: eTime,
      eligible_years: parsedYears,
    });

    const shouldSendEmail =
      sendEmailNotification === true ||
      sendEmailNotification === "true" ||
      send_email_notification === true ||
      send_email_notification === "true";

    let emailResult = { sentCount: 0, dispatched: false };
    if (shouldSendEmail) {
      try {
        const allVolunteers = await VolunteerModel.getAll();
        emailResult = await EmailService.sendEventNotificationToVolunteers(eventRecord, allVolunteers);
        emailResult.dispatched = true;
      } catch (mailErr) {
        console.warn("⚠️ Volunteer email broadcast notice:", mailErr.message);
      }
    }

    const successMessage = shouldSendEmail
      ? `Event "${eventTitle}" posted successfully! Email alerts sent to ${emailResult.sentCount || 0} registered volunteers.`
      : `Event "${eventTitle}" posted successfully! (Email broadcast disabled by admin)`;

    return res.status(201).json({
      success: true,
      message: successMessage,
      data: eventRecord,
      emailBroadcast: emailResult,
    });
  } catch (err) {
    console.error("createEvent error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error creating event",
      error: err.message,
    });
  }
}

/**
 * @controller  updateEvent
 * @route       PUT /admin/events/:id
 * @desc        Update existing event
 */
async function updateEvent(req, res) {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      date,
      time,
      location,
      category,
      targetAudience,
      imageUrl,
      status,
    } = req.body;

    let s3BannerKey = imageUrl;
    if (imageUrl && imageUrl.startsWith("data:")) {
      s3BannerKey = await StorageService.uploadMedia(imageUrl, "events", "event_banner");
    }

    const updates = {
      title: title?.trim(),
      description: description?.trim(),
      event_date: date,
      event_time: time || null,
      location: location?.trim(),
      category: category || "Workshop",
      target_audience: targetAudience || null,
      image_url: s3BannerKey || null,
      status: status || "upcoming",
    };

    const updated = await EventModel.update(id, updates);

    return res.status(200).json({
      success: true,
      message: "Event updated successfully",
      data: updated,
    });
  } catch (err) {
    console.error("updateEvent error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error updating event",
      error: err.message,
    });
  }
}

/**
 * @controller  deleteEvent
 * @route       DELETE /admin/events/:id
 * @desc        Delete event by id and delete associated media files from AWS S3
 */
async function deleteEvent(req, res) {
  try {
    const { id } = req.params;

    const event = await EventModel.getById(id);
    if (event && event.image_url) {
      console.log(`[AWS S3] Deleting banner image for event ${id}: ${event.image_url}`);
      await StorageService.deleteMedia(event.image_url);
    }

    await EventModel.delete(id);

    return res.status(200).json({
      success: true,
      message: "Event and its associated AWS S3 media deleted successfully",
    });
  } catch (err) {
    console.error("deleteEvent error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error deleting event",
      error: err.message,
    });
  }
}

/**
 * @controller  respondToEvent
 * @route       POST /admin/events/:id/respond
 * @desc        Volunteer Accept/Reject response with first-come first-served quota enforcement
 */
async function respondToEvent(req, res) {
  try {
    const { id } = req.params;
    const { email, name, role, college, year_of_study, action } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required to respond to this event.",
      });
    }

    const volunteer = await VolunteerModel.getByEmail(email);
    if (!volunteer && action === "accept") {
      return res.status(403).json({
        success: false,
        notRegistered: true,
        message: "You must be registered as a volunteer to accept this event. Please register in the Volunteer tab.",
      });
    }

    const result = await EventModel.respondToVolunteerEvent(id, {
      email,
      name: name || volunteer?.name || "Volunteer",
      role: role || volunteer?.role || "student",
      college: college || volunteer?.college || "",
      year_of_study: year_of_study || volunteer?.year_of_study || "",
      action: action === "reject" ? "reject" : "accept",
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("respondToEvent error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error responding to event",
    });
  }
}

/**
 * @controller  approveVolunteerAssignment
 * @route       POST /admin/events/:id/approve-assignment
 * @desc        Admin approves applicant assignment for an accepted volunteer, running Hybrid AI dynamic assignment
 */
async function approveVolunteerAssignment(req, res) {
  try {
    const { id } = req.params;
    const { volunteerEmail, batchSize } = req.body;

    if (!volunteerEmail) {
      return res.status(400).json({
        success: false,
        message: "Volunteer email is required to approve assignment.",
      });
    }

    const result = await EventModel.approveAndAssignApplicants(id, volunteerEmail, {
      batchSize: batchSize ? parseInt(batchSize, 10) : 10,
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error("approveVolunteerAssignment error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error approving assignment",
    });
  }
}

/**
 * @controller  getEventAssignments
 * @route       GET /admin/events/:id/assignments
 * @desc        Get assigned applicants for an event or specific volunteer
 */
async function getEventAssignments(req, res) {
  try {
    const { id } = req.params;
    const { email } = req.query;

    const data = await EventModel.getEventAssignments(id, email || null);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("getEventAssignments error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error fetching assignments",
    });
  }
}

module.exports = {
  getAllEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  respondToEvent,
  approveVolunteerAssignment,
  getEventAssignments,
};

