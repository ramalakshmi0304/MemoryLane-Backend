import { supabaseAnon, supabaseService } from "../config/supabase.js";

// Register user (admin only)

export const registerUser = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // 1️⃣ Create auth user
    const { data, error } =
      await supabaseService.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (error) return res.status(400).json({ error: error.message });

    const user = data.user;

    // 2️⃣ Insert into profiles table
    const { error: profileError } = await supabaseService
      .from("profiles")
      .insert({
        id: user.id,
        user_id: user.id, // 👈 Add this line (Maps to your user_id column)
        name,
        email: user.email, // 👈 Add this line (Matches your email column)
        role: "user",
      });

    if (profileError)
      return res.status(400).json({ error: profileError.message });

    res.status(201).json({
      message: "User registered successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};



// Login user
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1️⃣ Use Anon client to sign in (Service client doesn't support this properly)
    const { data, error } = await supabaseAnon.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      return res.status(401).json({
        error: error?.message || "Login failed - no session",
      });
    }

    const user = data.user;
    const access_token = data.session.access_token;

    // 2️⃣ Use Service client to get profile (Bypasses Row Level Security)
    const { data: profile, error: profileError } = await supabaseService
      .from("profiles")
      .select("name, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.log("❌ Profile Error:", profileError.message);
      return res.status(400).json({ error: profileError.message });
    }

    console.log("✅ Login success for:", user.email);

    return res.status(200).json({
      message: "Login successful",
      access_token,
      user: {
        id: user.id,
        email: user.email,
        name: profile?.name || "User",
        role: profile?.role || "user",
      },
    });
  } catch (err) {
    console.error("🔥 FULL SYSTEM ERROR:", err); // Look for 'code' like ENOTFOUND or ETIMEDOUT
    res.status(500).json({ error: "Server connection to Supabase failed." });
  }
};