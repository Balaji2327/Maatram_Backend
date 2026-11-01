const { supabaseAdmin } = require("../config/supabase");

class ApplicationModel {
  static async findByUserId(userId) {
    const { data, error } = await supabaseAdmin
      .from("applications")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
  }

  static async findById(id) {
    const { data, error } = await supabaseAdmin
      .from("applications")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
  }

  static async getAll({ status, district } = {}) {
    let query = supabaseAdmin
      .from("applications")
      .select("*")
      .order("created_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (district && district !== "all") {
      query = query.ilike("district", `%${district}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  }

  static async create(payload) {
    const { data, error } = await supabaseAdmin
      .from("applications")
      .insert(payload)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async update(id, updates) {
    const { data, error } = await supabaseAdmin
      .from("applications")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async upsertByUser(userId, payload) {
    const { data, error } = await supabaseAdmin
      .from("applications")
      .upsert(
        {
          user_id: userId,
          ...payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async delete(id) {
    const { error } = await supabaseAdmin.from("applications").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  }
}

module.exports = {
  ApplicationModel,
};
