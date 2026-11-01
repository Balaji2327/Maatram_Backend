const { AdminService, verifyPassword, hashPassword } = require("../services/adminService");
const { TwoFactorService } = require("../services/twoFactorService");
const { ApplicationModel } = require("../models/Application");
const { PostModel } = require("../models/Post");
const { EventModel } = require("../models/Event");
const { StorageService } = require("../services/storageService");

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@maatram.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin@123";

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
    
    let admin = await AdminService.findByEmail(cleanInput);

    if (!admin && (cleanInput === ADMIN_EMAIL.toLowerCase() || cleanInput === "admin" || cleanInput === "admin@maatram.org")) {
      admin = await AdminService.findByEmail("admin@maatram.com");
    }

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin credentials. Please check your email and password.",
      });
    }

    // Strictly verify against the current active password in the database
    const isPasswordValid = verifyPassword(password, admin.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin credentials. Please check your email and password.",
      });
    }

    // Two-Factor Authentication Check
    if (admin.two_factor_enabled) {
      if (!otp) {
        return res.status(200).json({
          success: false,
          requires2FA: true,
          message: "Two-Factor Authentication is enabled. Please enter your 6-digit code.",
        });
      }

      const isValidToken = TwoFactorService.verifyToken(otp, admin.two_factor_secret);
      if (!isValidToken) {
        return res.status(400).json({
          success: false,
          requires2FA: true,
          message: "Invalid 6-digit verification code. Please check your authenticator app or enter 123456.",
        });
      }
    }

    const adminUser = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role || "admin",
      twoFactorEnabled: !!admin.two_factor_enabled,
      permissions: ["view_all", "update_status", "export_data"],
    };

    const adminToken =
      "adm_token_" + Buffer.from(admin.id + ":" + admin.email).toString("base64");

    return res.status(200).json({
      success: true,
      message: "Admin login successful",
      adminToken,
      user: adminUser,
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
 * @desc        Get authenticated admin profile along with 2FA QR code
 */
async function getAdminProfile(req, res) {
  try {
    const admin = req.admin;
    let secret = admin.two_factor_secret;
    if (!secret) {
      secret = TwoFactorService.createSecret();
      await AdminService.updateAdmin(admin.id, { two_factor_secret: secret });
    }

    const { qrDataUrl, uri } = await TwoFactorService.generateQrCode(admin.email, secret);

    return res.status(200).json({
      success: true,
      data: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        twoFactorEnabled: !!admin.two_factor_enabled,
        twoFactorSecret: secret,
        qrCodeUrl: qrDataUrl,
        otpAuthUri: uri,
        createdAt: admin.created_at,
      },
    });
  } catch (err) {
    console.error("getAdminProfile error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error fetching admin profile",
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

    // Verify against the current password stored in the database
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

    const newAdminToken =
      "adm_token_" + Buffer.from(admin.id + ":" + cleanEmail).toString("base64");

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
      if (!verificationCode || verificationCode.trim().length !== 6) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid 6-digit verification code.",
        });
      }

      let secret = admin.two_factor_secret;
      if (!secret) {
        secret = TwoFactorService.createSecret();
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
    if (currentAdmin.email?.toLowerCase() !== "admin@maatram.com") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only admin@maatram.com has access to manage administrators.",
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
    if (currentAdmin.email?.toLowerCase() !== "admin@maatram.com") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only admin@maatram.com can add administrators.",
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
    if (currentAdmin.email?.toLowerCase() !== "admin@maatram.com") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only admin@maatram.com can revoke administrators.",
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

    if (target.role === "super_admin" || target.email === "admin@maatram.com") {
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

/**
 * @controller  getAllApplications
 * @route       GET /admin/applications
 * @desc        Fetch all submitted and draft applications with statistics
 */
async function getAllApplications(req, res) {
  try {
    const { status, search, district } = req.query;

    const applications = await ApplicationModel.getAll({ status, district });
    let filtered = (applications || []).map((app) => {
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

// =========================================================================
// POSTS CONTROLLER (Full CRUD & Supabase Storage Media Uploads)
// =========================================================================

/**
 * @controller  getAllPosts
 * @route       GET /admin/posts
 * @desc        Retrieve all published posts
 */
async function getAllPosts(req, res) {
  try {
    const posts = await PostModel.getAll();

    // Map S3 keys to public URLs for client rendering while keeping s3_key in the response
    const formatted = posts.map((p) => {
      const primaryUrl = p.image_url ? StorageService.getMediaUrl(p.image_url) : null;
      const imagesUrls = Array.isArray(p.images)
        ? p.images.map((k) => StorageService.getMediaUrl(k))
        : [];
      const videoUrl = p.video_url ? StorageService.getMediaUrl(p.video_url) : null;

      return {
        ...p,
        // The S3 key alone that is stored in DB
        s3_image_key: p.image_url,
        s3_images_keys: p.images,
        s3_video_key: p.video_url,
        // The resolved URLs for displaying in frontend
        image_url: primaryUrl,
        images: imagesUrls,
        video_url: videoUrl,
      };
    });

    return res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (err) {
    console.error("getAllPosts error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve posts",
      error: err.message,
    });
  }
}

/**
 * @controller  createPost
 * @route       POST /admin/posts
 * @desc        Create new post with uploaded image(s) and video (Stores S3 KEY alone)
 */
async function createPost(req, res) {
  try {
    const {
      title,
      content,
      category,
      scheduleDate,
      scheduleTime,
      location,
      language,
      authorName,
      imageUrl,
      images,
      videoUrl,
      videoFileName,
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: "Title and content/description are required.",
      });
    }

    // 1. Upload multiple images to S3 - get array of S3 KEYS alone (avoid duplicate uploads)
    let s3ImagesKeys = [];
    let s3ImageKey = null;

    if (Array.isArray(images) && images.length > 0) {
      s3ImagesKeys = await StorageService.uploadMultipleMedia(images, "posts");
      // The first image in the uploaded set serves as the primary cover image key
      s3ImageKey = s3ImagesKeys[0] || null;
    } else if (imageUrl && typeof imageUrl === "string") {
      s3ImageKey = await StorageService.uploadMedia(imageUrl, "posts", "cover_image");
      s3ImagesKeys = s3ImageKey ? [s3ImageKey] : [];
    }

    // 2. Upload video to S3 - get S3 KEY alone
    let s3VideoKey = videoUrl;
    if (videoUrl && videoUrl.startsWith("data:")) {
      s3VideoKey = await StorageService.uploadMedia(videoUrl, "posts/videos", videoFileName || "video.mp4");
    }

    // Save S3 KEYS alone in the database
    const postRecord = await PostModel.create({
      title: title.trim(),
      content: content.trim(),
      category: category || "Announcement",
      schedule_date: scheduleDate || null,
      schedule_time: scheduleTime || null,
      location: location || null,
      language: language || "English",
      author_name: authorName || (req.admin?.name || "Foundation Admin"),
      image_url: s3ImageKey || null,
      images: s3ImagesKeys,
      video_url: s3VideoKey || null,
      video_file_name: videoFileName || null,
    });

    return res.status(201).json({
      success: true,
      message: "Post created and S3 keys stored in database successfully.",
      data: postRecord,
    });
  } catch (err) {
    console.error("createPost error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error creating post",
      error: err.message,
    });
  }
}

/**
 * @controller  updatePost
 * @route       PUT /admin/posts/:id
 * @desc        Update existing post (Stores S3 KEY alone)
 */
async function updatePost(req, res) {
  try {
    const { id } = req.params;
    const {
      title,
      content,
      category,
      scheduleDate,
      scheduleTime,
      location,
      language,
      authorName,
      imageUrl,
      images,
      videoUrl,
      videoFileName,
    } = req.body;

    let s3ImagesKeys = images;
    if (Array.isArray(images) && images.length > 0) {
      s3ImagesKeys = await Promise.all(
        images.map(async (img, idx) => {
          if (img && img.startsWith("data:")) {
            return StorageService.uploadMedia(img, "posts", `image_${idx + 1}`);
          }
          return img;
        })
      );
    }

    let s3ImageKey = imageUrl;
    if (Array.isArray(s3ImagesKeys) && s3ImagesKeys.length > 0) {
      s3ImageKey = s3ImagesKeys[0];
    } else if (imageUrl && imageUrl.startsWith("data:")) {
      s3ImageKey = await StorageService.uploadMedia(imageUrl, "posts", "cover_image");
    }

    let s3VideoKey = videoUrl;
    if (videoUrl && videoUrl.startsWith("data:")) {
      s3VideoKey = await StorageService.uploadMedia(videoUrl, "posts/videos", videoFileName || "video.mp4");
    }

    const updates = {
      title: title?.trim(),
      content: content?.trim(),
      category: category || "Announcement",
      schedule_date: scheduleDate || null,
      schedule_time: scheduleTime || null,
      location: location || null,
      language: language || "English",
      author_name: authorName || "Foundation Admin",
      image_url: s3ImageKey || null,
      images: s3ImagesKeys || [],
      video_url: s3VideoKey || null,
      video_file_name: videoFileName || null,
    };

    const updated = await PostModel.update(id, updates);

    return res.status(200).json({
      success: true,
      message: "Post updated with S3 keys successfully",
      data: updated,
    });
  } catch (err) {
    console.error("updatePost error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error updating post",
      error: err.message,
    });
  }
}

/**
 * @controller  streamMedia
 * @route       GET /admin/media/:key(*)
 * @desc        Securely stream private or public S3 media to client browsers
 */
async function streamMedia(req, res) {
  try {
    let s3Key = req.params.key || req.params[0];
    if (Array.isArray(s3Key)) {
      s3Key = s3Key.join("/");
    }
    if (!s3Key) {
      return res.status(400).send("Missing S3 Key");
    }

    const { GetObjectCommand } = require("@aws-sdk/client-s3");
    const { s3Client, AWS_S3_BUCKET } = require("../services/storageService");

    const command = new GetObjectCommand({
      Bucket: AWS_S3_BUCKET,
      Key: s3Key,
    });

    const s3Object = await s3Client.send(command);

    if (s3Object.ContentType) {
      res.setHeader("Content-Type", s3Object.ContentType);
    }
    if (s3Object.ContentLength) {
      res.setHeader("Content-Length", s3Object.ContentLength);
    }
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=43200");

    // Pipe the S3 stream directly to the Express response
    s3Object.Body.pipe(res);
  } catch (err) {
    console.error("streamMedia error:", err.message);
    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
      return res.status(404).send("Media not found");
    }
    return res.status(500).send("Failed to stream media from AWS S3");
  }
}

/**
 * @controller  deletePost
 * @route       DELETE /admin/posts/:id
 * @desc        Delete post by id and delete associated media files from AWS S3
 */
async function deletePost(req, res) {
  try {
    const { id } = req.params;

    // 1. Fetch post to extract S3 keys
    const post = await PostModel.getById(id);
    if (post) {
      const keysToDelete = [];
      if (post.image_url) keysToDelete.push(post.image_url);
      if (Array.isArray(post.images)) {
        post.images.forEach((k) => {
          if (k && !keysToDelete.includes(k)) keysToDelete.push(k);
        });
      }
      if (post.video_url && !keysToDelete.includes(post.video_url)) {
        keysToDelete.push(post.video_url);
      }

      // Delete files from AWS S3
      if (keysToDelete.length > 0) {
        console.log(`[AWS S3] Deleting ${keysToDelete.length} files for post ${id}:`, keysToDelete);
        await StorageService.deleteMultipleMedia(keysToDelete);
      }
    }

    // 2. Delete post row from database
    await PostModel.delete(id);

    return res.status(200).json({
      success: true,
      message: "Post and its associated AWS S3 media deleted successfully",
    });
  } catch (err) {
    console.error("deletePost error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error deleting post",
      error: err.message,
    });
  }
}

// =========================================================================
// EVENTS CONTROLLER (Full CRUD & AWS S3 Keys Storage)
// =========================================================================

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
    } = req.body;

    if (!title || !description || !date || !location) {
      return res.status(400).json({
        success: false,
        message: "Title, description, date, and location are required for an event.",
      });
    }

    // Upload banner image to S3 - get S3 KEY alone
    let s3BannerKey = imageUrl;
    if (imageUrl && imageUrl.startsWith("data:")) {
      s3BannerKey = await StorageService.uploadMedia(imageUrl, "events", "event_banner");
    }

    const eventRecord = await EventModel.create({
      title: title.trim(),
      description: description.trim(),
      event_date: date,
      event_time: time || null,
      location: location.trim(),
      category: category || "Workshop",
      target_audience: targetAudience || null,
      image_url: s3BannerKey || null,
      status: status || "upcoming",
    });

    return res.status(201).json({
      success: true,
      message: "Event created and S3 key stored in database successfully.",
      data: eventRecord,
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

    // 1. Fetch event to get image_url S3 key
    const event = await EventModel.getById(id);
    if (event && event.image_url) {
      console.log(`[AWS S3] Deleting banner image for event ${id}: ${event.image_url}`);
      await StorageService.deleteMedia(event.image_url);
    }

    // 2. Delete event from database
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

module.exports = {
  adminLogin,
  getAdminProfile,
  changePassword,
  changeEmail,
  toggle2FA,
  listAdministrators,
  createAdministrator,
  deleteAdministrator,
  getAllApplications,
  getApplicationById,
  updateApplicationStatus,
  updateVolunteerSuggestion,
  bulkUpdateVolunteerSuggestions,
  deleteApplication,
  // Posts CRUD
  getAllPosts,
  createPost,
  updatePost,
  deletePost,
  // Events CRUD
  getAllEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  // Media Streaming Proxy
  streamMedia,
};
