const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { authenticateAdminToken } = require("../middleware/adminAuthMiddleware");

// Admin Authentication (Public)
router.post("/login", adminController.adminLogin);

// Admin Account & Security Settings (Protected)
router.get("/profile", authenticateAdminToken, adminController.getAdminProfile);
router.post("/change-password", authenticateAdminToken, adminController.changePassword);
router.post("/change-email", authenticateAdminToken, adminController.changeEmail);
router.post("/toggle-2fa", authenticateAdminToken, adminController.toggle2FA);

// Administrator Management (Add Admin, List, Revoke)
router.get("/administrators", authenticateAdminToken, adminController.listAdministrators);
router.post("/administrators", authenticateAdminToken, adminController.createAdministrator);
router.delete("/administrators/:id", authenticateAdminToken, adminController.deleteAdministrator);

// Applications Management
router.get("/applications", adminController.getAllApplications);
router.get("/applications/:id", adminController.getApplicationById);
router.patch("/applications/:id/status", adminController.updateApplicationStatus);
router.patch("/applications/:id/volunteer-suggestion", adminController.updateVolunteerSuggestion);
router.post("/applications/bulk-volunteer-suggestions", adminController.bulkUpdateVolunteerSuggestions);
router.delete("/applications/:id", adminController.deleteApplication);

// Students & Alumni Directory (Supports Admin & Student/Alumni views)
router.get("/students", adminController.getAllStudents);
router.get("/students/:email/academics", adminController.getStudentAcademicRecords);
router.post("/students/:email/academics", adminController.saveStudentAcademicRecords);
router.get("/alumni", adminController.getAllAlumni);

// Posts Management
router.get("/posts", adminController.getAllPosts);
router.post("/posts", authenticateAdminToken, adminController.createPost);
router.put("/posts/:id", authenticateAdminToken, adminController.updatePost);
router.delete("/posts/:id", authenticateAdminToken, adminController.deletePost);

// Events Management
router.get("/events", adminController.getAllEvents);
router.post("/events", authenticateAdminToken, adminController.createEvent);
router.put("/events/:id", authenticateAdminToken, adminController.updateEvent);
router.delete("/events/:id", authenticateAdminToken, adminController.deleteEvent);
router.post("/events/:id/respond", adminController.respondToEvent);
router.post("/events/:id/approve-assignment", authenticateAdminToken, adminController.approveVolunteerAssignment);
router.get("/events/:id/assignments", adminController.getEventAssignments);

// Volunteer Registration & Status
router.post("/volunteers/register", adminController.registerVolunteer);
router.get("/volunteers/list", adminController.getRegisteredVolunteers);
router.get("/volunteers/status/:email", adminController.checkVolunteerStatus);

// Media Streaming Proxy (Streams S3 assets directly to browsers)
router.get("/media/{*key}", adminController.streamMedia);

module.exports = router;
