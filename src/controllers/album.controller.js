// controllers/album.controller.js
import { supabaseAnon, supabaseService } from "../config/supabase.js";
import archiver from 'archiver';
import { Buffer } from 'node:buffer';
/**
 * Get albums for the logged-in user
 */
export const getUserAlbums = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { data, error } = await supabaseAnon
      .from("albums")
      .select(`
        *,
        album_memories(
          memory:memories(
            media(file_url)
          )
        )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const formatted = data.map(album => ({
      ...album,
      total_memories: album.album_memories?.length || 0,
      cover_url: album.album_memories?.[0]?.memory?.media?.[0]?.file_url || null
    }));

    return res.status(200).json(formatted);

  } catch (err) {
    console.error("GET USER ALBUMS ERROR:", err);
    return res.status(500).json({ message: "Failed to fetch albums" });
  }
};
/**
 * Get all albums across the platform (Admin only)
 */
export const getAllAlbums = async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ message: "Forbidden" });

    const { data, error } = await supabaseService
      .from("albums")
      .select(`
        *,
        profiles:user_id (name),
        album_memories(memory_id)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const formatted = data.map(album => ({
      id: album.id,
      name: album.name,
      description: album.description,
      creator: album.profiles?.name || "Unknown",
      total_memories: album.album_memories?.length || 0,
      created_at: album.created_at,
    }));

    return res.status(200).json(formatted);
  } catch (err) {
    console.error("ADMIN ALBUM FETCH ERROR:", err);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * Create a new album
 */
export const createAlbum = async (req, res) => {
  try {
    const { name, description } = req.body;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { data, error } = await supabaseService
      .from("albums")
      .insert([{ name, description, user_id: userId }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);

  } catch (err) {
    console.error("CREATE ALBUM ERROR:", err);
    return res.status(500).json({ message: "Failed to create album" });
  }
};


/**
 * Get a specific album and its memories
 */
// Inside album.controller.js

export const getAlbumById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const { data: album, error } = await supabaseService // Using service role to bypass RLS issues
      .from('albums')
      .select(`
        *,
        album_memories(
          memory:memories(
            *,
            media(file_url, file_type)
          )
        )
      `)
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !album) {
      return res.status(404).json({ message: "Album not found" });
    }

    // SAFE FLATTENING:
    // This transforms the nested album_memories -> memory -> media structure 
    // into a clean list of memories that the frontend expects.
    const flattenedMemories = (album.album_memories || [])
      .map(item => {
        if (!item.memory) return null;
        
        return {
          ...item.memory,
          // Extract the first file_url from the media array found in your JSON
          display_url: item.memory.media?.[0]?.file_url || null,
          media: item.memory.media || []
        };
      })
      .filter(Boolean); // Remove nulls

    // Return the album with the clean memories array
    return res.status(200).json({ 
      ...album, 
      memories: flattenedMemories 
    });

  } catch (err) {
    console.error("🔥 GET ALBUM BY ID CRASH:", err.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Link memories to an album
 */
// album.controller.js
export const addMemoriesToAlbum = async (req, res) => {
  try {
    const { id: albumId } = req.params;
    const files = req.files; 
    const { memoryIds, memory_ids } = req.body; 
    
    // 1. Handle selection from Library (JSON)
    const idsToLink = memoryIds || memory_ids; 
    
    if (idsToLink && Array.isArray(idsToLink)) {
      const rows = idsToLink.map(mId => ({ 
        album_id: albumId, 
        memory_id: mId 
      }));

      // FIX: Use .upsert with onConflict to ignore duplicates
      const { error } = await supabaseService
        .from("album_memories")
        .upsert(rows, { onConflict: 'album_id,memory_id' });

      if (error) throw error;
      return res.status(200).json({ message: "Memories linked successfully" });
    }

    // 2. Handle new File Uploads (Multipart)
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files or memory IDs provided." });
    }

    // ... (Your existing 'for' loop for uploading files remains here)
    
  } catch (err) {
    // If it's a duplicate error that upsert somehow missed, handle it gracefully
    if (err.code === '23505') {
       return res.status(200).json({ message: "Memories already existed in album" });
    }
    console.error("🔥 Add Memories Error:", err.message);
    res.status(500).json({ error: err.message });
  }
};
/**
 * Remove a memory from an album
 */
export const removeMemoryFromAlbum = async (req, res) => {
  try {
    const { id, memoryId } = req.params;
    const userId = req.user.id;

    const client = req.user.role === "admin" ? supabaseService : supabaseAnon;

    const { error } = await client
      .from("album_memories")
      .delete()
      .eq("album_id", id)
      .eq("memory_id", memoryId);

    if (error) throw error;
    res.status(200).json({ message: "Memory removed from album" });
  } catch (err) {
    console.error("REMOVE MEMORY ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Delete an album
 */
export const deleteAlbum = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === "admin";

    const client = isAdmin ? supabaseService : supabaseAnon;

    // STEP 1: Manually delete links in the junction table first 
    // (This prevents foreign key constraint errors)
    await client
      .from("album_memories")
      .delete()
      .eq("album_id", id);

    // STEP 2: Delete the album
    let query = client.from("albums").delete().eq("id", id);

    // Only restrict by user_id if NOT an admin
    if (!isAdmin) {
      query = query.eq("user_id", userId);
    }

    const { error, count } = await query;

    if (error) throw error;
    
    res.status(200).json({ message: "Album and its links deleted successfully" });
  } catch (err) {
    console.error("DELETE ALBUM ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
};


export const downloadAlbumZip = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const isAdmin = req.user?.role === "admin";

    const { data: album, error } = await supabaseService
      .from('albums')
      .select(`
        name,
        user_id,
        memories:album_memories(
          memory:memories(
            id,
            title,
            media(file_url)
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error || !album) return res.status(404).json({ message: "Album not found" });
    if (!isAdmin && album.user_id !== userId) return res.status(403).json({ message: "Unauthorized" });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=${album.name.replace(/\s+/g, '_')}.zip`);

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.pipe(res);

    const memoryList = album.memories?.map(m => m.memory).filter(Boolean) || [];

    for (const memory of memoryList) {
      const fileUrl = memory.media?.[0]?.file_url;
      if (!fileUrl) continue;

      const pathParts = fileUrl.split('/public/memories/');
      if (pathParts.length < 2) continue;
      const filePath = pathParts[1];

      const { data: fileData, error: downloadError } = await supabaseService.storage
        .from('memories')
        .download(filePath);

      if (downloadError) {
        console.error(`Download failed for ${filePath}:`, downloadError.message);
        continue;
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());
      const filename = `${(memory.title || 'photo').replace(/\s+/g, '_')}_${memory.id.slice(0, 5)}.jpg`;
      archive.append(buffer, { name: filename });
    }

    await archive.finalize();

  } catch (err) {
    console.error("DOWNLOAD ZIP ERROR:", err);
    if (!res.headersSent) res.status(500).json({ message: "Failed to create ZIP archive" });
  }
};