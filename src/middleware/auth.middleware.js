import { supabaseAnon, supabaseService } from "../config/supabase.js";

export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    console.log("AUTH HEADER:", authHeader);

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    console.log("TOKEN:", token);

    // Verify user using Supabase
    const { data, error } = await supabaseAnon.auth.getUser(token);

    if (error) {
      console.log("SUPABASE ERROR:", error.message);
      return res.status(401).json({ message: error.message });
    }

    if (!data?.user) {
      return res.status(401).json({ message: "Invalid token user not found" });
    }

    // Fetch profile
    const { data: profile, error: profileError } = await supabaseService
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    if (profileError) {
      console.log("PROFILE ERROR:", profileError.message);
      return res.status(403).json({ message: "Profile not found" });
    }

    req.user = {
      id: data.user.id,
      email: data.user.email,
      role: profile.role,
    };

    next();

  } catch (err) {
    console.error("Protect error:", err);
    res.status(500).json({ message: "Internal authentication error" });
  }
};
export const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access only" });
  }
  next();
};