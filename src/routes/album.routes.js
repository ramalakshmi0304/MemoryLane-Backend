import express from "express";
import { protect, isAdmin } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/upload.middleware.js";
import { 
  getUserAlbums, 
  getAllAlbums, 
  createAlbum, 
  getAlbumById,
  addMemoriesToAlbum, 
  removeMemoryFromAlbum,
  deleteAlbum,
  downloadAlbumZip // 1. Add this import
} from "../controllers/album.controller.js"; 

const router = express.Router();

// 2. Add the download route
// This allows: GET /api/albums/:id/download
router.get("/:id/download", protect, downloadAlbumZip);

router.get("/all", protect, isAdmin, getAllAlbums);
router.get("/", protect, getUserAlbums);
router.post("/", protect, createAlbum);
router.get("/:id", protect, getAlbumById);
router.post("/:id/memories", protect, upload.array("files", 10), addMemoriesToAlbum);
router.delete('/:id', protect, deleteAlbum);



// Unlink a memory from an album (Junction table delete)
router.delete('/:id/memories/:memoryId', protect, removeMemoryFromAlbum);

export default router;