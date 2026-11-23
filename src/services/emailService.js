const nodemailer = require("nodemailer");

/**
 * Service to dispatch email notifications using Resend SMTP or configured SMTP
 */
class EmailService {
  static async notifyAdmissions(app) {
    const transporter = this.getTransporter();
    const to = process.env.ADMIN_EMAIL;
    if (!transporter || !to) throw new Error("Admissions email is not configured.");
    const origin = process.env.ADMIN_PORTAL_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || "http://localhost:3000";
    const link = new URL("/admin/applications", origin);
    link.searchParams.set("applicantId", app.id);
    await transporter.sendMail({
      from: process.env.FROM_EMAIL || "info@maatram.tech", to,
      subject: `Application submitted: ${app.application_number}`,
      text: [`New scholarship application from ${app.full_name}.`, `Application number: ${app.application_number}`,
        `Preferred degree: ${app.preferred_degree || "Unspecified"}`, `Review submitted form: ${link.href}`].join("\n"),
    });
  }

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

  /**
   * Send Password Reset OTP email
   * @param {string} toEmail - Recipient email
   * @param {string} otpCode - 6-digit OTP code
   * @param {string} userName - User display name
   */
  static async sendPasswordResetOtp(toEmail, otpCode, userName = "Scholar") {
    if (!toEmail) return { success: false, message: "Email required" };

    const fromEmail = process.env.FROM_EMAIL || "info@maatram.tech";
    const fromName = process.env.FROM_NAME || "Maatram Foundation";

    const emailSubject = `🔐 Your Maatram Account Password Reset Code: ${otpCode}`;
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #0f172a; margin: 0; font-size: 20px;">Maatram Foundation</h2>
          <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Password Reset Request</p>
        </div>

        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
          Hello <strong>${userName}</strong>,
        </p>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
          We received a request to reset the password for your student/alumni account. Use the 6-digit verification code below to set a new password:
        </p>

        <div style="text-align: center; margin: 24px 0;">
          <div style="display: inline-block; background-color: #FEF3C7; border: 2px dashed #F59E0B; border-radius: 12px; padding: 14px 28px;">
            <span style="font-family: monospace; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #78350F;">
              ${otpCode}
            </span>
          </div>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 8px;">Valid for 15 minutes</p>
        </div>

        <p style="color: #64748b; font-size: 12px; line-height: 1.5;">
          If you did not request this password reset, please ignore this email or reach out to your Maatram Foundation coordinator immediately.
        </p>
      </div>
    `;

    const transporter = EmailService.getTransporter();
    if (transporter) {
      try {
        await transporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to: toEmail,
          subject: emailSubject,
          text: `Your password reset code is: ${otpCode}`,
          html: htmlContent,
        });
        console.log(`✅ Password reset OTP email dispatched to ${toEmail}`);
      } catch (err) {
        console.warn(`Could not dispatch email via SMTP to ${toEmail}:`, err.message);
      }
    }

    return { success: true };
  }

  /**
   * Send Application Rejection email to student via Resend
   * @param {Object} params
   * @param {string} params.toEmail - Student's recipient email
   * @param {string} [params.studentName] - Student's full name
   * @param {string} [params.applicationNumber] - Application Number (e.g. MF-2025-003)
   * @param {string} [params.rejectionReason] - Rejection remarks / note
   */
  static async sendApplicationRejectionEmail({
    toEmail,
    studentName = "Applicant",
    applicationNumber = "MF-2025-APP",
    rejectionReason = "",
  }) {
    if (!toEmail) {
      console.warn("⚠️ Cannot send rejection email: No recipient email provided.");
      return { success: false, message: "Recipient email required" };
    }

    const fromEmail = process.env.FROM_EMAIL || "info@maatram.tech";
    const fromName = (process.env.FROM_NAME || "Maatram Foundation").replace(/"/g, "");
    const emailSubject = "Your application rejected by maatram foundation";

    const reasonSection = rejectionReason
      ? `
        <div style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 10px; padding: 14px 18px; margin: 20px 0;">
          <p style="margin: 0; font-size: 13px; color: #9f1239; font-weight: bold;">Review Committee Remarks:</p>
          <p style="margin: 6px 0 0; font-size: 13px; color: #881337; line-height: 1.5;">${rejectionReason}</p>
        </div>
      `
      : "";

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px; border-bottom: 2px solid #0f172a; padding-bottom: 16px;">
          <h2 style="color: #0f172a; margin: 0 0 6px; font-size: 22px; font-weight: 800; letter-spacing: 0.5px;">MAATRAM FOUNDATION</h2>
          <p style="margin: 0; color: #475569; font-size: 13px; font-weight: bold;">Higher Education 100% Free Sponsorship Program</p>
        </div>

        <div style="padding: 18px 20px; background-color: #fef2f2; border-left: 5px solid #ef4444; border-radius: 10px; margin-bottom: 22px;">
          <h3 style="color: #991b1b; margin: 0 0 6px; font-size: 17px; font-weight: 800;">
            Application Status Notification
          </h3>
          <p style="color: #b91c1c; margin: 0; font-size: 15px; font-weight: bold; line-height: 1.5;">
            Your application rejected by maatram foundation.
          </p>
        </div>

        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
          Dear <strong>${studentName}</strong>,
        </p>

        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
          Thank you for applying to the <strong>Maatram Educational &amp; Charitable Trust</strong> Free Higher Education Sponsorship Program (Admission Track 2025–2026).
        </p>

        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
          After careful consideration and review of your application (Application No: <strong style="font-family: monospace; color: #0f172a;">${applicationNumber}</strong>), we regret to inform you that <strong>your application rejected by maatram foundation</strong> and has not been shortlisted for the current academic year.
        </p>

        ${reasonSection}

        <p style="color: #64748b; font-size: 13px; line-height: 1.6;">
          Due to strict sponsorship quotas and high volume of eligible candidates across Tamil Nadu, our review committee must adhere strictly to verified academic and socio-economic priority criteria. We sincerely appreciate your efforts and wish you great success in all your future educational and career endeavors.
        </p>

        <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
          <p style="margin: 2px 0; font-weight: bold; color: #64748b;">Maatram Educational &amp; Charitable Trust</p>
          <p style="margin: 2px 0;">Chennai Central Office • info@maatram.tech</p>
          <p style="margin: 4px 0 0; color: #cbd5e1;">Sent to registered applicant: ${toEmail}</p>
        </div>
      </div>
    `;

    const textContent = `
Dear ${studentName},

Your application rejected by maatram foundation.

Application Number: ${applicationNumber}

Thank you for applying to the Maatram Foundation Higher Education Sponsorship Program. After verification by our admissions committee, your application was not shortlisted for sponsorship for the 2025-2026 academic year.

${rejectionReason ? `Remarks: ${rejectionReason}\n\n` : ""}We wish you success in your future higher education endeavors.

Maatram Educational & Charitable Trust
info@maatram.tech
    `.trim();

    // 1. Try sending via Resend REST API first if Resend API key is available
    const resendApiKey = process.env.SMTP_PASSWORD;
    if (resendApiKey && resendApiKey.startsWith("re_")) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `"${fromName}" <${fromEmail}>`,
            to: [toEmail],
            subject: emailSubject,
            text: textContent,
            html: htmlContent,
          }),
        });

        const result = await response.json();
        if (response.ok && result.id) {
          console.log(`✅ Rejection email sent to ${toEmail} via Resend API (id: ${result.id})`);
          return { success: true, id: result.id, method: "resend_api" };
        } else {
          console.warn(`Resend API returned non-OK status:`, result);
        }
      } catch (apiErr) {
        console.warn(`Resend API fetch failed, trying SMTP fallback:`, apiErr.message);
      }
    }

    // 2. Fallback to Nodemailer SMTP (smtp.resend.com:587)
    const transporter = EmailService.getTransporter();
    if (transporter) {
      try {
        const info = await transporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to: toEmail,
          subject: emailSubject,
          text: textContent,
          html: htmlContent,
        });
        console.log(`✅ Rejection email sent to ${toEmail} via SMTP (messageId: ${info.messageId})`);
        return { success: true, messageId: info.messageId, method: "smtp" };
      } catch (smtpErr) {
        console.error(`❌ Failed to dispatch rejection email to ${toEmail} via SMTP:`, smtpErr.message);
        return { success: false, error: smtpErr.message };
      }
    }

    return { success: false, message: "No email transporter configured" };
  }
}

module.exports = { EmailService };
