require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./src/routes/authRoutes");
const applicationRoutes = require("./src/routes/applicationRoutes");
const adminRoutes = require("./src/routes/adminRoutes");

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL =
  process.env.NEXT_PUBLIC_FRONTEND_URL ||
  "http://localhost:3000";

// Middleware
app.use(
  cors({
    origin: [FRONTEND_URL, "http://localhost:3000"],
    credentials: true,
  })
);
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// Health Check (Without /api)
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "online",
    service: "Maatram Foundation Server",
    time: new Date().toISOString(),
  });
});

// Primary Routes (Directly without /api)
app.use("/auth", authRoutes);
app.use("/application", applicationRoutes);
app.use("/admin", adminRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error occurred",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Maatram Backend Server is running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📡 Endpoints: http://localhost:${PORT}/auth and http://localhost:${PORT}/application`);
  console.log(`🌐 CORS allowed for: ${FRONTEND_URL}`);
  console.log(`====================================================`);
});
