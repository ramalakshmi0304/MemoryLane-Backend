import dotenv from "dotenv";
dotenv.config();
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

// --- CORS Configuration ---
const allowedOrigins = [
  "http://localhost:5173", 
  "https://memory-lane-frontend-three.vercel.app"
];

app.use(cors({
  origin: (origin, callback) => {
    // 1. Allow requests with no origin (like Postman or mobile apps)
    if (!origin) return callback(null, true);
    
    // 2. Check if origin is in our list or is a Vercel preview branch
    const isAllowed = allowedOrigins.includes(origin) || origin.endsWith(".vercel.app");
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

// --- Middleware ---
app.use(express.json());

// Static folder for uploads with cross-origin headers
app.use("/uploads", express.static("uploads", {
  setHeaders: (res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
  }
}));

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

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload Error: ${err.message}` });
  }
  if (err.message && err.message.includes("File type not supported")) {
    return res.status(400).json({ error: err.message });
  }
  console.error("Internal Server Error:", err);
  res.status(500).json({ error: "An unexpected server error occurred." });
});

// Listen on 0.0.0.0 for Render deployment
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});