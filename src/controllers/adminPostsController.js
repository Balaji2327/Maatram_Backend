const { PostModel } = require("../models/Post");
const { StorageService } = require("../services/storageService");

/**
 * @controller  getAllPosts
 * @route       GET /admin/posts
 * @desc        Retrieve all published posts
 */
async function getAllPosts(req, res) {
  try {
    const posts = await PostModel.getAll();

    // Map S3 keys to public URLs for client rendering while keeping s3_key in the response
    const formatted = posts.map((p) => {
      const primaryUrl = p.image_url ? StorageService.getMediaUrl(p.image_url) : null;
      const imagesUrls = Array.isArray(p.images)
        ? p.images.map((k) => StorageService.getMediaUrl(k))
        : [];
      const videoUrl = p.video_url ? StorageService.getMediaUrl(p.video_url) : null;

      return {
        ...p,
        s3_image_key: p.image_url,
        s3_images_keys: p.images,
        s3_video_key: p.video_url,
        image_url: primaryUrl,
        images: imagesUrls,
        video_url: videoUrl,
      };
    });

    return res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (err) {
    console.error("getAllPosts error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve posts",
      error: err.message,
    });
  }
}

/**
 * @controller  createPost
 * @route       POST /admin/posts
 * @desc        Create new post with uploaded image(s) and video (Stores S3 KEY alone)
 */
async function createPost(req, res) {
  try {
    const {
      title,
      content,
      category,
      scheduleDate,
      scheduleTime,
      location,
      language,
      authorName,
      imageUrl,
      images,
      videoUrl,
      videoFileName,
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: "Title and content/description are required.",
      });
    }

    let s3ImagesKeys = [];
    let s3ImageKey = null;

    if (Array.isArray(images) && images.length > 0) {
      s3ImagesKeys = await StorageService.uploadMultipleMedia(images, "posts");
      s3ImageKey = s3ImagesKeys[0] || null;
    } else if (imageUrl && typeof imageUrl === "string") {
      s3ImageKey = await StorageService.uploadMedia(imageUrl, "posts", "cover_image");
      s3ImagesKeys = s3ImageKey ? [s3ImageKey] : [];
    }

    let s3VideoKey = videoUrl;
    if (videoUrl && videoUrl.startsWith("data:")) {
      s3VideoKey = await StorageService.uploadMedia(videoUrl, "posts/videos", videoFileName || "video.mp4");
    }

    const postRecord = await PostModel.create({
      title: title.trim(),
      content: content.trim(),
      category: category || "Announcement",
      schedule_date: scheduleDate || null,
      schedule_time: scheduleTime || null,
      location: location || null,
      language: language || "English",
      author_name: authorName || (req.admin?.name || "Foundation Admin"),
      image_url: s3ImageKey || null,
      images: s3ImagesKeys,
      video_url: s3VideoKey || null,
      video_file_name: videoFileName || null,
    });

    return res.status(201).json({
      success: true,
      message: "Post created and S3 keys stored in database successfully.",
      data: postRecord,
    });
  } catch (err) {
    console.error("createPost error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error creating post",
      error: err.message,
    });
  }
}

/**
 * @controller  updatePost
 * @route       PUT /admin/posts/:id
 * @desc        Update existing post (Stores S3 KEY alone)
 */
async function updatePost(req, res) {
  try {
    const { id } = req.params;
    const {
      title,
      content,
      category,
      scheduleDate,
      scheduleTime,
      location,
      language,
      authorName,
      imageUrl,
      images,
      videoUrl,
      videoFileName,
    } = req.body;

    let s3ImagesKeys = images;
    if (Array.isArray(images) && images.length > 0) {
      s3ImagesKeys = await Promise.all(
        images.map(async (img, idx) => {
          if (img && img.startsWith("data:")) {
            return StorageService.uploadMedia(img, "posts", `image_${idx + 1}`);
          }
          return img;
        })
      );
    }

    let s3ImageKey = imageUrl;
    if (Array.isArray(s3ImagesKeys) && s3ImagesKeys.length > 0) {
      s3ImageKey = s3ImagesKeys[0];
    } else if (imageUrl && imageUrl.startsWith("data:")) {
      s3ImageKey = await StorageService.uploadMedia(imageUrl, "posts", "cover_image");
    }

    let s3VideoKey = videoUrl;
    if (videoUrl && videoUrl.startsWith("data:")) {
      s3VideoKey = await StorageService.uploadMedia(videoUrl, "posts/videos", videoFileName || "video.mp4");
    }

    const updates = {
      title: title?.trim(),
      content: content?.trim(),
      category: category || "Announcement",
      schedule_date: scheduleDate || null,
      schedule_time: scheduleTime || null,
      location: location || null,
      language: language || "English",
      author_name: authorName || "Foundation Admin",
      image_url: s3ImageKey || null,
      images: s3ImagesKeys || [],
      video_url: s3VideoKey || null,
      video_file_name: videoFileName || null,
    };

    const updated = await PostModel.update(id, updates);

    return res.status(200).json({
      success: true,
      message: "Post updated with S3 keys successfully",
      data: updated,
    });
  } catch (err) {
    console.error("updatePost error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error updating post",
      error: err.message,
    });
  }
}

/**
 * @controller  deletePost
 * @route       DELETE /admin/posts/:id
 * @desc        Delete post by id and delete associated media files from AWS S3
 */
async function deletePost(req, res) {
  try {
    const { id } = req.params;

    const post = await PostModel.getById(id);
    if (post) {
      const keysToDelete = [];
      if (post.image_url) keysToDelete.push(post.image_url);
      if (Array.isArray(post.images)) {
        post.images.forEach((k) => {
          if (k && !keysToDelete.includes(k)) keysToDelete.push(k);
        });
      }
      if (post.video_url && !keysToDelete.includes(post.video_url)) {
        keysToDelete.push(post.video_url);
      }

      if (keysToDelete.length > 0) {
        console.log(`[AWS S3] Deleting ${keysToDelete.length} files for post ${id}:`, keysToDelete);
        await StorageService.deleteMultipleMedia(keysToDelete);
      }
    }

    await PostModel.delete(id);

    return res.status(200).json({
      success: true,
      message: "Post and its associated AWS S3 media deleted successfully",
    });
  } catch (err) {
    console.error("deletePost error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error deleting post",
      error: err.message,
    });
  }
}

/**
 * @controller  streamMedia
 * @route       GET /admin/media/:key(*)
 * @desc        Securely stream private or public S3 media to client browsers
 */
async function streamMedia(req, res) {
  try {
    let s3Key = req.params.key || req.params[0];
    if (Array.isArray(s3Key)) {
      s3Key = s3Key.join("/");
    }
    if (!s3Key) {
      return res.status(400).send("Missing S3 Key");
    }

    const { GetObjectCommand } = require("@aws-sdk/client-s3");
    const { s3Client, AWS_S3_BUCKET } = require("../services/storageService");

    const command = new GetObjectCommand({
      Bucket: AWS_S3_BUCKET,
      Key: s3Key,
    });

    const s3Object = await s3Client.send(command);

    if (s3Object.ContentType) {
      res.setHeader("Content-Type", s3Object.ContentType);
    }
    if (s3Object.ContentLength) {
      res.setHeader("Content-Length", s3Object.ContentLength);
    }
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=43200");

    s3Object.Body.pipe(res);
  } catch (err) {
    console.error("streamMedia error:", err.message);
    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
      return res.status(404).send("Media not found");
    }
    return res.status(500).send("Failed to stream media from AWS S3");
  }
}

module.exports = {
  getAllPosts,
  createPost,
  updatePost,
  deletePost,
  streamMedia,
};
