const nodemailer = require("nodemailer");

/**
 * Service to dispatch email notifications using Resend SMTP or configured SMTP
 */
class EmailService {
  static getTransporter() {
    const host = process.env.SMTP_HOST || "smtp.resend.com";
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const user = process.env.SMTP_USER || "resend";
    const pass = process.env.SMTP_PASSWORD;

    if (!pass) {
      console.warn("⚠️ SMTP_PASSWORD not configured. Emails will only be simulated.");
      return null;
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });
  }

  /**
   * Broadcast new volunteer event notification to all registered volunteers
   * @param {Object} event - Event record
   * @param {Array} volunteers - List of volunteer records
   */
  static async sendEventNotificationToVolunteers(event, volunteers = []) {
    if (!volunteers || volunteers.length === 0) {
      console.log("ℹ️ No registered volunteers found to notify for event:", event.title);
      return { success: true, count: 0, message: "No registered volunteers to notify" };
    }

    const fromEmail = process.env.FROM_EMAIL || "info@maatram.tech";
    const fromName = process.env.FROM_NAME || "Maatram Foundation";
    const isRemote = event.mode === "remote";

    const emailSubject = `📢 New Volunteer Opportunity: ${event.title} (${isRemote ? "Remote" : "Offline"})`;
    
    const eligibleYearsText = Array.isArray(event.eligible_years) && event.eligible_years.length > 0
      ? event.eligible_years.map(y => `Year ${y}`).join(", ")
      : "All Years (1, 2, 3, 4)";

    const quotaInfo = `
      Student Volunteers Needed: ${event.student_volunteers_needed || 0}
      Alumni Volunteers Needed: ${event.alumni_volunteers_needed || 0}
      Selection: First-Come, First-Served basis
    `;

    const scheduleInfo = isRemote
      ? `Duration to Complete: ${event.duration || "Self-paced"}`
      : `Date: ${event.event_date || "TBD"} | Time: ${event.start_time || "TBD"} - ${event.end_time || "TBD"} | Location: ${event.location || "Venue"}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #0f172a; margin: 0 0 6px;">Maatram Foundation</h2>
          <span style="display: inline-block; background-color: #FEF3C7; color: #92400E; font-size: 12px; font-weight: bold; padding: 4px 12px; border-radius: 9999px;">
            Volunteer Drive Alert
          </span>
        </div>

        <h3 style="color: #1e293b; margin-top: 0;">${event.title}</h3>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">${event.description || "You have a new volunteer event posted by the foundation."}</p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0; font-size: 13px; color: #334155;">
          <p style="margin: 4px 0;"><strong>Format:</strong> ${isRemote ? "Remote / Online" : "Offline / On-premise"}</p>
          <p style="margin: 4px 0;"><strong>Task to Complete:</strong> ${event.task_to_complete || "General Volunteering"}</p>
          <p style="margin: 4px 0;"><strong>${isRemote ? "Duration" : "Schedule"}:</strong> ${scheduleInfo}</p>
          <p style="margin: 4px 0;"><strong>Eligible Student Years:</strong> ${eligibleYearsText}</p>
          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #cbd5e1;">
            <p style="margin: 4px 0;"><strong>Required Volunteers:</strong> ${event.student_volunteers_needed || 0} Students &bull; ${event.alumni_volunteers_needed || 0} Alumni</p>
            <p style="margin: 4px 0; color: #d97706; font-weight: bold;">Note: First-come, first-served registration. First to accept will participate.</p>
          </div>
        </div>

        <p style="font-size: 13px; color: #64748b;">
          Please log in to your Student or Alumni portal to Accept or Reject this event.
        </p>

        <div style="text-align: center; margin-top: 24px;">
          <a href="http://localhost:3000/student/events" style="background-color: #F7BC0F; color: #0f172a; text-decoration: none; font-weight: bold; font-size: 14px; padding: 12px 24px; border-radius: 10px; display: inline-block;">
            View & Accept Event
          </a>
        </div>
      </div>
    `;

    const transporter = EmailService.getTransporter();
    let sentCount = 0;
    const errors = [];

    for (const volunteer of volunteers) {
      if (!volunteer.email) continue;
      try {
        if (transporter) {
          await transporter.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to: volunteer.email,
            subject: emailSubject,
            text: `${event.title}\n${event.description}\n${scheduleInfo}\n${quotaInfo}`,
            html: htmlContent,
          });
        }
        sentCount++;
      } catch (err) {
        console.error(`Failed to send event notification to ${volunteer.email}:`, err.message);
        errors.push({ email: volunteer.email, error: err.message });
      }
    }

    console.log(`✅ Broadcast complete: Sent event notification email to ${sentCount}/${volunteers.length} registered volunteers.`);
    return {
      success: true,
      sentCount,
      totalVolunteers: volunteers.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}

module.exports = { EmailService };
