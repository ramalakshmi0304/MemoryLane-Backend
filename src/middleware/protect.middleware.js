import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ message: "No token" });

    const token = authHeader.split(" ")[1];

    // Supabase client with JWT
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

 const { data, error } = await supabaseAnon.auth.getUser(token);

if (error || !data.user) {
  return res.status(401).json({ message: "Unauthorized" });
}

// Extract role with multiple fallbacks
const userRole = data.user.app_metadata?.role || 
                 data.user.user_metadata?.role || 
                 "user";

req.user = {
  id: data.user.id,
  email: data.user.email,
  role: userRole 
};

console.log("MiddleWare assigned role:", req.user.role);
next();