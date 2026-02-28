import { createClient } from "@supabase/supabase-js";

export const attachSupabase = (req, res, next) => {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY // Use Anon key for RLS-protected requests
  );
  
  // If you have a logged-in user, set the JWT so RLS works
  const token = req.headers.authorization?.split(" ")[1];
  if (token) {
    supabase.auth.setSession({ access_token: token, refresh_token: "" });
  }

  req.supabase = supabase;
  next();
};