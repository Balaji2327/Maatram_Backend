const express = require("express");
const router = express.Router();
const applicationController = require("../controllers/applicationController");
const { authenticateToken } = require("../middleware/authMiddleware");

// Application Form Endpoints
router.get("/me", authenticateToken, applicationController.getMyApplication);
router.post("/save-draft", authenticateToken, applicationController.saveDraft);
router.post("/submit", authenticateToken, applicationController.submitApplication);
router.get("/status", authenticateToken, applicationController.getStatus);

module.exports = router;
