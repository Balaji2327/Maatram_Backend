const nodemailer = require("nodemailer");

/**
 * Service to dispatch email notifications using Resend SMTP or configured SMTP
 */
class EmailService {
  static async sendSignupCode(email, code) {
    const message = {
      from: process.env.FROM_EMAIL || "info@maatram.tech",
      subject: "Verify your Maatram application portal email",
      text: "Enter " + code + " in the application portal to create your account. Registration expires 10 minutes after you start.",
    };
    const key = process.env.RESEND_API_KEY ||
      (process.env.SMTP_PASSWORD?.startsWith("re_") ? process.env.SMTP_PASSWORD : null);
    if (key) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({ ...message, to: [email] }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok || !(await response.json()).id) throw new Error("Resend status " + response.status);
      return;
    }
    const transporter = this.getTransporter({ connectionTimeout: 6000, greetingTimeout: 6000, socketTimeout: 10000 });
    if (!transporter) throw new Error("SMTP is not configured.");
    await transporter.sendMail({ ...message, to: { name: "", address: email } });
  }

  static async sendPostNotification(post) {
    const { supabaseAdmin } = require("../config/supabase");
    const { memberRole } = require("./membershipService");
    const transporter = this.getTransporter();
    if (!transporter) throw new Error("SMTP is not configured.");
    const addresses = new Set();
    const add = email => {
      const address = email?.trim().toLowerCase();
      if (address) addresses.add(address);
    };
    const size = 100;
    for (let page = 1; ; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: size });
      if (error) throw error;
      if (!data.users.length) break;
      const apps = await supabaseAdmin.from("applications")
        .select("user_id,status,current_stage,application_number").in("user_id", data.users.map(u => u.id));
      if (apps.error) throw apps.error;
      const byUser = new Map(apps.data.map(app => [app.user_id, app]));
      for (const user of data.users) {
        if (memberRole(byUser.get(user.id), user.app_metadata?.role)) add(user.email);
      }
      if (data.users.length < size) break;
    }
    for (let offset = 0; ; offset += size) {
      const { data, error } = await supabaseAdmin.from("administrators")
        .select("email").order("id").range(offset, offset + size - 1);
      if (error) throw error;
      data.forEach(admin => add(admin.email));
      if (data.length < size) break;
    }
    let sent = 0;
    for (const email of addresses) {
      if (!/^[^\s@,;<>]+@[^\s@,;<>]+$/.test(email)) continue;
      try {
        const result = await transporter.sendMail({
          from: process.env.FROM_EMAIL || "info@maatram.tech",
          to: { name: "", address: email },
          subject: post.title,
          text: post.content,
        });
        if (result.accepted?.length) sent++;
      } catch (err) {
        console.warn("Post email failed:", err.message);
      }
    }
    return { sent, failed: addresses.size - sent };
  }

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
      text: [`New admission application from ${app.full_name}.`, `Application number: ${app.application_number}`,
        `Preferred degree: ${app.preferred_degree || "Unspecified"}`, `Review submitted form: ${link.href}`].join("\n"),
    });
  }

  static async sendApplicationReceipt(app, accountEmail) {
    const address = (accountEmail || app.email || "").trim();
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+$/.test(address)) throw new Error("Applicant email unavailable.");
    const transporter = this.getTransporter();
    if (!transporter) throw new Error("SMTP is not configured.");
    await transporter.sendMail({
      from: process.env.FROM_EMAIL || "info@maatram.tech",
      to: { name: "", address },
      subject: "Maatram Foundation received your application",
      text: [
        app.full_name ? `Dear ${app.full_name},` : "Dear applicant,",
        `We’ve received your application for education support. Your application number is ${app.application_number}.`,
        "Our admissions team will review your application and contact you about the next steps. Please keep your application number for reference.",
        "Maatram Foundation Admissions Team",
      ].join("\n\n"),
    });
  }

  static getTransporter(timeouts = {}) {
    const host = process.env.SMTP_HOST || "smtp.resend.com";
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const user = process.env.SMTP_USER || "resend";
    const pass = process.env.SMTP_PASSWORD;

    if (!pass) {
      console.warn("⚠️ SMTP_PASSWORD not configured. Emails will only be simulated.");
      return null;
    }

    return nodemailer.createTransport({
      ...timeouts,
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
    let sentCount = 0;
    if (volunteers.length) {
      const transporter = this.getTransporter();
      if (!transporter) throw new Error("Event email is not configured.");
      const remote = event.mode === "remote";
      const details = [
        event.title, event.description, remote ? "Remote event" : "Offline event",
        remote ? `Duration: ${event.duration}` : `Date: ${event.event_date} | Time: ${event.event_time || "TBD"} | Location: ${event.location}`,
        `Task: ${event.task_to_complete || "General volunteering"}`,
        `Student volunteers needed: ${event.student_volunteers_needed}`,
        `Alumni volunteers needed: ${event.alumni_volunteers_needed}`,
        `Eligible student years: ${event.eligible_years.join(", ")}`,
        "Sign in to your Student or Alumni portal to respond.",
      ].filter(Boolean).join("\n");
      for (const { email } of volunteers) {
        if (!/^[^\s@,;<>]+@[^\s@,;<>]+$/.test(email)) continue;
        try {
          const result = await transporter.sendMail({
            from: { name: process.env.FROM_NAME || "Maatram Foundation", address: process.env.FROM_EMAIL || "info@maatram.tech" },
            to: { address: email, name: "" },
            subject: `Volunteer event: ${event.title}`,
            text: details,
          });
          if (result.accepted?.length) sentCount++;
        } catch (err) {
          console.warn("Event notification failed:", err.message);
        }
      }
    }
    return { sentCount, failedCount: volunteers.length - sentCount };
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

    const emailSubject = `Your Maatram Account Password Reset Code: ${otpCode}`;
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #0f172a; margin: 0; font-size: 20px;">Maatram Foundation</h2>
          <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="vertical-align:middle"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/></svg> Password Reset Request</p>
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
