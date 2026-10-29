const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");

// Admin Authentication
router.post("/login", adminController.adminLogin);

// Applications Management
router.get("/applications", adminController.getAllApplications);
router.get("/applications/:id", adminController.getApplicationById);
router.patch("/applications/:id/status", adminController.updateApplicationStatus);
router.patch("/applications/:id/volunteer-suggestion", adminController.updateVolunteerSuggestion);
router.post("/applications/bulk-volunteer-suggestions", adminController.bulkUpdateVolunteerSuggestions);
router.delete("/applications/:id", adminController.deleteApplication);

module.exports = router;
