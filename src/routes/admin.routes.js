import express from "express";
import {
  getAllUsers,
  getAllMemories,
  deleteMemory,
  getAdminStats
} from "../controllers/admin.controller.js";

import { protect, isAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);
router.use(isAdmin);

router.get("/stats", getAdminStats);
router.get("/users", getAllUsers);
router.get("/memories", getAllMemories); // AdminDashboard calls this for activity
router.delete("/memories/:id", deleteMemory);


export default router;