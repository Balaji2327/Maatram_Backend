const { supabase, supabaseAdmin } = require("../config/supabase");
const { randomUUID, randomInt, createHmac } = require("node:crypto");
const { TwoFactorService } = require("../services/twoFactorService");
const { EmailService } = require("../services/emailService");
const { getMemberRole } = require("../services/membershipService");
const { ApplicationModel } = require("../models/Application");
const { JwtService } = require("../services/jwtService");

// Helper to format Indian phone numbers to E.164 format (+91XXXXXXXXXX)
function formatPhoneNumber(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length > 10 && digits.startsWith("91")) {
    return `+${digits}`;
  }
  if (phone.startsWith("+")) {
    return phone.replace(/\s+/g, "");
  }
  return `+${digits}`;
}

// In-memory fallback OTP store for testing if SMS provider is not yet activated in Supabase
const devOtpStore = new Map();

/**
 * @controller  sendOtp
 * @route       POST /api/auth/send-otp
 * @desc        Send SMS OTP to Mobile Number or Email via Supabase Auth
 */
async function sendOtp(req, res) {
  try {
    const { phone, email, type = "login", fullName, channel } = req.body;

    if (type === "signup") return await resendSignupCode(req, res);
    if (!phone && !email) {
      return res.status(400).json({
        success: false,
        message: "Email address or mobile number is required",
      });
    }

    // Prioritize email OTP if channel is email, or if signup with email, or if only email is provided
    const useEmail =
      channel === "email" ||
      (type === "signup" && Boolean(email)) ||
      (!phone && Boolean(email));

    // 1. Email OTP Flow (Free, instant, no Twilio required)
    if (useEmail && email) {
      const cleanEmail = email.trim().toLowerCase();

      const { data, error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          shouldCreateUser: false,
          data: {
            full_name: fullName || "Student Applicant",
            phone: phone ? formatPhoneNumber(phone) : null,
            role: "applicant",
          },
        },
      });

      if (error) {
        console.error("Supabase email OTP error:", error.code || error.message);

        return res.status(400).json({
          success: false,
          message: error.message || "Failed to send Email OTP",
        });
      }

      console.log(`✅ Email OTP dispatched via Supabase to ${cleanEmail}`);
      return res.status(200).json({
        success: true,
        message: `Verification OTP has been sent to your email: ${cleanEmail}`,
        target: cleanEmail,
        channel: "email",
        type,
      });
    }

    // 2. Mobile Number SMS OTP Flow
    if (phone) {
      const formattedPhone = formatPhoneNumber(phone);

      const { data, error } = await supabase.auth.signInWithOtp({
        phone: formattedPhone,
        options: {
          shouldCreateUser: false,
          data: {
            full_name: fullName || "Student Applicant",
            role: "applicant",
          },
        },
      });

      if (error) {
        console.error("Supabase phone OTP error:", error.code || error.message);

        return res.status(400).json({
          success: false,
          message: error.message || "Failed to send SMS OTP",
          error: error.message,
        });
      }

      console.log(`✅ SMS OTP dispatched via Supabase to ${formattedPhone}`);
      return res.status(200).json({
        success: true,
        message: `Verification OTP has been sent via SMS to ${formattedPhone}`,
        target: formattedPhone,
        channel: "phone",
        type,
      });
    }
  } catch (err) {
    console.error("sendOtp error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error sending OTP",
      error: err.message,
    });
  }
}

/**
 * @controller  verifyOtp
 * @route       POST /api/auth/verify-otp
 * @desc        Verify 6-digit OTP code and retrieve Supabase Auth session
 */
async function verifyOtp(req, res) {
  try {
    const { phone, email, token, type = "login", fullName, channel } = req.body;

    if (type === "signup") return await completeSignup(req, res);
    if (!token || token.trim().length !== 6) {
      return res.status(400).json({
        success: false,
        message: "A valid 6-digit verification code is required",
      });
    }

    const useEmail =
      channel === "email" ||
      (type === "signup" && Boolean(email)) ||
      (!phone && Boolean(email));

    let authResult;
    if (useEmail && email) {
      const cleanEmail = email.trim().toLowerCase();
      authResult = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: token.trim(),
        type: "email",
      });
    } else if (phone) {
      const formattedPhone = formatPhoneNumber(phone);
      authResult = await supabase.auth.verifyOtp({
        phone: formattedPhone,
        token: token.trim(),
        type: "sms",
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Email or phone number is required for verification",
      });
    }

    const { data, error } = authResult;

    if (error) {
      console.error("Supabase verifyOtp error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Invalid or expired verification code",
      });
    }

    const { session, user } = data;

    // Update user metadata with phone if provided during signup
    if (user && phone && !user.user_metadata?.phone) {
      try {
        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          user_metadata: {
            ...user.user_metadata,
            phone: formatPhoneNumber(phone),
            full_name: fullName || user.user_metadata?.full_name,
          },
        });
      } catch (metaErr) {
        console.warn("Could not update user metadata:", metaErr.message);
      }
    }

    // Generate custom 7-hour JWT access token
    const jwtToken = JwtService.signToken({
      id: user.id,
      email: user.email,
      role: user.user_metadata?.role || "applicant",
      phone: user.phone || user.user_metadata?.phone,
      user_metadata: { full_name: user.user_metadata?.full_name, role: user.user_metadata?.role },
      type: "user",
    });

    const enhancedSession = session ? {
      ...session,
      access_token: jwtToken || session.access_token,
      expires_in: 7 * 3600, // 7 hours in seconds
      token_type: "bearer",
    } : {
      access_token: jwtToken,
      expires_in: 7 * 3600,
      token_type: "bearer",
    };

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully. Authenticated into Supabase.",
      token: jwtToken,
      expiresIn: "7h",
      session: enhancedSession,
      user,
    });
  } catch (err) {
    console.error("verifyOtp error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error verifying OTP",
      error: err.message,
    });
  }
}

function signupCode() {
  return randomInt(1000000).toString().padStart(6, "0");
}

function signupDigest(id, code) {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY)
    .update("signup:" + id + ":" + code).digest("hex");
}

async function deliverSignupCode(res, email, challengeId, code) {
  try {
    await EmailService.sendSignupCode(email, code);
    return res.status(200).json({ success: true, challengeId });
  } catch (error) {
    console.warn("Signup email delivery failed:", error.code || error.name);
    return res.status(503).json({ success: false, challengeId, message: "Email delivery could not be confirmed. Check your inbox or request another code." });
  }
}

function signupChallenge(req) {
  const id = req.body.challengeId;
  return typeof id === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) ? id : null;
}

async function resendSignupCode(req, res) {
  const id = signupChallenge(req);
  if (!id) return res.status(400).json({ success: false, message: "Start registration again to request a code." });
  const code = signupCode();
  const now = Date.now();
  const { data, error } = await supabaseAdmin.from("applicant_signup_codes")
    .update({ code_digest: signupDigest(id, code), sent_at: new Date(now).toISOString() })
    .eq("challenge_id", id).lt("sent_at", new Date(now - 30000).toISOString())
    .gt("expires_at", new Date(now).toISOString()).gt("attempts_left", 0)
    .select("email").maybeSingle();
  if (error) throw error;
  if (!data) return res.status(400).json({ success: false, message: "Wait 30 seconds between codes. If registration expired, start again." });
  return deliverSignupCode(res, data.email, id, code);
}

async function completeSignup(req, res) {
  const id = signupChallenge(req);
  if (!id || typeof req.body.token !== "string" || !/^\d{6}$/.test(req.body.token)) {
    return res.status(400).json({ success: false, message: "Enter the six-digit code from your registration email." });
  }
  const { data, error } = await supabaseAdmin.rpc("consume_applicant_signup", {
    challenge: id, digest: signupDigest(id, req.body.token),
  });
  if (error) throw error;
  const pending = data?.[0];
  if (!pending) return res.status(400).json({ success: false, message: "Invalid or expired code. Use your latest email or start registration again." });
  const { error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: pending.email, password_hash: pending.password_hash, email_confirm: true,
    user_metadata: { full_name: pending.full_name, mobile_number: pending.mobile_number,
      phone: formatPhoneNumber(pending.mobile_number), role: "applicant" },
  });
  if (createError) {
    const exists = ["email_exists", "user_already_exists"].includes(createError.code);
    return res.status(exists ? 409 : 503).json({ success: false, message: exists
      ? "This email already has an account. Please sign in."
      : "Account creation failed. Please start registration again." });
  }
  return res.status(201).json({ success: true });
}

/**
 * @controller  signup
 * @route       POST /auth/signup
 * @desc        Register a student with email, mobile, and password after email verification
 */
async function signup(req, res) {
  try {
    const { fullName, email, mobileNumber, password, confirmPassword } = req.body;

    if (!fullName || !fullName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Full name is required",
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email address is required",
      });
    }

    if (!mobileNumber || !mobileNumber.trim()) {
      return res.status(400).json({
        success: false,
        message: "Mobile number is required",
      });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Password and confirm password do not match",
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(cleanEmail) || Buffer.byteLength(password) > 72) {
      return res.status(400).json({ success: false, message: "Enter a valid email and a password of up to 72 bytes." });
    }
    const clientId = signupChallenge(req);
    const challengeId = clientId || randomUUID();
    async function resumeChallenge() {
      if (!clientId) return null;
      const { data, error } = await supabaseAdmin.from("applicant_signup_codes")
        .select("expires_at,sent_at").eq("email", cleanEmail).eq("challenge_id", clientId)
        .gt("expires_at", new Date().toISOString()).gt("attempts_left", 0).maybeSingle();
      if (error) throw error;
      return data && { success: true, challengeId, expiresAt: Date.parse(data.expires_at), sentAt: Date.parse(data.sent_at) };
    }
    if (req.body.retry !== false) {
      const existing = await resumeChallenge();
      if (existing) return res.json(existing);
    }
    const code = signupCode();
    const { data, error } = await supabaseAdmin.rpc("start_applicant_signup", {
      address: cleanEmail, challenge: challengeId, digest: signupDigest(challengeId, code),
      applicant_name: fullName.trim(), mobile: mobileNumber.trim(), secret_password: password,
    });
    if (error) throw error;
    if (!data) {
      const concurrent = await resumeChallenge();
      if (concurrent) return res.json(concurrent);
      return res.status(429).json({ success: false, message: "A code was recently requested for this email. Wait 30 seconds before starting again." });
    }
    return deliverSignupCode(res, cleanEmail, challengeId, code);
  } catch (err) {
    console.error("signup controller error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error during registration",
      error: err.message,
    });
  }
}

/**
 * @controller  login
 * @route       POST /auth/login
 * @desc        Authenticate student using Email and Password (No OTP required)
 */
async function login(req, res) {
  return passwordLogin(req, res, false);
}

async function memberLogin(req, res) {
  return passwordLogin(req, res, true);
}

async function passwordLogin(req, res, membersOnly) {
  try {
    const { identifier, email, password, otp } = req.body;
    let inputEmail = (email || identifier || "").trim().toLowerCase();
    if (membersOnly && /^mf-[a-z0-9-]+$/i.test(inputEmail)) {
      const app = await ApplicationModel.findById(inputEmail.toUpperCase());
      const owner = app?.user_id && await supabaseAdmin.auth.admin.getUserById(app.user_id);
      inputEmail = owner?.data?.user?.email || "";
      if (!inputEmail) return res.status(401).json({ success: false, message: "Invalid credentials." });
    }

    if (!inputEmail) {
      return res.status(400).json({
        success: false,
        message: "Email address is required to sign in",
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required to sign in",
      });
    }

    // Authenticate with Supabase password auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email: inputEmail,
      password: password,
    });

    if (error) {
      console.warn("Supabase signInWithPassword failed:", error.message);
      return res.status(400).json({
        success: false,
        message: "Invalid email or password. Please verify and try again.",
        error: error.message,
      });
    }

    const { session, user } = data;

    const role = membersOnly ? await getMemberRole(user) : null;
    if (membersOnly && !role) return res.status(403).json({ success: false, message: "Main portal access opens after final admission approval. Track your status in the applicant portal." });

    // Check if 2FA (Authenticator App) is enabled for this student/alumni
    const is2FAEnabled = Boolean(user?.user_metadata?.two_factor_enabled);
    if (is2FAEnabled) {
      const cleanOtp = (otp || "").toString().trim();
      if (!cleanOtp) {
        return res.status(200).json({
          success: true,
          requires2FA: true,
          message: "Two-factor authentication required. Please enter the 6-digit code from your authenticator app.",
        });
      }

      const secret = user?.user_metadata?.two_factor_secret;
      const isValidOtp = TwoFactorService.verifyToken(cleanOtp, secret);
      if (!isValidOtp) {
        return res.status(401).json({
          success: false,
          message: "Invalid verification code. Please check your authenticator app or enter 123456.",
        });
      }
    }

    // Generate custom 7-hour JWT access token
    const jwtToken = JwtService.signToken({
      id: user.id,
      email: user.email,
      role: user.user_metadata?.role || "applicant",
      phone: user.phone || user.user_metadata?.phone,
      user_metadata: { full_name: user.user_metadata?.full_name, role: user.user_metadata?.role },
      type: "user",
    });

    const enhancedSession = session ? {
      ...session,
      access_token: jwtToken || session.access_token,
      expires_in: 7 * 3600, // 7 hours in seconds
      token_type: "bearer",
    } : {
      access_token: jwtToken,
      expires_in: 7 * 3600,
      token_type: "bearer",
    };

    return res.status(200).json({
      success: true,
      message: "Login successful!",
      memberRole: role,
      token: jwtToken,
      expiresIn: "7h",
      session: enhancedSession,
      user,
    });
  } catch (err) {
    console.error("login controller error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error during authentication",
      error: err.message,
    });
  }
}

/**
 * @controller  changePassword
 * @route       POST /auth/change-password
 * @desc        Change student/alumni password
 */
async function changePassword(req, res) {
  try {
    const { email, currentPassword, newPassword } = req.body;
    const cleanEmail = (email || req.user?.email || "").trim().toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({
        success: false,
        message: "User email is required.",
      });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters.",
      });
    }

    // 1. Verify current password with Supabase if provided
    if (currentPassword) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: currentPassword,
      });

      if (signInErr) {
        return res.status(400).json({
          success: false,
          message: "Incorrect current password. Please enter your existing password correctly.",
        });
      }
    }

    // 2. Look up user by email in auth.users
    let userId = req.user?.id;
    if (!userId) {
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
      const found = listData?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);
      if (found) userId = found.id;
    }

    if (userId) {
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: newPassword,
      });

      if (updateErr) {
        console.error("Supabase password update error:", updateErr.message);
        return res.status(400).json({
          success: false,
          message: updateErr.message || "Failed to update password",
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Password updated successfully in Supabase.",
    });
  } catch (err) {
    console.error("auth changePassword error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error changing password",
      error: err.message,
    });
  }
}

/**
 * @controller  forgotPasswordSendOtp
 * @route       POST /auth/forgot-password/send-otp
 * @desc        Send 6-digit OTP code to registered student/alumni email for password reset
 */
async function forgotPasswordSendOtp(req, res) {
  try {
    const { email } = req.body;
    const cleanEmail = (email || "").trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      return res.status(400).json({
        success: false,
        message: "A valid email address is required.",
      });
    }

    // Verify if account exists in Supabase auth
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
    const found = listData?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);

    if (!found) {
      return res.status(404).json({
        success: false,
        message: "No account registered with this email address. Please verify and try again.",
      });
    }

    // Generate secure 6-digit OTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const userName = found.user_metadata?.full_name || found.user_metadata?.name || "Scholar";

    // Store in devOtpStore with 15 min TTL
    devOtpStore.set(`reset_${cleanEmail}`, {
      code: generatedOtp,
      timestamp: Date.now(),
      userId: found.id,
    });

    // Send email via EmailService
    await EmailService.sendPasswordResetOtp(cleanEmail, generatedOtp, userName);

    console.log(`🔑 Password reset OTP for ${cleanEmail}: ${generatedOtp}`);

    return res.status(200).json({
      success: true,
      message: `A 6-digit verification code has been sent to ${cleanEmail}.`,
      target: cleanEmail,
      devOtp: process.env.NODE_ENV !== "production" ? generatedOtp : undefined,
    });
  } catch (err) {
    console.error("forgotPasswordSendOtp error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to send password reset code. Please try again.",
      error: err.message,
    });
  }
}

/**
 * @controller  forgotPasswordReset
 * @route       POST /auth/forgot-password/reset
 * @desc        Verify OTP and update user password directly in Supabase
 */
async function forgotPasswordReset(req, res) {
  try {
    const { email, otp, newPassword, confirmPassword } = req.body;
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanOtp = (otp || "").toString().trim();

    if (!cleanEmail) {
      return res.status(400).json({
        success: false,
        message: "Email address is required.",
      });
    }

    if (!cleanOtp || cleanOtp.length !== 6) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 6-digit verification code.",
      });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters.",
      });
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match.",
      });
    }

    // Validate OTP (stored OTP or 123456 dev bypass)
    const stored = devOtpStore.get(`reset_${cleanEmail}`);
    const isCodeValid =
      cleanOtp === "123456" ||
      (stored && stored.code === cleanOtp && Date.now() - stored.timestamp < 15 * 60 * 1000);

    if (!isCodeValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification code. Please check your email or enter 123456.",
      });
    }

    // Look up user in Supabase
    let userId = stored?.userId;
    if (!userId) {
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
      const found = listData?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);
      if (found) userId = found.id;
    }

    if (!userId) {
      return res.status(404).json({
        success: false,
        message: "User account not found in database.",
      });
    }

    // Update password in Supabase auth
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateErr) {
      console.error("Supabase password reset update error:", updateErr.message);
      return res.status(400).json({
        success: false,
        message: updateErr.message || "Failed to update password in database.",
      });
    }

    // Clear used OTP
    devOtpStore.delete(`reset_${cleanEmail}`);

    console.log(`✅ Password successfully reset for user ${cleanEmail} (${userId})`);

    return res.status(200).json({
      success: true,
      message: "Your password has been successfully reset! You can now log in with your new password.",
    });
  } catch (err) {
    console.error("forgotPasswordReset error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to reset password. Please try again.",
      error: err.message,
    });
  }
}

/**
 * @controller  changeEmail
 * @route       POST /auth/change-email
 * @desc        Change student/alumni login email / ID
 */
async function changeEmail(req, res) {
  try {
    const { currentEmail, newEmail } = req.body;
    const cleanCurrent = (currentEmail || req.user?.email || "").trim().toLowerCase();
    const cleanNew = (newEmail || "").trim().toLowerCase();

    if (!cleanNew || !cleanNew.includes("@") || !cleanNew.includes(".")) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid new email address.",
      });
    }

    if (cleanCurrent === cleanNew) {
      return res.status(400).json({
        success: false,
        message: "New email must be different from current email.",
      });
    }

    // 1. Check if user exists in Supabase auth.users
    let userId = req.user?.id;
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
    const foundCurrent = listData?.users?.find((u) => u.email?.toLowerCase() === cleanCurrent);
    if (foundCurrent) userId = foundCurrent.id;

    const alreadyTaken = listData?.users?.find(
      (u) => u.email?.toLowerCase() === cleanNew && u.id !== userId
    );
    if (alreadyTaken) {
      return res.status(400).json({
        success: false,
        message: "Email address is already registered to another account.",
      });
    }

    if (userId) {
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        email: cleanNew,
        email_confirm: true,
      });

      if (updateErr) {
        console.error("Supabase email update error:", updateErr.message);
        return res.status(400).json({
          success: false,
          message: updateErr.message || "Failed to update login email",
        });
      }
    }

    // Also update any matching applications record
    try {
      await supabaseAdmin
        .from("applications")
        .update({ email: cleanNew })
        .eq("email", cleanCurrent);
    } catch (e) {
      // ignore
    }

    return res.status(200).json({
      success: true,
      message: `Login email updated successfully to ${cleanNew}.`,
      newEmail: cleanNew,
    });
  } catch (err) {
    console.error("auth changeEmail error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error changing login email",
      error: err.message,
    });
  }
}

/**
 * @controller  get2FASetup
 * @route       GET /auth/setup-2fa
 * @desc        Generate TOTP secret, otpauth URI, and QR Code for authenticator apps
 */
async function get2FASetup(req, res) {
  try {
    const { email } = req.query;
    const cleanEmail = (email || req.user?.email || "").trim().toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({
        success: false,
        message: "User email is required.",
      });
    }

    const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
    const found = listData?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);
    const existingSecret = found?.user_metadata?.two_factor_secret;

    const { qrDataUrl, secret } = await TwoFactorService.generateQrCode(cleanEmail, existingSecret);

    if (found && !existingSecret) {
      await supabaseAdmin.auth.admin.updateUserById(found.id, {
        user_metadata: {
          ...(found.user_metadata || {}),
          two_factor_secret: secret,
        },
      });
    }

    const isTwoFactorActive = Boolean(found?.user_metadata?.two_factor_enabled);

    return res.status(200).json({
      success: true,
      twoFactorEnabled: isTwoFactorActive,
      qrCodeUrl: qrDataUrl,
      twoFactorSecret: secret,
      message: "Scan this QR code with Google Authenticator or Microsoft Authenticator.",
    });
  } catch (err) {
    console.error("get2FASetup error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error generating 2FA setup QR",
      error: err.message,
    });
  }
}

/**
 * @controller  toggle2FA
 * @route       POST /auth/toggle-2fa
 * @desc        Enable or disable Two-Factor Authentication for student/alumni with verification
 */
async function toggle2FA(req, res) {
  try {
    const { email, enable, verificationCode } = req.body;
    const cleanEmail = (email || req.user?.email || "").trim().toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({
        success: false,
        message: "User email is required.",
      });
    }

    const isEnabled = Boolean(enable);
    let userId = req.user?.id;
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
    const found = listData?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);
    if (found) userId = found.id;

    if (isEnabled) {
      if (!verificationCode) {
        return res.status(400).json({
          success: false,
          message: "Please provide the 6-digit verification code from your authenticator app.",
        });
      }

      let secret = found?.user_metadata?.two_factor_secret;
      if (!secret) {
        const generated = TwoFactorService.createSecret();
        secret = generated;
      }

      const isValid = TwoFactorService.verifyToken(verificationCode, secret);
      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: "Invalid verification code. Please check your authenticator app or enter 123456.",
        });
      }

      if (userId) {
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: {
            ...(found?.user_metadata || {}),
            two_factor_enabled: true,
            two_factor_secret: secret,
          },
        });
      }

      return res.status(200).json({
        success: true,
        twoFactorEnabled: true,
        message: "Two-Factor Authentication is now active and protecting your account.",
      });
    } else {
      if (userId) {
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: {
            ...(found?.user_metadata || {}),
            two_factor_enabled: false,
          },
        });
      }

      return res.status(200).json({
        success: true,
        twoFactorEnabled: false,
        message: "Two-Factor Authentication has been disabled for your account.",
      });
    }
  } catch (err) {
    console.error("auth toggle2FA error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error toggling 2FA",
      error: err.message,
    });
  }
}

/**
 * @controller  getMe
 * @route       GET /api/auth/me
 * @desc        Get authenticated student profile from Supabase auth.users
 */
async function getMe(req, res) {
  return res.status(200).json({
    success: true,
    user: req.user,
  });
}

module.exports = {
  signup,
  memberLogin,
  login,
  sendOtp,
  verifyOtp,
  getMe,
  changePassword,
  changeEmail,
  toggle2FA,
  get2FASetup,
  forgotPasswordSendOtp,
  forgotPasswordReset,
};
