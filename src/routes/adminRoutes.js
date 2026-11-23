const express = require("express");
const { JwtService } = require("../services/jwtService");
const { authenticateToken } = require("../middleware/authMiddleware");
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
router.get("/applications", (req, res, next) => {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  try {
    if (token && JwtService.verifyToken(token).type === "admin") return requireSignedAdmin(req, res, next);
  } catch { /* authenticateToken also supports Supabase sessions */ }
  return authenticateToken(req, res, next);
}, adminController.getAllApplications);
router.get("/applications/:id", requireSignedAdmin, adminController.getApplicationById);
function requireSignedAdmin(req, res, next) {
  try {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (token && JwtService.verifyToken(token).type === "admin") return authenticateAdminToken(req, res, next);
  } catch { /* Invalid or expired admin session */ }
  return res.status(403).json({ success: false, message: "Admin sign-in required to change admission status." });
}
router.patch("/applications/:id/status", requireSignedAdmin, adminController.updateApplicationStatus);
router.patch("/applications/:id/assign-volunteer", adminController.assignVolunteer);
router.patch("/applications/:id/volunteer-suggestion", adminController.updateVolunteerSuggestion);
router.post("/applications/bulk-volunteer-suggestions", adminController.bulkUpdateVolunteerSuggestions);
router.delete("/applications/:id", adminController.deleteApplication);

// Students & Alumni Directory (Supports Admin & Student/Alumni views)
const scholar = require("../controllers/scholarProfileController");
router.get("/students/:studentId/profile/marksheets/:field", requireSignedAdmin, scholar.loadScholar, scholar.downloadMarksheet);
router.get("/students/:studentId/profile", requireSignedAdmin, scholar.loadScholar, scholar.getProfile);
router.patch("/students/:studentId/profile", requireSignedAdmin, scholar.loadScholar, scholar.saveProfile);
router.get("/students", requireSignedAdmin, adminController.getAllStudents);
router.get("/students/:email/academics", requireSignedAdmin, adminController.getStudentAcademicRecords);
router.post("/students/:email/academics", requireSignedAdmin, adminController.saveStudentAcademicRecords);
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
router.get(/^\/media\/(.+)$/, adminController.streamMedia);

module.exports = router;
