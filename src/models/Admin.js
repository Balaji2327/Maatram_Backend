const { supabaseAdmin } = require("../config/supabase");
const crypto = require("crypto");

function hashPassword(password) {
  return crypto.createHash("sha256").update(password.trim()).digest("hex");
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const hashed = hashPassword(password);
  return hashed === storedHash || password.trim() === storedHash;
}

class AdminModel {
  static async findByEmail(email) {
    if (!email) return null;
    const cleanEmail = email.trim().toLowerCase();

    const { data, error } = await supabaseAdmin
      .from("administrators")
      .select("*")
      .ilike("email", cleanEmail)
      .maybeSingle();

    if (error) {
      console.error("Supabase findByEmail error:", error.message);
      return null;
    }
    return data;
  }

  static async findById(id) {
    if (!id) return null;

    const { data, error } = await supabaseAdmin
      .from("administrators")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Supabase findById error:", error.message);
      return null;
    }
    return data;
  }

  static async getAll() {
    const { data, error } = await supabaseAdmin
      .from("administrators")
      .select("id, name, email, role, two_factor_enabled, created_at, updated_at")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Supabase getAll administrators error:", error.message);
      return [];
    }
    return data || [];
  }

  static async create({ name, email, password, role = "admin", two_factor_secret }) {
    const cleanEmail = email.trim().toLowerCase();
    const password_hash = hashPassword(password);

    const { data, error } = await supabaseAdmin
      .from("administrators")
      .insert({
        name: name.trim(),
        email: cleanEmail,
        password_hash,
        role,
        two_factor_enabled: false,
        two_factor_secret: two_factor_secret || null,
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }
    return data;
  }

  static async update(id, updates) {
    const payload = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("administrators")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }
    return data;
  }

  static async delete(id) {
    const { error } = await supabaseAdmin
      .from("administrators")
      .delete()
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }
    return true;
  }
}

module.exports = {
  AdminModel,
  hashPassword,
  verifyPassword,
};
