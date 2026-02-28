// server/src/middleware/upload.middleware.js
import multer from "multer";

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Broaden the check to allow all common image, video, and audio types
  if (
    file.mimetype.startsWith("image/") || 
    file.mimetype.startsWith("video/") || 
    file.mimetype.startsWith("audio/")
  ) {
    cb(null, true);
  } else {
    // Creating a custom error that our controller can catch
    const error = new Error("File type not supported. Please upload an image, video, or audio file.");
    error.code = "LIMIT_FILE_TYPE";
    cb(error, false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { 
    fileSize: 50 * 1024 * 1024 // Increased to 50MB to be safer for video uploads
  }, 
});