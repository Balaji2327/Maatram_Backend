const { supabaseAdmin } = require("../config/supabase");

const META_DELIMITER = "\n\n<!--METADATA_JSON:";
const META_END_DELIMITER = "-->";

/**
 * Extracts clean description text and structured metadata embedded in description
 */
function extractEventMeta(rawDescription) {
  if (!rawDescription || typeof rawDescription !== "string") {
    return { cleanDescription: rawDescription || "", meta: {} };
  }
  const startIndex = rawDescription.indexOf(META_DELIMITER);
  if (startIndex === -1) {
    return { cleanDescription: rawDescription, meta: {} };
  }
  const endIndex = rawDescription.indexOf(META_END_DELIMITER, startIndex);
  if (endIndex === -1) {
    return { cleanDescription: rawDescription, meta: {} };
  }
  const cleanDescription = rawDescription.substring(0, startIndex).trim();
  const jsonStr = rawDescription.substring(startIndex + META_DELIMITER.length, endIndex);
  try {
    const meta = JSON.parse(jsonStr);
    return { cleanDescription, meta: meta || {} };
  } catch {
    return { cleanDescription, meta: {} };
  }
}

/**
 * Packages description and structured metadata for persistence in Supabase
 */
function packEventDescription(cleanDescription, meta) {
  if (!meta || Object.keys(meta).length === 0) return (cleanDescription || "").trim();
  return `${(cleanDescription || "").trim()}${META_DELIMITER}${JSON.stringify(meta)}${META_END_DELIMITER}`;
}

/**
 * Normalizes event object with parsed metadata properties
 */
function enrichEvent(event) {
  if (!event) return null;
  const { cleanDescription, meta } = extractEventMeta(event.description);

  return {
    ...event,
    description: cleanDescription,
    mode: meta.mode || event.mode || "offline",
    student_volunteers_needed: meta.student_volunteers_needed ?? event.student_volunteers_needed ?? 10,
    alumni_volunteers_needed: meta.alumni_volunteers_needed ?? event.alumni_volunteers_needed ?? 5,
    task_to_complete: meta.task_to_complete || event.task_to_complete || "",
    duration: meta.duration || event.duration || "",
    start_time: meta.start_time || event.start_time || event.event_time?.split("-")[0]?.trim() || "",
    end_time: meta.end_time || event.end_time || event.event_time?.split("-")[1]?.trim() || "",
    eligible_years: meta.eligible_years || event.eligible_years || ["1", "2", "3", "4"],
    accepted_students: meta.accepted_students || event.accepted_students || [],
    accepted_alumni: meta.accepted_alumni || event.accepted_alumni || [],
    rejected_participants: meta.rejected_participants || event.rejected_participants || [],
    volunteer_assignments: meta.volunteer_assignments || {},
    _meta: meta,
  };
}

class EventModel {
  static async getAll() {
    let events = [];

    const { data, error } = await supabaseAdmin
      .from("events")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("EventModel.getAll error:", error.message);
    } else {
      events = data || [];
    }

    return events.map((ev) => enrichEvent(ev));
  }

  static async getById(id) {
    const { data, error } = await supabaseAdmin
      .from("events")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("EventModel.getById error:", error.message);
      return null;
    }
    return enrichEvent(data);
  }

  static async create(eventData) {
    let formattedTime = eventData.event_time || null;
    if (eventData.start_time && eventData.end_time) {
      formattedTime = `${eventData.start_time} - ${eventData.end_time}`;
    }

    const meta = {
      mode: eventData.mode || "offline",
      student_volunteers_needed: parseInt(eventData.student_volunteers_needed || 0, 10),
      alumni_volunteers_needed: parseInt(eventData.alumni_volunteers_needed || 0, 10),
      task_to_complete: eventData.task_to_complete || "",
      duration: eventData.duration || "",
      start_time: eventData.start_time || "",
      end_time: eventData.end_time || "",
      eligible_years: Array.isArray(eventData.eligible_years) && eventData.eligible_years.length > 0
        ? eventData.eligible_years
        : ["1", "2", "3", "4"],
      accepted_students: [],
      accepted_alumni: [],
      rejected_participants: [],
      created_at: new Date().toISOString(),
    };

    const packedDescription = packEventDescription(eventData.description, meta);

    const insertPayload = {
      title: eventData.title,
      description: packedDescription,
      event_date: eventData.event_date || eventData.date || new Date().toISOString().split("T")[0],
      event_time: formattedTime,
      location: eventData.location || (eventData.mode === "remote" ? "Online / Remote" : "Chennai"),
      category: eventData.category || "Volunteer Drive",
      target_audience: eventData.target_audience || "Students & Alumni Volunteers",
      image_url: eventData.image_url || null,
      status: eventData.status || "upcoming",
    };

    const { data, error } = await supabaseAdmin
      .from("events")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error("EventModel.create error from Supabase:", error.message);
      return enrichEvent({
        id: `ev-${Date.now()}`,
        ...insertPayload,
        created_at: new Date().toISOString(),
      });
    }

    return enrichEvent(data);
  }

  static async update(id, updates) {
    // If updating description or metadata, preserve or merge meta
    let packedDescription = updates.description;
    if (updates.description !== undefined || updates.mode || updates.student_volunteers_needed) {
      const existing = await this.getById(id);
      const currentMeta = existing?._meta || {};
      const newMeta = {
        ...currentMeta,
        ...(updates.mode ? { mode: updates.mode } : {}),
        ...(updates.student_volunteers_needed !== undefined ? { student_volunteers_needed: parseInt(updates.student_volunteers_needed, 10) } : {}),
        ...(updates.alumni_volunteers_needed !== undefined ? { alumni_volunteers_needed: parseInt(updates.alumni_volunteers_needed, 10) } : {}),
        ...(updates.task_to_complete !== undefined ? { task_to_complete: updates.task_to_complete } : {}),
        ...(updates.duration !== undefined ? { duration: updates.duration } : {}),
        ...(updates.start_time !== undefined ? { start_time: updates.start_time } : {}),
        ...(updates.end_time !== undefined ? { end_time: updates.end_time } : {}),
        ...(updates.eligible_years !== undefined ? { eligible_years: updates.eligible_years } : {}),
      };
      const cleanDesc = updates.description !== undefined ? updates.description : (existing?.description || "");
      packedDescription = packEventDescription(cleanDesc, newMeta);
    }

    const payload = {
      ...updates,
      ...(packedDescription !== undefined ? { description: packedDescription } : {}),
    };

    delete payload.mode;
    delete payload.student_volunteers_needed;
    delete payload.alumni_volunteers_needed;
    delete payload.task_to_complete;
    delete payload.duration;
    delete payload.start_time;
    delete payload.end_time;
    delete payload.eligible_years;

    const { data, error } = await supabaseAdmin
      .from("events")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("EventModel.update error:", error.message);
    }

    return enrichEvent(data || { id, ...updates });
  }

  static async delete(id) {
    const { error } = await supabaseAdmin
      .from("events")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("EventModel.delete error:", error.message);
    }

    return true;
  }

  /**
   * First-Come, First-Served Volunteer Response (Accept or Reject)
   */
  static async respondToVolunteerEvent(eventId, participant) {
    const { data: event, error } = await supabaseAdmin
      .from("events")
      .select("*")
      .eq("id", eventId)
      .maybeSingle();

    if (error || !event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    const { cleanDescription, meta } = extractEventMeta(event.description);
    if (!meta.accepted_students) meta.accepted_students = [];
    if (!meta.accepted_alumni) meta.accepted_alumni = [];
    if (!meta.rejected_participants) meta.rejected_participants = [];

    const userEmail = (participant.email || "").trim().toLowerCase();
    const isAlumni = participant.role === "alumni";
    const action = participant.action; // 'accept' | 'reject'

    if (!userEmail) {
      throw new Error("Participant email is required");
    }

    if (action === "reject") {
      meta.accepted_students = meta.accepted_students.filter(
        (s) => s.email?.toLowerCase() !== userEmail
      );
      meta.accepted_alumni = meta.accepted_alumni.filter(
        (a) => a.email?.toLowerCase() !== userEmail
      );
      if (!meta.rejected_participants.includes(userEmail)) {
        meta.rejected_participants.push(userEmail);
      }

      const updatedDesc = packEventDescription(cleanDescription, meta);
      await supabaseAdmin.from("events").update({ description: updatedDesc }).eq("id", eventId);
      return { success: true, action: "rejected", message: "Event invitation declined" };
    }

    if (action === "accept") {
      meta.rejected_participants = meta.rejected_participants.filter((e) => e !== userEmail);

      const targetList = isAlumni ? meta.accepted_alumni : meta.accepted_students;
      const neededCount = isAlumni
        ? (meta.alumni_volunteers_needed || 0)
        : (meta.student_volunteers_needed || 0);

      const alreadyAccepted = targetList.some((p) => p.email?.toLowerCase() === userEmail);
      if (alreadyAccepted) {
        return {
          success: true,
          action: "already_accepted",
          message: "You have already accepted and registered for this event.",
        };
      }

      // FIRST-COME, FIRST-SERVED CHECK!
      if (targetList.length >= neededCount && neededCount > 0) {
        return {
          success: false,
          quotaFull: true,
          message: `Volunteer seats full! All ${neededCount} ${isAlumni ? "alumni" : "student"} volunteer spots for this event have been filled on a first-come, first-served basis.`,
        };
      }

      const acceptanceEntry = {
        name: participant.name || "Volunteer",
        email: userEmail,
        role: isAlumni ? "alumni" : "student",
        college: participant.college || "",
        year_of_study: participant.year_of_study || "",
        accepted_at: new Date().toISOString(),
        assignment_approved: false, // Wait for admin approval
        assigned_applicants: [],
      };

      if (isAlumni) {
        meta.accepted_alumni.push(acceptanceEntry);
      } else {
        meta.accepted_students.push(acceptanceEntry);
      }

      const updatedDesc = packEventDescription(cleanDescription, meta);
      await supabaseAdmin.from("events").update({ description: updatedDesc }).eq("id", eventId);

      return {
        success: true,
        action: "accepted",
        message: "Successfully registered! You are enrolled for this volunteer event. Applicants will be assigned once admin grants approval.",
        seatNumber: targetList.length,
        totalSeats: neededCount,
      };
    }

    throw new Error(`Invalid action: ${action}`);
  }

  /**
   * Admin approves assignment for a volunteer or for the whole event,
   * triggering the Hybrid AI dynamic assignment of applicants (e.g. 10 per volunteer).
   */
  static async approveAndAssignApplicants(eventId, volunteerEmail, options = {}) {
    const { AiVolunteerMatcher } = require("../services/aiVolunteerMatcher");
    const { ApplicationModel } = require("./Application");

    const { data: event, error } = await supabaseAdmin
      .from("events")
      .select("*")
      .eq("id", eventId)
      .maybeSingle();

    if (error || !event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    const { cleanDescription, meta } = extractEventMeta(event.description);
    if (!meta.accepted_students) meta.accepted_students = [];
    if (!meta.accepted_alumni) meta.accepted_alumni = [];
    if (!meta.volunteer_assignments) meta.volunteer_assignments = {}; // { [email]: [applicantObj] }

    const targetEmail = (volunteerEmail || "").trim().toLowerCase();

    // Find the volunteer entry across students or alumni
    let volEntry = meta.accepted_students.find((s) => s.email?.toLowerCase() === targetEmail);
    if (!volEntry) {
      volEntry = meta.accepted_alumni.find((a) => a.email?.toLowerCase() === targetEmail);
    }

    if (!volEntry) {
      throw new Error(`Volunteer ${targetEmail} has not accepted this event.`);
    }

    // Check if already approved and assigned
    if (volEntry.assignment_approved && Array.isArray(meta.volunteer_assignments[targetEmail]) && meta.volunteer_assignments[targetEmail].length > 0) {
      return {
        success: true,
        alreadyAssigned: true,
        message: `Volunteer ${volEntry.name} is already assigned ${meta.volunteer_assignments[targetEmail].length} applicants.`,
        assigned_applicants: meta.volunteer_assignments[targetEmail],
      };
    }

    // Fetch all raw applications
    const allApplications = await ApplicationModel.getAll();

    // Filter candidate applicants (incoming new applicants needing verification)
    const validApplicants = (allApplications || []).filter((app) => {
      const isExistingStudentOrAlumni =
        app.current_stage === "admitted" ||
        app.application_number?.startsWith("MF-SCH-") ||
        app.application_number?.startsWith("MF-ALUM-") ||
        app.email?.includes("@student.") ||
        app.email?.includes("@alumni.");
      return !isExistingStudentOrAlumni;
    });

    // Find all already-assigned applicant IDs across this event
    const assignedIds = new Set();
    Object.values(meta.volunteer_assignments).forEach((batch) => {
      if (Array.isArray(batch)) {
        batch.forEach((app) => assignedIds.add(app.applicant_id || app.id));
      }
    });

    // Determine unassigned pool
    const unassignedPool = validApplicants.filter((app) => !assignedIds.has(app.id));

    // Dynamic batch size: default 10, or whatever remains if < 10
    const batchSize = options.batchSize || 10;
    const countToAssign = Math.min(batchSize, unassignedPool.length);

    if (countToAssign === 0) {
      volEntry.assignment_approved = true;
      volEntry.assigned_applicants = [];
      meta.volunteer_assignments[targetEmail] = [];
      const updatedDesc = packEventDescription(cleanDescription, meta);
      await supabaseAdmin.from("events").update({ description: updatedDesc }).eq("id", eventId);

      return {
        success: true,
        assignedCount: 0,
        message: "All applicants in database are already assigned to other volunteers. No remaining unassigned applicants.",
        assigned_applicants: [],
      };
    }

    // Run Hybrid AI Matching!
    const matchedApplicants = await AiVolunteerMatcher.matchApplicantsForVolunteer(
      volEntry,
      unassignedPool,
      countToAssign
    );

    // Persist into event metadata
    volEntry.assignment_approved = true;
    volEntry.assigned_at = new Date().toISOString();
    volEntry.assigned_count = matchedApplicants.length;
    meta.volunteer_assignments[targetEmail] = matchedApplicants;

    const updatedDesc = packEventDescription(cleanDescription, meta);
    await supabaseAdmin.from("events").update({ description: updatedDesc }).eq("id", eventId);

    return {
      success: true,
      message: `Admin approved! Successfully assigned ${matchedApplicants.length} applicants to ${volEntry.name}.`,
      assignedCount: matchedApplicants.length,
      volunteer: volEntry,
      assigned_applicants: matchedApplicants,
    };
  }

  /**
   * Retrieves assigned applicants for a specific volunteer or whole event
   */
  static async getEventAssignments(eventId, volunteerEmail = null) {
    const { data: event, error } = await supabaseAdmin
      .from("events")
      .select("*")
      .eq("id", eventId)
      .maybeSingle();

    if (error || !event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    const { meta } = extractEventMeta(event.description);
    const assignments = meta.volunteer_assignments || {};

    if (volunteerEmail) {
      const cleanEmail = volunteerEmail.trim().toLowerCase();
      return {
        eventId,
        email: cleanEmail,
        assigned_applicants: assignments[cleanEmail] || [],
        is_approved: !!(
          (meta.accepted_students || []).find((s) => s.email?.toLowerCase() === cleanEmail)?.assignment_approved ||
          (meta.accepted_alumni || []).find((a) => a.email?.toLowerCase() === cleanEmail)?.assignment_approved
        ),
      };
    }

    return {
      eventId,
      all_assignments: assignments,
    };
  }
}

module.exports = { EventModel };
