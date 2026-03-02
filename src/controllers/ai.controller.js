import { geminiFlash } from "../config/gemini.js";
import { supabaseService } from "../config/supabase.js";

// 1. GENERATE SUGGESTIONS (BATCH MODE)
export const generateVideo = async (req, res) => {
  console.log("🚀 AI Magic requested at:", new Date().toLocaleTimeString());
  try {
    const { album_id, prompt } = req.body;
    
    // Fetch memories linked to the album via junction table
    const { data: junctionData, error: fetchError } = await supabaseService
      .from("album_memories")
      .select(`memories:memory_id (id, title, description)`)
      .eq("album_id", album_id);

    const memories = junctionData?.map(item => item.memories).filter(Boolean) || [];

    if (memories.length === 0) return res.status(404).json({ error: "No memories found." });

    // Prepare context for the AI
    const memoriesContext = memories.map((m, i) => 
      `Memory ${i+1}: [ID: ${m.id}] current title: "${m.title}", current desc: "${m.description}"`
    ).join("\n");

    const batchPrompt = `
      You are a cinematic storyteller. Enhance the following ${memories.length} memories for an album called "${prompt || 'Memories'}".
      For each memory, provide a 3-word cinematic title and a 1-sentence poetic description.
      
      Input Data:
      ${memoriesContext}

      Response Format (STRICT JSON ARRAY ONLY):
      [
        {"id": "original_id", "new_title": "...", "new_description": "..."}
      ]
    `;

    // Single AI call to save quota
    const result = await geminiFlash.generateContent(batchPrompt);
    const responseText = result.response.text();
    
    // Clean and parse the response
    const cleanedJson = responseText.replace(/```json|```/g, "").trim();
    
    let suggestions;
    try {
      suggestions = JSON.parse(cleanedJson);
    } catch (parseError) {
      console.error("JSON Parse Error:", responseText);
      return res.status(500).json({ error: "AI formatting error. Please try again." });
    }

    return res.status(200).json({ success: true, suggestions });

  } catch (error) {
    console.error("AI Batch Error:", error.message);
    const errorMsg = error.message.includes("429") 
      ? "AI quota exceeded. Please wait 60 seconds." 
      : "Something went wrong with the AI.";
    res.status(500).json({ success: false, error: errorMsg });
  }
};

// 2. CONFIRM AND SAVE TO DATABASE
export const confirmMagic = async (req, res) => {
  const { updates } = req.body;

  // Validation
  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    console.error("❌ No updates received in request body!");
    return res.status(400).json({ 
      success: false, 
      error: "No updates were provided to save." 
    });
  }

  try {
    // Perform all updates in the 'memories' table
    const results = await Promise.all(
      updates.map(async (item) => {
        const { data, error } = await supabaseService
          .from("memories")
          .update({
            title: item.new_title,
            description: item.new_description,
          })
          .eq("id", item.id)
          .select(); // confirm row exists/updated

        if (error) console.error(`Error updating memory ${item.id}:`, error.message);
        return { id: item.id, updated: data?.length > 0 };
      })
    );

    console.log("✅ Save Results:", results);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Confirm Magic Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};