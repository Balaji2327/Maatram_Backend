const express = require("express");
const { getMemberRole } = require("../services/membershipService");
const { supabaseAdmin } = require("../config/supabase");
const router = express.Router();
const authController = require("../controllers/authController");
const { authenticateToken } = require("../middleware/authMiddleware");

const scholar = require("../controllers/scholarProfileController");
const academics = require("../controllers/adminDirectoryController");
router.get("/scholar-academics", authenticateToken, scholar.loadScholar, academics.getStudentAcademicRecords);
router.post("/scholar-academics", authenticateToken, scholar.loadScholar, academics.saveStudentAcademicRecords);
router.post("/scholar-marksheet", authenticateToken, scholar.loadScholar, scholar.uploadMarksheet);
router.get("/scholar-profile/marksheets/:field", authenticateToken, scholar.loadScholar, scholar.downloadMarksheet);
router.get("/scholar-profile", authenticateToken, scholar.loadScholar, scholar.getProfile);
router.patch("/scholar-profile", authenticateToken, scholar.loadScholar, scholar.saveProfile);

// Authentication Endpoints
router.post("/signup", authController.signup);
router.post("/member-login", authController.memberLogin);
router.get("/member-session", authenticateToken, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(req.user.id);
    if (error || !data?.user) return res.status(401).json({ success: false });
    const role = await getMemberRole(data.user);
    if (!role) return res.status(403).json({ success: false });
    return res.json({ success: true, memberRole: role });
  } catch (error) { next(error); }
});
router.post("/login", authController.login);
router.post("/send-otp", authController.sendOtp);
router.post("/verify-otp", authController.verifyOtp);
router.get("/me", authenticateToken, authController.getMe);

// Account Settings & Security Endpoints
router.post("/change-password", authController.changePassword);
router.post("/change-email", authController.changeEmail);
router.post("/toggle-2fa", authController.toggle2FA);
router.get("/setup-2fa", authController.get2FASetup);
router.post("/forgot-password/send-otp", authController.forgotPasswordSendOtp);
router.post("/forgot-password/reset", authController.forgotPasswordReset);

module.exports = router;
