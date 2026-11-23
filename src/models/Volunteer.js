const { supabaseAdmin } = require("../config/supabase");

class VolunteerModel {
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
    const volunteers = new Map();
    const pageSize = 100;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabaseAdmin.from("posts")
        .select("id, content, location").eq("category", "__SYSTEM_VOLUNTEER__")
        .order("id").range(offset, offset + pageSize - 1);
      if (error) throw error;
      for (const row of data) {
        const email = row.location?.trim().toLowerCase();
        if (!email) continue;
        try {
          volunteers.set(email, { ...JSON.parse(row.content), email });
        } catch {
          volunteers.set(email, { email });
        }
      }
      if (data.length < pageSize) break;
    }

    for (let page = 1; ; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: pageSize });
      if (error) throw error;
      for (const user of data.users) {
        const email = user.email?.trim().toLowerCase();
        if (email && user.user_metadata?.is_volunteer === true &&
            user.user_metadata.volunteer_data && !volunteers.has(email)) {
          volunteers.set(email, { ...user.user_metadata.volunteer_data, email });
        }
      }
      if (data.users.length < pageSize) break;
    }
    return Array.from(volunteers.values());
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
