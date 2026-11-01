const { supabaseAdmin } = require("../config/supabase");

class EventModel {
  static async getAll() {
    const { data, error } = await supabaseAdmin
      .from("events")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("EventModel.getAll error:", error.message);
      return [];
    }
    return data || [];
  }

  static async getById(id) {
    const { data, error } = await supabaseAdmin
      .from("events")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("EventModel.getById error:", error.message);
      return null;
    }
    return data;
  }

  static async create(eventData) {
    const { data, error } = await supabaseAdmin
      .from("events")
      .insert({
        title: eventData.title,
        description: eventData.description,
        event_date: eventData.event_date,
        event_time: eventData.event_time || null,
        location: eventData.location,
        category: eventData.category || "Workshop",
        target_audience: eventData.target_audience || null,
        image_url: eventData.image_url || null,
        status: eventData.status || "upcoming",
      })
      .select()
      .single();

    if (error) {
      console.error("EventModel.create error:", error.message);
      throw error;
    }
    return data;
  }

  static async update(id, updates) {
    const { data, error } = await supabaseAdmin
      .from("events")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("EventModel.update error:", error.message);
      throw error;
    }
    return data;
  }

  static async delete(id) {
    const { data, error } = await supabaseAdmin
      .from("events")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("EventModel.delete error:", error.message);
      throw error;
    }
    return true;
  }
}

module.exports = { EventModel };
