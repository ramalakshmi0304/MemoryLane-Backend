import {supabaseService} from "../config/supabase.js";

/**
 * Helper function to verify admin
 */
const verifyAdmin = async (req) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    const error = new Error("No token provided");
    error.status = 401;
    throw error;
  }

  const token = authHeader.split(" ")[1];

  // Verify token with Supabase Auth using the Service Key
  const { data: userData, error: userError } =
    await supabaseService.auth.getUser(token);

  if (userError || !userData.user) {
    const error = new Error("Invalid or expired token");
    error.status = 401;
    throw error;
  }

  // Attach token & user to request for use in the controller
  req.token = token;
  req.user = userData.user;

  // Check role in profiles table
  const { data: profile, error: profileError } =
    await supabaseService
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

  if (profileError || !profile || profile.role !== "admin") {
    const error = new Error("Access denied: Admin only");
    error.status = 403;
    throw error;
  }

  return true;
};


/**
 * Get all users (Admin only)
 */
export const getAllUsers = async (req, res) => {
  try {
    // We only need ID and Name for the dropdown
    const { data, error } = await supabaseService
      .from("profiles")
      .select("id, name, email") 
      .order("name", { ascending: true });

    if (error) throw error;

    // Return the array directly or wrapped in 'data'
    res.status(200).json({ data }); 
  } catch (err) {
    console.error("Fetch Users Error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

/**
 * Get all memories (Admin only)
 */
export const getAllMemories = async (req, res) => {
  try {
    const { data, error } = await supabaseService
      .from("memories")
      .select(`
        *,
        profiles (name)
      `)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    
    // We wrap in 'data' for consistency
    res.status(200).json({ data });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch recent activity" });
  }
};

/**
 * Delete any memory (Admin only)
 */
export const deleteMemory = async (req, res) => {
  try {
    await verifyAdmin(req);
    const { id } = req.params;

    const { error } = await supabaseService
      .from("memories")
      .delete()
      .eq("id", id);

    if (error) return res.status(400).json({ error: error.message });

    res.status(200).json({ message: "Memory deleted successfully by Admin" });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

/**
 * Get Dashboard Stats (Admin only)
 */
export const getAdminStats = async (req, res) => {
  try {
    await verifyAdmin(req);
    const { userId } = req.query;

    // 1. Setup Queries
    let memoryQ = supabaseService.from("memories").select("*", { count: "exact", head: true });
    let milestoneQ = supabaseService.from("memories").select("*", { count: "exact", head: true }).eq("is_milestone", true);
    let userQ = supabaseService.from("profiles").select("*", { count: "exact", head: true });

    // 2. Apply Filters if specific user is selected
    if (userId && userId !== "all") {
      memoryQ = memoryQ.eq("user_id", userId);
      milestoneQ = milestoneQ.eq("user_id", userId);
      // We don't filter total users by a single ID, that remains global
    }

    const [memRes, mileRes, userRes] = await Promise.all([
      memoryQ,
      milestoneQ,
      userQ
    ]);

    // 3. Return KEYS that match AdminDashboard.jsx
    res.status(200).json({
      totalUsers: userRes.count || 0,
      totalMemories: memRes.count || 0,
      totalMilestones: mileRes.count || 0,
      storageUsed: "0.4 GB", // Static or calculated
      message: "Stats fetched successfully"
    });

  } catch (err) {
    console.error("ADMIN STATS ERROR:", err);
    res.status(err.status || 500).json({ error: err.message });
  }
};