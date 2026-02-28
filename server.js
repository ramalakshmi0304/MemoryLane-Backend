import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import multer from "multer";
import authRoutes from "./src/routes/auth.routes.js";
import memoryRoutes from "./src/routes/memory.routes.js";
import adminRoutes from "./src/routes/admin.routes.js";
import albumRoutes from "./src/routes/album.routes.js";
import aiRoutes from "./src/routes/ai.route.js";

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  "http://localhost:5173", // Local Dev
  process.env.FRONTEND_URL  // This will be your Vercel URL later
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || origin.includes("vercel.app")) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

app.use("/uploads", express.static("uploads", {
  setHeaders: (res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
  }
}));

app.use(express.json());

// --- Routes ---
app.use("/api/auth", authRoutes);
app.use("/api/memories", memoryRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/albums", albumRoutes);
app.use('/api/ai', aiRoutes);

// Test route
app.get("/", (req, res) => {
  res.json({ message: "MemoryLane API Running 🚀" });
});

// --- NEW: Global Error Handler ---
// This MUST be placed after all routes but before app.listen
app.use((err, req, res, next) => {
  // 1. Handle Multer-specific errors (e.g., File too large)
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ 
      error: `Upload Error: ${err.message}` 
    });
  }

  // 2. Handle our custom "File type not supported" error from the middleware
  if (err.message && err.message.includes("File type not supported")) {
    return res.status(400).json({ 
      error: err.message 
    });
  }

  // 3. Fallback for any other unexpected server errors
  console.error("Internal Server Error:", err);
  res.status(500).json({ 
    error: "An unexpected server error occurred." 
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});