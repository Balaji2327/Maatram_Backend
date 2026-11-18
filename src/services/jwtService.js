const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "maatram_default_super_secret_jwt_key_2026";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7h";

class JwtService {
  /**
   * Generate signed JWT access token
   * @param {Object} payload Claims (e.g., { id, email, role })
   * @param {string} [expiresIn] Expiration time, defaults to 7 hours ('7h')
   * @returns {string} Signed JWT token
   */
  static signToken(payload, expiresIn = JWT_EXPIRES_IN) {
    return jwt.sign(payload, JWT_SECRET, {
      expiresIn,
    });
  }

  /**
   * Verify and decode a JWT token
   * @param {string} token 
   * @returns {Object|null} Decoded payload or throws error
   */
  static verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
  }

  /**
   * Decode without verifying (useful for inspection)
   * @param {string} token 
   */
  static decodeToken(token) {
    return jwt.decode(token);
  }
}

module.exports = {
  JwtService,
  JWT_SECRET,
  JWT_EXPIRES_IN,
};
