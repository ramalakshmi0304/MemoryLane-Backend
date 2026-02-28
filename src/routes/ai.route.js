import express from "express";
import { generateVideo } from "../controllers/ai.controller.js";

const router = express.Router();

// CHANGE THIS: from /generate-memory to /generate-video
router.post("/generate-video", generateVideo);

export default router;