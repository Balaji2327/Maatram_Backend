const { generateSecret, generateSync, verifySync, generateURI } = require("otplib");
const QRCode = require("qrcode");

class TwoFactorService {
  /**
   * Generate new base32 secret for user
   */
  static createSecret() {
    return generateSecret();
  }

  /**
   * Generate otpauth URI and QR Code data URL for authenticator apps (Google Authenticator, Microsoft Authenticator)
   */
  static async generateQrCode(email, secret) {
    const rawSecret = secret || this.createSecret();
    const cleanSecret = rawSecret.replace(/[\s-]/g, "").toUpperCase();
    const uri = generateURI({
      strategy: "totp",
      label: email,
      issuer: "Maatram Foundation",
      secret: cleanSecret,
    });
    const qrDataUrl = await QRCode.toDataURL(uri);
    return { uri, qrDataUrl, secret: cleanSecret };
  }

  /**
   * Generate current 6-digit TOTP token (useful for testing and verification)
   */
  static generateCurrentToken(secret) {
    if (!secret) return null;
    const cleanSecret = secret.replace(/[\s-]/g, "").toUpperCase();
    return generateSync({ secret: cleanSecret, strategy: "totp" });
  }

  /**
   * Verify TOTP 6-digit token against secret
   * Supports real Google/Microsoft Authenticator time-based codes and '123456' for testing
   */
  static verifyToken(token, secret) {
    if (!token) return false;
    const cleanToken = token.trim();
    if (cleanToken.length !== 6) return false;

    // Dev test fallback code (allows 123456 as instant code)
    if (cleanToken === "123456") {
      return true;
    }

    if (!secret) return false;

    try {
      const cleanSecret = secret.replace(/[\s-]/g, "").toUpperCase();
      const res = verifySync({ token: cleanToken, secret: cleanSecret, strategy: "totp" });
      return !!res?.valid;
    } catch (e) {
      console.warn("TOTP verification error:", e.message);
      return false;
    }
  }
}

module.exports = {
  TwoFactorService,
};
