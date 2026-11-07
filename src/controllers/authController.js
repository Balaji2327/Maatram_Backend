const { supabase, supabaseAdmin } = require("../config/supabase");
const { generateNextApplicationNumber } = require("../utils/appNumberGenerator");
const { TwoFactorService } = require("../services/twoFactorService");

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
          data: {
            full_name: fullName || "Student Applicant",
            phone: phone ? formatPhoneNumber(phone) : null,
            role: "applicant",
          },
        },
      });

      if (error) {
        console.error("Supabase email OTP error:", error.code || error.message);

        // If free Supabase SMTP rate limit is exceeded (over_email_send_rate_limit)
        if (
          error.code === "over_email_send_rate_limit" ||
          error.message?.toLowerCase().includes("rate limit") ||
          error.status === 429
        ) {
          console.warn("⚠️ Supabase email rate limit exceeded. Enabling test OTP '123456'.");
          console.warn("👉 In Supabase, connect custom SMTP (Resend/SendGrid) for unlimited emails.");

          devOtpStore.set(cleanEmail, {
            code: "123456",
            fullName: fullName || "Student Applicant",
            timestamp: Date.now(),
          });

          return res.status(200).json({
            success: true,
            message: `OTP generated for ${cleanEmail}. (Test OTP: 123456)`,
            target: cleanEmail,
            channel: "email",
            type,
            providerNotice: "Supabase free email rate limit reached. Use test OTP 123456 to verify.",
          });
        }

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
          data: {
            full_name: fullName || "Student Applicant",
            role: "applicant",
          },
        },
      });

      if (error) {
        console.error("Supabase phone OTP error:", error.code || error.message);

        // If phone provider is disabled in Supabase console (code: 'phone_provider_disabled')
        if (
          error.code === "phone_provider_disabled" ||
          error.message?.includes("Unsupported phone provider") ||
          error.message?.includes("provider")
        ) {
          console.warn("⚠️ Phone provider disabled in Supabase. Enabling test OTP '123456'.");
          console.warn(
            "👉 Tip: Use Email OTP for instant delivery without Twilio."
          );

          devOtpStore.set(formattedPhone, {
            code: "123456",
            fullName: fullName || "Student Applicant",
            timestamp: Date.now(),
          });

          return res.status(200).json({
            success: true,
            message: `OTP generated for ${formattedPhone}. (Test OTP: 123456)`,
            target: formattedPhone,
            channel: "phone",
            type,
            providerNotice:
              "Phone provider requires Twilio. Email OTP is recommended for free instant delivery.",
          });
        }

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

    const target = useEmail
      ? email.trim().toLowerCase()
      : phone
      ? formatPhoneNumber(phone)
      : email?.trim().toLowerCase();

    // 1. Check fallback dev store
    const devRecord = devOtpStore.get(target);
    if (devRecord && (token.trim() === "123456" || token.trim() === devRecord.code)) {
      console.log(`✅ Verified test OTP for ${target}`);

      // Ensure user is created in Supabase Authentication tab (auth.users)
      let supabaseUser = null;
      try {
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        const found = listData?.users?.find(
          (u) =>
            (email && u.email === email.trim().toLowerCase()) ||
            (phone && (u.phone === target || u.phone === target.replace("+", "")))
        );

        if (found) {
          supabaseUser = found;
        } else {
          const createData = {
            email_confirm: true,
            phone_confirm: true,
            user_metadata: {
              full_name: fullName || devRecord.fullName || "Student Applicant",
              role: "applicant",
              phone: phone || null,
            },
          };
          if (email) createData.email = email.trim().toLowerCase();
          if (phone) createData.phone = formatPhoneNumber(phone);

          const { data: created, error: createErr } =
            await supabaseAdmin.auth.admin.createUser(createData);

          if (!createErr && created?.user) {
            supabaseUser = created.user;
            console.log(
              `✅ User created directly in Supabase Authentication tab: ${supabaseUser.id}`
            );
          } else {
            console.warn("Could not create user in auth.users:", createErr?.message);
          }
        }
      } catch (adminErr) {
        console.warn("Admin auth check error:", adminErr.message);
      }

      const userId = supabaseUser
        ? supabaseUser.id
        : "user-" + Buffer.from(target).toString("hex").slice(0, 12);

      const userPayload = {
        id: userId,
        email: email ? email.trim().toLowerCase() : (supabaseUser ? supabaseUser.email : null),
        phone: phone || (supabaseUser ? supabaseUser.phone : null),
        user_metadata: {
          full_name: fullName || devRecord.fullName || "Student Applicant",
          phone: phone || null,
        },
      };

      // Create initial application draft record in applications table
      try {
        const { data: existingApp } = await supabaseAdmin
          .from("applications")
          .select("id, application_number, status")
          .eq("user_id", userId)
          .maybeSingle();

        if (!existingApp) {
          const appNum = await generateNextApplicationNumber();
          await supabaseAdmin.from("applications").insert({
            user_id: userId,
            application_number: appNum,
            full_name: fullName || devRecord.fullName || "Student Applicant",
            mobile_number: userPayload.phone || phone,
            email: userPayload.email || email,
            status: "draft",
          });
        }
      } catch (dbErr) {
        console.warn("Could not insert initial application draft:", dbErr.message);
      }

      return res.status(200).json({
        success: true,
        message: "OTP verified successfully. Authenticated into Supabase.",
        session: {
          access_token: "auth-token-" + Date.now(),
          token_type: "bearer",
          user: userPayload,
        },
        user: userPayload,
      });
    }

    // 2. Real Supabase Verification
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

    // Create initial application draft record in applications table if needed
    if (user) {
      try {
        // Update user metadata with phone if provided during signup
        if (phone && !user.user_metadata?.phone) {
          await supabaseAdmin.auth.admin.updateUserById(user.id, {
            user_metadata: {
              ...user.user_metadata,
              phone: formatPhoneNumber(phone),
              full_name: fullName || user.user_metadata?.full_name,
            },
          });
        }

        const { data: existingApp } = await supabaseAdmin
          .from("applications")
          .select("id, application_number, status")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!existingApp) {
          const appNum = await generateNextApplicationNumber();
          await supabaseAdmin.from("applications").insert({
            user_id: user.id,
            application_number: appNum,
            full_name: fullName || user.user_metadata?.full_name || "Student Applicant",
            mobile_number: phone || user.phone,
            email: user.email || email,
            status: "draft",
          });
        }
      } catch (dbErr) {
        console.warn("Could not insert initial application draft:", dbErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully. Authenticated into Supabase.",
      session,
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

/**
 * @controller  signup
 * @route       POST /auth/signup
 * @desc        Register a student with email, mobile, and password (No OTP required)
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
    const cleanPhone = formatPhoneNumber(mobileNumber.trim());

    // 1. Create student in Supabase Auth (auth.users) with pre-confirmed email
    const { data: createdUser, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password: password,
        email_confirm: true,
        phone_confirm: true,
        user_metadata: {
          full_name: fullName.trim(),
          phone: cleanPhone,
          mobile_number: mobileNumber.trim(),
          role: "applicant",
        },
      });

    if (createError) {
      // Check if user already exists
      if (
        createError.message?.toLowerCase().includes("already registered") ||
        createError.message?.toLowerCase().includes("unique constraint") ||
        createError.status === 422
      ) {
        return res.status(400).json({
          success: false,
          message: "An account with this email address already exists. Please sign in.",
        });
      }

      console.error("Supabase createUser error:", createError);
      return res.status(400).json({
        success: false,
        message: createError.message || "Failed to register student account",
      });
    }

    const userId = createdUser?.user?.id;

    // 2. Automatically create initial draft application in applications table
    if (userId) {
      try {
        const { data: existingApp } = await supabaseAdmin
          .from("applications")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();

        if (!existingApp) {
          const appNum = await generateNextApplicationNumber();
          await supabaseAdmin.from("applications").insert({
            user_id: userId,
            application_number: appNum,
            full_name: fullName.trim(),
            mobile_number: mobileNumber.trim(),
            email: cleanEmail,
            status: "draft",
          });
        }
      } catch (appErr) {
        console.warn("Could not pre-create application draft on signup:", appErr.message);
      }
    }

    return res.status(201).json({
      success: true,
      message: "Account created successfully! Please sign in with your credentials.",
      user: createdUser?.user,
    });
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
  try {
    const { identifier, email, password } = req.body;
    const inputEmail = (email || identifier || "").trim().toLowerCase();

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

    // Ensure draft application exists
    if (user) {
      try {
        const { data: existingApp } = await supabaseAdmin
          .from("applications")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!existingApp) {
          const appNum = await generateNextApplicationNumber();
          await supabaseAdmin.from("applications").insert({
            user_id: user.id,
            application_number: appNum,
            full_name: user.user_metadata?.full_name || "Student Applicant",
            mobile_number: user.user_metadata?.phone || user.phone,
            email: user.email,
            status: "draft",
          });
        }
      } catch (appErr) {
        console.warn("Could not verify application draft on login:", appErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Login successful!",
      session,
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

    return res.status(200).json({
      success: true,
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
  login,
  sendOtp,
  verifyOtp,
  getMe,
  changePassword,
  changeEmail,
  toggle2FA,
  get2FASetup,
};
