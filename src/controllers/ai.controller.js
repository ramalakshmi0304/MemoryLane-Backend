import { geminiFlash, geminiPro } from "../config/gemini.js";
import { supabaseService } from "../config/supabase.js";

/**
 * Retry helper for Gemini
 */
const generateWithRetry = async (prompt, retries = 2) => {
  try {
    return await geminiFlash.generateContent(prompt);
  } catch (error) {
    // Fallback if quota exceeded
    if (error.status === 429 && retries > 0) {
      console.log("⚠️ Flash quota exceeded, trying Pro model...");
      return await geminiPro.generateContent(prompt);
    }
    throw error;
  }
};

/**
 * Parse Gemini response safely
 */
const parseAIResponse = (text, fallbackPrompt) => {
  const title = text.match(/TITLE:\s*(.*)/i)?.[1]?.trim() || "AI Memory";
  const description = text.match(/DESCRIPTION:\s*(.*)/i)?.[1]?.trim() || fallbackPrompt || "A cinematic memory.";
  return { title, description };
};

/**
 * Generate AI Memory
 */
export const generateVideo = async (req, res) => {
  try {
    // 1. Add 'id' (the memory ID) to the destructuring
    const { prompt, imageUrl, user_id, id } = req.body; 

    if (!user_id || !id) {
      return res.status(400).json({
        success: false,
        error: "user_id and memory id are required"
      });
    }

    const aiPrompt = `
      Create cinematic memory details.
      Return EXACT format:
      TITLE: 3-5 word cinematic title
      DESCRIPTION: One emotional sentence
      Context: ${prompt || "Beautiful life memory"}
    `;

    const result = await generateWithRetry(aiPrompt);
    const text = result.response.text();
    const { title, description } = parseAIResponse(text, prompt);

    // 2. Use the specific ID to update. This is much safer and faster.
    const { data: memory, error: updateError } = await supabaseService
      .from("memories")
      .update({ title, description })
      .eq("id", id) // Use the primary key
      .eq("user_id", user_id) // Extra safety check
      .select()
      .single();

    if (updateError) throw updateError;

    return res.status(200).json({
      success: true,
      memory
    });

  } catch (error) {
    console.error("❌ AI Controller Error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};