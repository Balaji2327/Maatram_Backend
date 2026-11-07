const { supabaseAdmin } = require("../config/supabase");

class VolunteerModel {
  static async getAll() {
    try {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 100 });
      if (error) throw error;
      const volunteers = [];
      for (const u of data.users || []) {
        if (u.user_metadata?.is_volunteer && u.user_metadata?.volunteer_data) {
          volunteers.push(u.user_metadata.volunteer_data);
        }
      }
      return volunteers;
    } catch (err) {
      console.error("VolunteerModel.getAll error:", err.message);
      return [];
    }
  }

  static async getByEmail(email) {
    if (!email) return null;
    const cleanEmail = email.trim().toLowerCase();
    try {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 100 });
      if (error) throw error;
      const user = (data.users || []).find((u) => u.email?.toLowerCase() === cleanEmail);
      if (user && user.user_metadata?.is_volunteer) {
        return user.user_metadata.volunteer_data || null;
      }
      return null;
    } catch (err) {
      console.error("VolunteerModel.getByEmail error:", err.message);
      return null;
    }
  }

  static async register(volunteerData) {
    const cleanEmail = (volunteerData.email || "").trim().toLowerCase();
    if (!cleanEmail) {
      throw new Error("Email is required for volunteer registration");
    }

    const newRecord = {
      id: volunteerData.id || `vol-${Date.now()}`,
      user_id: volunteerData.user_id || volunteerData.userId || null,
      name: volunteerData.name?.trim() || "Volunteer",
      email: cleanEmail,
      phone: volunteerData.phone || "",
      role: volunteerData.role === "alumni" ? "alumni" : "student",
      college: volunteerData.college || "",
      department: volunteerData.department || "",
      year_of_study: volunteerData.year_of_study || volunteerData.yearOfStudy || "1",
      company: volunteerData.company || null,
      designation: volunteerData.designation || null,
      batch: volunteerData.batch || null,
      skills: volunteerData.skills || "General Volunteering",
      registered_at: new Date().toISOString(),
    };

    // 1. Save directly to Supabase Auth user_metadata
    try {
      const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 100 });
      if (!listErr) {
        const user = (users || []).find((u) => u.email?.toLowerCase() === cleanEmail);
        if (user) {
          newRecord.user_id = user.id;
          await supabaseAdmin.auth.admin.updateUserById(user.id, {
            user_metadata: {
              ...user.user_metadata,
              is_volunteer: true,
              volunteer_data: newRecord,
            },
          });
        }
      }
    } catch (authErr) {
      console.warn("VolunteerModel.register warning updating Supabase Auth metadata:", authErr.message);
    }

    // 2. Dual-save to Supabase posts table as durable storage
    try {
      // Check if entry already exists
      const { data: existingPosts } = await supabaseAdmin
        .from("posts")
        .select("id, location")
        .eq("category", "__SYSTEM_VOLUNTEER__");

      const existing = (existingPosts || []).find((p) => (p.location || "").toLowerCase() === cleanEmail);
      if (existing) {
        await supabaseAdmin
          .from("posts")
          .update({
            title: newRecord.name,
            content: JSON.stringify(newRecord),
            schedule_date: newRecord.registered_at,
          })
          .eq("id", existing.id);
      } else {
        await supabaseAdmin.from("posts").insert([
          {
            title: newRecord.name,
            content: JSON.stringify(newRecord),
            category: "__SYSTEM_VOLUNTEER__",
            location: cleanEmail,
            schedule_date: newRecord.registered_at,
            author_name: newRecord.role === "alumni" ? "Alumni Volunteer" : "Student Volunteer",
          },
        ]);
      }
    } catch (dbErr) {
      console.warn("VolunteerModel.register warning saving to database:", dbErr.message);
    }

    return newRecord;
  }

  static async getAll() {
    const volunteersMap = new Map();

    // 1. Fetch from Supabase posts table
    try {
      const { data: records, error } = await supabaseAdmin
        .from("posts")
        .select("content, location")
        .eq("category", "__SYSTEM_VOLUNTEER__");

      if (!error && records) {
        for (const r of records) {
          try {
            const parsed = JSON.parse(r.content);
            if (parsed && parsed.email) {
              volunteersMap.set(parsed.email.toLowerCase(), parsed);
            }
          } catch {
            // ignore JSON parse error
          }
        }
      }
    } catch (err) {
      console.warn("VolunteerModel.getAll db warning:", err.message);
    }

    // 2. Supplement from Supabase Auth user_metadata
    try {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 100 });
      if (!error && data?.users) {
        for (const u of data.users) {
          if (u.user_metadata?.is_volunteer && u.user_metadata?.volunteer_data) {
            const vData = u.user_metadata.volunteer_data;
            const emailKey = (vData.email || u.email || "").toLowerCase();
            if (emailKey && !volunteersMap.has(emailKey)) {
              volunteersMap.set(emailKey, vData);
            }
          }
        }
      }
    } catch (err) {
      console.warn("VolunteerModel.getAll auth warning:", err.message);
    }

    return Array.from(volunteersMap.values());
  }

  static async getByEmail(email) {
    if (!email) return null;
    const cleanEmail = email.trim().toLowerCase();

    // 1. Check posts table
    try {
      const { data: records } = await supabaseAdmin
        .from("posts")
        .select("content")
        .eq("category", "__SYSTEM_VOLUNTEER__")
        .eq("location", cleanEmail);

      if (records && records.length > 0) {
        return JSON.parse(records[0].content);
      }
    } catch {
      // fallback to auth
    }

    // 2. Check auth
    try {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 100 });
      if (!error && data?.users) {
        const user = data.users.find((u) => u.email?.toLowerCase() === cleanEmail);
        if (user && user.user_metadata?.is_volunteer) {
          return user.user_metadata.volunteer_data || null;
        }
      }
    } catch {
      // ignore
    }

    return null;
  }
}

module.exports = { VolunteerModel };
