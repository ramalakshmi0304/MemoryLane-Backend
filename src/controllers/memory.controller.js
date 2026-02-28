import { v4 as uuidv4 } from 'uuid';
import { supabaseService } from "../config/supabase.js";

const getFullUrl = (path) => {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = supabaseService.storage.from("memories").getPublicUrl(path);
  return data?.publicUrl || null;
};

export const flattenMemoryData = (m) => {
  if (!m) return null;

  // Find media by type
  const visualMedia = m.media?.find(med => med.file_type === 'image' || med.file_type === 'video');
  const audioMedia = m.media?.find(med => med.file_type === 'audio');

  // Logic: If the file_url is just a path (e.g., "user/mem/file.jpg"), 
  // we need to convert it to a Public URL.
  const getUrl = (path) => {
    if (!path) return null;
    if (path.startsWith("http")) return path; // Already a full URL
    
    // Construct the Supabase Public URL manually if getPublicUrl isn't working
    const bucket = "memories";
    const supabaseUrl = process.env.SUPABASE_URL; // e.g., https://xyz.supabase.co
    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
  };

  return {
    ...m,
    display_url: getUrl(visualMedia?.file_url),
    media_type: visualMedia?.file_type || "image",
    voice_url: getUrl(audioMedia?.file_url),
    tags: (m.memory_tags || [])
      .map(mt => mt.tags ? { id: mt.tags.id, name: mt.tags.name } : null)
      .filter(Boolean)
  };
};


export const createMemory = async (req, res) => {
  try {
    const { title, description, memory_date, location, tags, is_milestone, album_id } = req.body;
    const userId = req.user.id;

    // Correctly access files from upload.fields()
    const imageFile = req.files?.['file'] ? req.files['file'][0] : null;
    const audioFile = req.files?.['audio'] ? req.files['audio'][0] : null;

    // 1. Insert the base Memory record
    const { data: memory, error: memError } = await supabaseService
      .from("memories")
      .insert({
        user_id: userId,
        title: title || "Untitled Memory",
        description: description || "",
        // Ensure date format is YYYY-MM-DD
        memory_date: memory_date ? memory_date.split('T')[0] : new Date().toISOString().split('T')[0],
        location: location || "",
        is_milestone: String(is_milestone) === "true",
        album_id: album_id || null
      })
      .select()
      .single();

    if (memError) throw memError;

    // 2. Optimized Upload Helper
    const uploadToStorage = async (file, type) => {
      const fileExt = file.originalname.split(".").pop();
      const fileName = `${userId}/${memory.id}/${type}-${uuidv4()}.${fileExt}`;

      const { error } = await supabaseService.storage
        .from("memories")
        .upload(fileName, file.buffer, { 
          contentType: file.mimetype,
          upsert: true 
        });

      if (error) throw error;
      return fileName; // Return path for media table
    };

    const mediaToInsert = [];

    // 3. Process Image/Video
    if (imageFile) {
      const path = await uploadToStorage(imageFile, "display");
      mediaToInsert.push({
        memory_id: memory.id,
        file_url: path,
        file_type: imageFile.mimetype.startsWith("video") ? "video" : "image"
      });
    }

    // 4. Process Audio
    if (audioFile) {
      const path = await uploadToStorage(audioFile, "audio");
      mediaToInsert.push({
        memory_id: memory.id,
        file_url: path,
        file_type: "audio"
      });
    }

    if (mediaToInsert.length > 0) {
      const { error: mediaError } = await supabaseService.from("media").insert(mediaToInsert);
      if (mediaError) throw mediaError;
    }

    // 5. Robust Tag Handling
    if (tags) {
      let tagList = [];
      try {
        // Handle stringified JSON or raw comma-separated strings
        tagList = typeof tags === 'string' && tags.startsWith('[') 
          ? JSON.parse(tags) 
          : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags);

        for (const tagIdentifier of tagList) {
          if (!tagIdentifier) continue;
          
          let tagId;
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tagIdentifier);

          if (isUuid) {
            tagId = tagIdentifier;
          } else {
            // Find or create tag by name
            const { data: existingTag } = await supabaseService
              .from("tags")
              .select("id")
              .ilike("name", tagIdentifier)
              .maybeSingle();

            if (existingTag) {
              tagId = existingTag.id;
            } else {
              const { data: newTag, error: tagCreateErr } = await supabaseService
                .from("tags")
                .insert({ name: tagIdentifier })
                .select("id")
                .single();
              if (!tagCreateErr) tagId = newTag.id;
            }
          }

          if (tagId) {
            await supabaseService.from("memory_tags").upsert(
              { memory_id: memory.id, tag_id: tagId }, 
              { onConflict: 'memory_id, tag_id' }
            );
          }
        }
      } catch (err) {
        console.error("⚠️ Tag processing failed but memory saved:", err.message);
      }
    }

    // 6. Final Re-fetch with Joins
    const { data: fullMemory, error: fetchError } = await supabaseService
      .from("memories")
      .select(`*, media (file_url, file_type), memory_tags (tags (id, name))`)
      .eq("id", memory.id)
      .single();

    if (fetchError) throw fetchError;

    res.status(201).json({
      message: "Memory created successfully!",
      memory: flattenMemoryData(fullMemory)
    });

  } catch (err) {
    console.error("🔥 Create Error:", err);
    res.status(500).json({ error: err.message });
  }
};
export const bulkUploadMemories = async (req, res) => {
  try {
    const files = req.files;
    const userId = req.user.id;
    const { title, album_id, location } = req.body; // Added album_id here

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files received" });
    }

    const uploadedMemories = [];

    for (const file of files) {
      try {
        const { data: memory, error: memErr } = await supabaseService
          .from("memories")
          .insert({ 
            user_id: userId, 
            title: title || file.originalname,
            location: location || "",
            memory_date: new Date().toISOString().split('T')[0],
            album_id: album_id || null // CRITICAL: This links the bulk files to the album
          })
          .select()
          .single();

        if (memErr) throw memErr;
        // ... storage and media logic
        uploadedMemories.push(memory);
      } catch (loopErr) {
        console.error(`❌ Failed:`, loopErr.message);
      }
    }
    // ... response
    // Return the successfully created memories so the frontend can link them to an album
    res.status(200).json({ 
      message: "Bulk upload processed", 
      memories: uploadedMemories 
    });

  } catch (err) {
    console.error("🔥 Global Bulk Upload Crash:", err.message);
    res.status(500).json({ error: "An unexpected server error occurred." });
  }
};

export const getMilestones = async (req, res) => {
  try {
    const { data, error } = await supabaseService
      .from("memories")
      .select(`
        *,
        media (file_url, file_type),
        memory_tags (tags (id, name))
      `)
      .eq("is_milestone", true)
      .order("memory_date", { ascending: false });

    if (error) throw error;
    const sanitizedData = data.map(flattenMemoryData);
    res.status(200).json({ data: sanitizedData, message: "Milestones fetched" });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch milestones" });
  }
};

export const getAllMemories = async (req, res) => {
  try {
    const { search, tag, page = 1, limit = 20 } = req.query;
    const from = (page - 1) * limit;
    const to = from + Number(limit) - 1;

    let query = supabaseService
      .from("memories")
      .select(`
        *,
        profiles (id, name, role),
        media (id, file_url, file_type),
        memory_tags (tags (id, name))
      `, { count: "exact" });

    // Filter by tag name if provided
    if (tag && tag !== "all") {
      query = query.eq("memory_tags.tags.name", tag);
    }

    if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const sanitizedData = data.map(flattenMemoryData);

    res.status(200).json({
      data: sanitizedData,
      pagination: {
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
        currentPage: Number(page)
      }
    });
  } catch (err) {
    console.error("GET_ALL_ERROR:", err);
    res.status(500).json({ error: "Failed to fetch all memories" });
  }
};

export const getMemories = async (req, res) => {
  try {
    const { search, tag, page = 1 } = req.query;
    const userId = req.user.id;
    const limit = 12;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseService
      .from("memories")
      .select(`
        *,
        media (file_url, file_type),
        memory_tags (tags (id, name))
      `, { count: "exact" })
      .eq("user_id", userId);

    if (tag && tag !== "all") query = query.eq("memory_tags.tags.name", tag);
    if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);

    const { data, error, count } = await query.range(from, to).order("created_at", { ascending: false });
    if (error) throw error;

    const sanitizedData = data.map(flattenMemoryData);
    res.status(200).json({ data: sanitizedData, memories: sanitizedData, pagination: { total: count || 0, currentPage: Number(page) } });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user memories" });
  }
};
/**
 * GET RANDOM MEMORY
 */
export const getRandomMemory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { data: ids } = await supabaseService.from("memories").select("id").eq("user_id", userId);
    if (!ids || ids.length === 0) return res.status(404).json({ message: "No memories found!" });

    const randomId = ids[Math.floor(Math.random() * ids.length)].id;
    const { data: memory, error } = await supabaseService
      .from("memories")
      .select(`*, media (file_url, file_type), memory_tags (tags (id, name))`)
      .eq("id", randomId)
      .single();

    if (error) throw error;
    res.status(200).json(flattenMemoryData(memory));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * UPDATE MEMORY
 */

export const updateMemory = async (req, res) => {
  try {
    const { id } = req.params; // This is the memory_id
    const userId = req.user.id;
    const { title, description, location, memory_date, is_milestone } = req.body;

    // 1. Update the Memory text details first
    const { error: memoryUpdateError } = await supabaseService
      .from("memories")
      .update({
        title,
        description,
        location,
        memory_date,
        is_milestone: String(is_milestone) === "true",
      })
      .eq("id", id)
      .eq("user_id", userId);

    if (memoryUpdateError) throw memoryUpdateError;

    // 2. Handle Image Upload if a file exists
    const file = req.files?.file ? req.files.file[0] : null;

    if (file) {
      const fileExt = file.originalname.split(".").pop();
      // Using memory_id in the path to keep it organized
      const fileName = `${userId}/${id}/display-${Date.now()}.${fileExt}`;

      // Upload to Storage
      const { error: uploadError } = await supabaseService.storage
        .from("memories")
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabaseService.storage
        .from("memories")
        .getPublicUrl(fileName);

      const newImageUrl = urlData.publicUrl;

      // 3. Update the MEDIA table
      // We target the record where memory_id matches and file_type is 'image'
      const { error: mediaUpdateError } = await supabaseService
        .from("media")
        .update({ file_url: newImageUrl })
        .eq("memory_id", id)
        .eq("file_type", "image");

      if (mediaUpdateError) throw mediaUpdateError;
    }

    res.status(200).json({ message: "Memory and Media updated successfully" });
  } catch (error) {
    console.error("Update Error:", error);
    res.status(500).json({ error: error.message });
  }
};
/**
 * DELETE MEMORY
 */
export const deleteMemory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 1. Fetch media records from the database before deleting the memory
    const { data: mediaFiles, error: fetchError } = await supabaseService
      .from("media")
      .select("file_url")
      .eq("memory_id", id);

    if (fetchError) throw fetchError;

    // 2. Cleanup Storage Files
    if (mediaFiles && mediaFiles.length > 0) {
      const pathsToDelete = mediaFiles
        .map(file => {
          let path = file.file_url;
          if (!path) return null;

          // LOGIC: If it's a full URL, we extract just the path after the bucket name
          // If it's already a relative path (e.g., 'user_id/memory_id/file.jpg'), use it as is
          if (path.includes('/public/memories/')) {
            path = path.split('/public/memories/')[1];
          } else if (path.startsWith('http')) {
            // Fallback for different URL structures
            const parts = path.split('/');
            path = parts.slice(parts.indexOf('memories') + 1).join('/');
          }

          return path;
        })
        .filter(Boolean);

      if (pathsToDelete.length > 0) {
        console.log("🗑️ Storage cleanup for paths:", pathsToDelete);

        const { error: storageError } = await supabaseService
          .storage
          .from("memories")
          .remove(pathsToDelete);

        if (storageError) {
          console.error("⚠️ Storage Cleanup Warning:", storageError.message);
          // We continue so the DB record can still be deleted
        }
      }
    }

    // 3. Delete the Database Record
    const { error: dbError } = await supabaseService
      .from("memories")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (dbError) throw dbError;

    res.status(200).json({ message: "Memory and associated files deleted successfully." });
  } catch (err) {
    console.error("🔥 Delete Error:", err);
    res.status(500).json({ error: err.message });
  }
};
/**
 * GET TAGS
 */
export const getTags = async (req, res) => {
  try {
    const { data, error } = await supabaseService
      .from('tags')
      .select('id, name')
      .order('name', { ascending: true });

    if (error) throw error;
    return res.status(200).json({ data });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch tags' });
  }
};

export const getAllTags = async (req, res) => {
  try {
    const { data, error } = await supabaseService
      .from("tags")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) throw error;

    // This specific structure { data: [...] } satisfies your Dashboard logic
    res.status(200).json({ data });
  } catch (err) {
    console.error("GET_ALL_TAGS_ERROR:", err);
    res.status(500).json({ error: "Database failed to fetch tag list" });
  }
};
/**
 * GET MEMORIES BY TAG
 */
// backend/controllers/memories.controller.js

export const getMemoriesByTag = async (req, res) => {
  try {
    const { tagId } = req.params;
    const userId = req.user.id;

    const { data, error } = await supabaseService
      .from("memory_tags")
      .select(`memory_id, memories!inner (*, media (file_url, file_type), memory_tags (tags (id, name)))`)
      .eq("tag_id", tagId)
      .eq("memories.user_id", userId);

    if (error) throw error;
    const memories = data?.map(item => flattenMemoryData(item.memories)) || [];
    res.status(200).json({ data: memories, message: "Success" });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch memories by tag" });
  }
};
/**
 * GET MEMORY STATS
 */
export const getMemoryStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const { search, tag, userId: targetUserId } = req.query;

    const isAdmin = req.user.role === 'admin';
    // Define if we are looking at the global/everyone scope
    const isGlobalView = isAdmin && (!targetUserId || targetUserId === "all");
    const effectiveUserId = targetUserId && targetUserId !== "all" ? targetUserId : userId;

    // Helper to generate a fresh base query for Memories
    const getBaseMemoryQuery = () => {
      let q = supabaseService.from("memories").select("*", { count: "exact", head: true });

      // If NOT global view, filter memories by the specific user
      if (!isGlobalView) {
        q = q.eq("user_id", effectiveUserId);
      }

      if (search) q = q.ilike("title", `%${search}%`);
      return q;
    };

    // Helper to generate a fresh base query for Albums
    const getBaseAlbumQuery = () => {
      let q = supabaseService.from("albums").select("*", { count: "exact", head: true });

      // If NOT global view, filter albums by the specific user
      if (!isGlobalView) {
        q = q.eq("user_id", effectiveUserId);
      }

      return q;
    };

    const [totalRes, milestoneRes, albumRes] = await Promise.all([
      getBaseMemoryQuery(),
      getBaseMemoryQuery().eq("is_milestone", true),
      getBaseAlbumQuery() // This will now return all albums if isGlobalView is true
    ]);

    res.status(200).json({
      total: totalRes.count || 0,
      milestones: milestoneRes.count || 0,
      albums: albumRes.count || 0
    });
  } catch (err) {
    console.error("Stats Error:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
};

