const { supabaseAdmin } = require("../config/supabase");
const { JwtService } = require("../services/jwtService");

/**
 * Middleware to verify JWT token
 * Supports both custom signed JWTs (7 hours expiry) and Supabase Auth tokens
 * Validates user exists and sets req.user
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
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authorization token required",
      });
    }

    // 1. First attempt to verify with our internal JwtService
    try {
      const decoded = JwtService.verifyToken(token);
      if (decoded && decoded.id) {
        req.user = {
          id: decoded.id,
          email: decoded.email,
          role: decoded.role || "applicant",
          user_metadata: decoded.user_metadata || {},
          phone: decoded.phone,
        };
        return next();
      }
    } catch (jwtErr) {
      if (jwtErr.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          code: "TOKEN_EXPIRED",
          message: "Session expired (7 hours limit). Please sign in again.",
        });
      }
      // If JsonWebTokenError (e.g. invalid signature), fallback to verify via Supabase Auth
    }

    // 2. Fallback to Supabase Auth token verification
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
