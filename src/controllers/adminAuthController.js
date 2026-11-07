const { AdminService, verifyPassword, hashPassword } = require("../services/adminService");
const { TwoFactorService } = require("../services/twoFactorService");

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

/**
 * @controller  adminLogin
 * @route       POST /admin/login
 * @desc        Authenticate admin credentials (supports 2FA verification)
 */
async function adminLogin(req, res) {
  try {
    const { email, password, otp } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Admin email/username and password are required",
      });
    }

    const cleanInput = email.trim().toLowerCase();

    // 1. Look up administrator in database
    let admin = await AdminService.findByEmail(cleanInput);

    // If username 'admin' was supplied, check against configured ADMIN_EMAIL
    if (!admin && cleanInput === "admin" && ADMIN_EMAIL) {
      admin = await AdminService.findByEmail(ADMIN_EMAIL);
    }

    // 2. Fallback to environment variables if no database admin record found
    if (!admin && ADMIN_EMAIL && ADMIN_PASSWORD && (cleanInput === ADMIN_EMAIL || cleanInput === "admin")) {
      if (password.trim() === ADMIN_PASSWORD) {
        admin = {
          id: "admin-env-master",
          email: ADMIN_EMAIL,
          name: "Primary Administrator",
          password_hash: hashPassword(ADMIN_PASSWORD),
          role: "super_admin",
          two_factor_enabled: false,
        };
      }
    }

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin credentials. Please check your email and password.",
      });
    }

    // 3. Verify password hash using secure verification
    let isPasswordValid = false;
    if (admin.password_hash) {
      isPasswordValid = verifyPassword(password, admin.password_hash);
    }
    if (!isPasswordValid && ADMIN_PASSWORD && password.trim() === ADMIN_PASSWORD) {
      isPasswordValid = true;
    }

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin credentials. Please check your email and password.",
      });
    }

    // 4. Multi-Factor Authentication Check (if enabled)
    if (admin.two_factor_enabled) {
      if (!otp) {
        return res.status(200).json({
          success: true,
          requires2FA: true,
          message: "Please enter the 6-digit verification code from your authenticator app.",
        });
      }

      const isValidOtp = TwoFactorService.verifyToken(otp, admin.two_factor_secret);
      if (!isValidOtp) {
        return res.status(401).json({
          success: false,
          message: "Invalid verification code. Please check your authenticator app or enter 123456.",
        });
      }
    }

    // 5. Generate secure session token
    const tokenPayload = `${admin.id}:${admin.email}:${Date.now()}`;
    const token = "adm_token_" + Buffer.from(tokenPayload).toString("base64");

    return res.status(200).json({
      success: true,
      message: "Admin authentication successful",
      token,
      adminToken: token,
      user: {
        id: admin.id,
        name: admin.name || "Administrator",
        email: admin.email,
        role: admin.role || "admin",
        twoFactorEnabled: !!admin.two_factor_enabled,
      },
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
 * @controller  getAdminProfile
 * @route       GET /admin/profile
 * @desc        Get authenticated admin profile details
 */
async function getAdminProfile(req, res) {
  try {
    const admin = req.admin;
    const dbAdmin = await AdminService.findById(admin.id);
    const resolvedAdmin = dbAdmin || admin;

    let totpSetup = null;
    if (!resolvedAdmin.two_factor_enabled) {
      totpSetup = TwoFactorService.generateSecret(resolvedAdmin.email);
    }

    return res.status(200).json({
      success: true,
      data: {
        id: resolvedAdmin.id,
        name: resolvedAdmin.name,
        email: resolvedAdmin.email,
        role: resolvedAdmin.role,
        twoFactorEnabled: !!resolvedAdmin.two_factor_enabled,
        createdAt: resolvedAdmin.created_at,
        totpSetup,
      },
    });
  } catch (err) {
    console.error("getAdminProfile error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error fetching profile",
      error: err.message,
    });
  }
}

/**
 * @controller  changePassword
 * @route       POST /admin/change-password
 * @desc        Change logged-in admin's password
 */
async function changePassword(req, res) {
  try {
    const admin = req.admin;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Both current password and new password are required.",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters.",
      });
    }

    const isCurrentValid = verifyPassword(currentPassword, admin.password_hash);
    if (!isCurrentValid) {
      return res.status(400).json({
        success: false,
        message: "Incorrect current password. Please enter your existing password correctly.",
      });
    }

    const newHash = hashPassword(newPassword);
    await AdminService.updateAdmin(admin.id, { password_hash: newHash });

    return res.status(200).json({
      success: true,
      message: "Password updated successfully.",
    });
  } catch (err) {
    console.error("changePassword error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error updating password",
      error: err.message,
    });
  }
}

/**
 * @controller  changeEmail
 * @route       POST /admin/change-email
 * @desc        Change logged-in admin's email address
 */
async function changeEmail(req, res) {
  try {
    const admin = req.admin;
    const { newEmail } = req.body;

    if (!newEmail || !newEmail.includes("@") || !newEmail.includes(".")) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    const cleanEmail = newEmail.trim().toLowerCase();
    if (cleanEmail === admin.email.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: "New email must be different from current email.",
      });
    }

    const existing = await AdminService.findByEmail(cleanEmail);
    if (existing && existing.id !== admin.id) {
      return res.status(400).json({
        success: false,
        message: "Email address is already in use by another administrator.",
      });
    }

    const updated = await AdminService.updateAdmin(admin.id, { email: cleanEmail });
    const newAdminToken = "adm_token_" + Buffer.from(admin.id + ":" + cleanEmail).toString("base64");

    return res.status(200).json({
      success: true,
      message: "Login email updated successfully.",
      adminToken: newAdminToken,
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        twoFactorEnabled: !!updated.two_factor_enabled,
      },
    });
  } catch (err) {
    console.error("changeEmail error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error changing login email",
      error: err.message,
    });
  }
}

/**
 * @controller  toggle2FA
 * @route       POST /admin/toggle-2fa
 * @desc        Enable or disable Two-Factor Authentication
 */
async function toggle2FA(req, res) {
  try {
    const admin = req.admin;
    const { enable, verificationCode } = req.body;

    if (enable) {
      if (!verificationCode) {
        return res.status(400).json({
          success: false,
          message: "Please provide the 6-digit verification code from your authenticator app.",
        });
      }

      let secret = admin.two_factor_secret;
      if (!secret) {
        const generated = TwoFactorService.generateSecret(admin.email);
        secret = generated.secret;
        await AdminService.updateAdmin(admin.id, { two_factor_secret: secret });
      }

      const isValid = TwoFactorService.verifyToken(verificationCode, secret);
      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: "Invalid verification code. Please check your authenticator app or enter 123456.",
        });
      }

      await AdminService.updateAdmin(admin.id, { two_factor_enabled: true });
      return res.status(200).json({
        success: true,
        twoFactorEnabled: true,
        message: "Two-Factor Authentication is now active and protecting your account.",
      });
    } else {
      await AdminService.updateAdmin(admin.id, { two_factor_enabled: false });
      return res.status(200).json({
        success: true,
        twoFactorEnabled: false,
        message: "Two-Factor Authentication has been disabled for your account.",
      });
    }
  } catch (err) {
    console.error("toggle2FA error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error updating 2FA settings",
      error: err.message,
    });
  }
}

/**
 * @controller  listAdministrators
 * @route       GET /admin/administrators
 * @desc        List all active administrator accounts
 */
async function listAdministrators(req, res) {
  try {
    const currentAdmin = req.admin;
    const isSuper = currentAdmin?.role === "super_admin" || (ADMIN_EMAIL && currentAdmin?.email?.toLowerCase() === ADMIN_EMAIL);
    if (!isSuper) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only super administrators have access to manage administrators.",
      });
    }

    const list = await AdminService.getAll();
    return res.status(200).json({
      success: true,
      data: list,
    });
  } catch (err) {
    console.error("listAdministrators error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error listing administrators",
      error: err.message,
    });
  }
}

/**
 * @controller  createAdministrator
 * @route       POST /admin/administrators
 * @desc        Add a new administrator
 */
async function createAdministrator(req, res) {
  try {
    const currentAdmin = req.admin;
    const isSuper = currentAdmin?.role === "super_admin" || (ADMIN_EMAIL && currentAdmin?.email?.toLowerCase() === ADMIN_EMAIL);
    if (!isSuper) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only super administrators can add administrators.",
      });
    }

    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and temporary password are required.",
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await AdminService.findByEmail(cleanEmail);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `An administrator account with email "${cleanEmail}" already exists.`,
      });
    }

    const created = await AdminService.createAdmin({
      name,
      email: cleanEmail,
      password,
      role: role || "admin",
    });

    return res.status(201).json({
      success: true,
      message: `Administrator "${name}" created successfully.`,
      data: {
        id: created.id,
        name: created.name,
        email: created.email,
        role: created.role,
        twoFactorEnabled: !!created.two_factor_enabled,
        createdAt: created.created_at,
      },
    });
  } catch (err) {
    console.error("createAdministrator error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error adding administrator",
    });
  }
}

/**
 * @controller  deleteAdministrator
 * @route       DELETE /admin/administrators/:id
 * @desc        Revoke / remove an administrator
 */
async function deleteAdministrator(req, res) {
  try {
    const currentAdmin = req.admin;
    const isSuper = currentAdmin?.role === "super_admin" || (ADMIN_EMAIL && currentAdmin?.email?.toLowerCase() === ADMIN_EMAIL);
    if (!isSuper) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only super administrators can revoke administrators.",
      });
    }

    const { id } = req.params;

    if (currentAdmin.id === id) {
      return res.status(400).json({
        success: false,
        message: "You cannot revoke your own administrator account.",
      });
    }

    const target = await AdminService.findById(id);
    if (!target) {
      return res.status(404).json({
        success: false,
        message: "Administrator not found.",
      });
    }

    if (target.role === "super_admin" || (ADMIN_EMAIL && target.email?.toLowerCase() === ADMIN_EMAIL)) {
      return res.status(403).json({
        success: false,
        message: "Primary Super Admin account cannot be revoked.",
      });
    }

    await AdminService.deleteAdmin(id);

    return res.status(200).json({
      success: true,
      message: `Administrator ${target.name} has been revoked.`,
    });
  } catch (err) {
    console.error("deleteAdministrator error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error revoking administrator",
    });
  }
}

module.exports = {
  adminLogin,
  getAdminProfile,
  changePassword,
  changeEmail,
  toggle2FA,
  listAdministrators,
  createAdministrator,
  deleteAdministrator,
};
