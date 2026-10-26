const { supabaseAdmin } = require("../config/supabase");

/**
 * Middleware to verify Supabase Auth JWT token
 * Validates user exists in auth.users and sets req.user
 */
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization token required (Bearer <token>)",
      });
    }

    const token = authHeader.split(" ")[1];
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired session token",
        error: error ? error.message : null,
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Authentication middleware error:", err);
    return res.status(500).json({
      success: false,
      message: "Authentication server error",
    });
  }
}

module.exports = {
  authenticateToken,
};
