const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const crypto = require("crypto");
require("dotenv").config();

const AWS_REGION = process.env.AWS_REGION || "ap-south-1";
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET || "maatram-post-media";

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

class StorageService {
  /**
   * Uploads base64 or buffer to AWS S3 and returns the S3 KEY alone (e.g. "posts/1793517..._img.jpg")
   * @param {string} dataUri - base64 data URI or raw string
   * @param {string} folder - folder prefix ('posts', 'events')
   * @param {string} originalName - optional original filename
   * @returns {Promise<string>} S3 object Key alone
   */
  static async uploadMedia(dataUri, folder = "posts", originalName = "") {
    if (!dataUri || typeof dataUri !== "string") {
      return dataUri;
    }

    // If already an S3 key or non-base64 identifier, return it directly
    if (!dataUri.startsWith("data:") && !dataUri.startsWith("http://") && !dataUri.startsWith("https://")) {
      return dataUri;
    }

    // If it's already an S3 URL, extract the key if possible
    if (dataUri.includes(".amazonaws.com/")) {
      return dataUri.split(".amazonaws.com/")[1];
    }

    try {
      let mimeType = "image/jpeg";
      let base64Data = dataUri;

      const matches = dataUri.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        mimeType = matches[1];
        base64Data = matches[2];
      }

      const buffer = Buffer.from(base64Data, "base64");
      let ext = "jpg";
      if (mimeType === "application/pdf") {
        ext = "pdf";
      } else if (mimeType.includes("/")) {
        ext = mimeType.split("/")[1].replace(/\+.*$/, "");
      }
      if (ext === "jpeg") ext = "jpg";

      const uniqueId = crypto.randomUUID();
      let cleanFileName = originalName
        ? originalName.replace(/[^a-zA-Z0-9.-]/g, "_")
        : `asset_${Date.now()}.${ext}`;

      // Guarantee proper extension if cleanFileName lacks one
      if (!cleanFileName.includes(".")) {
        cleanFileName = `${cleanFileName}.${ext}`;
      }

      // Generated S3 Key
      const s3Key = `${folder}/${uniqueId}_${cleanFileName}`;

      const command = new PutObjectCommand({
        Bucket: AWS_S3_BUCKET,
        Key: s3Key,
        Body: buffer,
        ContentType: mimeType,
      });

      await s3Client.send(command);
      console.log(`[AWS S3] Uploaded successfully: ${s3Key}`);

      // Return the key alone as requested
      return s3Key;
    } catch (err) {
      console.error("[AWS S3] uploadMedia error:", err.message);
      throw err;
    }
  }

  /**
   * Batch upload multiple images to S3 and return array of S3 KEYS alone
   */
  static async uploadMultipleMedia(dataUriArray = [], folder = "posts") {
    if (!Array.isArray(dataUriArray)) return [];
    const keys = [];
    for (let i = 0; i < dataUriArray.length; i++) {
      const item = dataUriArray[i];
      const key = await this.uploadMedia(item, folder, `image_${i + 1}`);
      keys.push(key);
    }
    return keys;
  }

  /**
   * Delete an object from AWS S3 using its key or full S3 URL
   * @param {string} keyOrUrl 
   */
  static async deleteMedia(keyOrUrl) {
    if (!keyOrUrl || typeof keyOrUrl !== "string") return false;
    
    let s3Key = keyOrUrl;
    if (keyOrUrl.includes(".amazonaws.com/")) {
      s3Key = keyOrUrl.split(".amazonaws.com/")[1];
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: AWS_S3_BUCKET,
        Key: s3Key,
      });
      await s3Client.send(command);
      console.log(`[AWS S3] Deleted object: ${s3Key}`);
      return true;
    } catch (err) {
      console.error(`[AWS S3] deleteMedia error for ${s3Key}:`, err.message);
      return false;
    }
  }

  /**
   * Delete multiple objects from AWS S3
   * @param {string[]} keysOrUrls 
   */
  static async deleteMultipleMedia(keysOrUrls = []) {
    if (!Array.isArray(keysOrUrls) || keysOrUrls.length === 0) return true;
    for (const item of keysOrUrls) {
      if (item) {
        await this.deleteMedia(item);
      }
    }
    return true;
  }

  /**
   * Helper to resolve an S3 Key or URL into an accessible URL for frontend clients
   */
  static getMediaUrl(s3Key) {
    if (!s3Key) return "";
    if (s3Key.startsWith("http://") || s3Key.startsWith("https://")) {
      return s3Key;
    }
    const backendPort = process.env.PORT || 5000;
    const backendHost = process.env.BACKEND_PUBLIC_URL || `http://localhost:${backendPort}`;
    // Stream S3 file through backend media proxy to guarantee 100% reliable rendering without AWS S3 403 AccessDenied
    const cleanKey = s3Key.startsWith("/") ? s3Key.slice(1) : s3Key;
    return `${backendHost}/admin/media/${cleanKey}`;
  }
}

module.exports = {
  StorageService,
  s3Client,
  AWS_S3_BUCKET,
  AWS_REGION,
};
