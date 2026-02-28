import express from "express";
import { protect, isAdmin } from "../middleware/auth.middleware.js";
import {
  createMemory,
  getMemories,
  getAllMemories,
  getMemoriesByTag,
  getRandomMemory,
  getMilestones,
  getTags,
  getAllTags,
  deleteMemory,
  updateMemory,
  bulkUploadMemories,
  getMemoryStats
} from "../controllers/memory.controller.js";
import { upload } from "../middleware/upload.middleware.js";

const router = express.Router();

// All memory routes require authentication
router.use(protect);

// 1. ADMIN ROUTES
router.get("/all", isAdmin, getAllMemories);
router.get("/tags/admin", isAdmin, getAllTags); // Unique path for admin tags

// 2. SPECIFIC DATA ROUTES
router.get("/stats", getMemoryStats);
router.get("/tags", getTags); // Personal tags
router.get("/milestones", getMilestones);
router.get("/random", getRandomMemory);

// 3. TAG SPECIFIC
router.get("/tag/:tagId", getMemoriesByTag);

// 4. GENERAL CRUD
router.get("/", getMemories);

// FIXED: Use .fields() to support both Image/Video and Voice Note simultaneously
router.post("/", 
  upload.fields([
    { name: "file", maxCount: 1 },  // For photo (line 92 of your code)
    { name: "audio", maxCount: 1 }  // For voice note (line 98 of your code)
  ]), 
  createMemory
);

router.post("/bulk", upload.array("files", 20), bulkUploadMemories);

router.put("/:id", 
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "audio", maxCount: 1 }
  ]), 
  updateMemory
);

router.delete("/:id", deleteMemory);

export default router;