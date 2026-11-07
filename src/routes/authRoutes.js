const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { authenticateToken } = require("../middleware/authMiddleware");

// Authentication Endpoints
router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.post("/send-otp", authController.sendOtp);
router.post("/verify-otp", authController.verifyOtp);
router.get("/me", authenticateToken, authController.getMe);

// Account Settings & Security Endpoints
router.post("/change-password", authController.changePassword);
router.post("/change-email", authController.changeEmail);
router.post("/toggle-2fa", authController.toggle2FA);
router.get("/setup-2fa", authController.get2FASetup);

module.exports = router;
