import express from "express";
import { generateVideo, confirmMagic} from "../controllers/ai.controller.js";

const router = express.Router();

// CHANGE THIS: from /generate-memory to /generate-video

router.post("/generate-video", generateVideo); // This provides the preview
router.post("/confirm-magic", confirmMagic);   // This saves the changes

export default router;