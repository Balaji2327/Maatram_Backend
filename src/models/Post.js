const { supabaseAdmin } = require("../config/supabase");

class PostModel {
  static async getAll() {
    const { data, error } = await supabaseAdmin
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("PostModel.getAll error:", error.message);
      return [];
    }
    return data || [];
  }

  static async getById(id) {
    const { data, error } = await supabaseAdmin
      .from("posts")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("PostModel.getById error:", error.message);
      return null;
    }
    return data;
  }

  static async create(postData) {
    const { data, error } = await supabaseAdmin
      .from("posts")
      .insert({
        title: postData.title,
        content: postData.content,
        category: postData.category || "Announcement",
        schedule_date: postData.schedule_date || null,
        schedule_time: postData.schedule_time || null,
        location: postData.location || null,
        language: postData.language || "English",
        author_name: postData.author_name || "Foundation Admin",
        image_url: postData.image_url || null,
        images: postData.images || [],
        video_url: postData.video_url || null,
        video_file_name: postData.video_file_name || null,
      })
      .select()
      .single();

    if (error) {
      console.error("PostModel.create error:", error.message);
      throw error;
    }
    return data;
  }

  static async update(id, updates) {
    const { data, error } = await supabaseAdmin
      .from("posts")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("PostModel.update error:", error.message);
      throw error;
    }
    return data;
  }

  static async delete(id) {
    const { data, error } = await supabaseAdmin
      .from("posts")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("PostModel.delete error:", error.message);
      throw error;
    }
    return true;
  }
}

module.exports = { PostModel };
