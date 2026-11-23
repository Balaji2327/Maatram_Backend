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

  static isUUID(str) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(str || ""));
  }

  static async findById(id) {
    if (!id) return null;
    const isIdUuid = ApplicationModel.isUUID(id);
    let query = supabaseAdmin.from("applications").select("*");
    if (isIdUuid) {
      query = query.eq("id", id);
    } else {
      query = query.eq("application_number", id);
    }
    const { data, error } = await query.maybeSingle();

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
    if (!id) throw new Error("Missing application ID or application_number for update");
    const payload = { ...updates };
    const isIdUuid = ApplicationModel.isUUID(id);
    const filterCol = isIdUuid ? "id" : "application_number";

    // Safety guard: Extended virtual fields stored in additional_remarks
    const virtualFields = [
      "volunteer_name",
      "volunteerName",
      "volunteer_suggestion",
      "volunteerSuggestion",
      "tele_volunteer_name",
      "tele_volunteer_email",
      "tele_volunteer_phone",
      "tele_volunteer_role",
      "tele_volunteer_affiliation",
      "tele_volunteer_suggestion",
      "physical_volunteer_name",
      "physical_volunteer_email",
      "physical_volunteer_phone",
      "physical_volunteer_role",
      "physical_volunteer_affiliation",
      "physical_volunteer_suggestion",
      "physical_verification_notes",
      "physical_verification_status",
      "physical_student_description",
      "student_description",
      "physical_verification_photos",
      "photos",
      "front_view_home",
      "inside_home",
      "furniture",
      "with_student",
      "backward",
      "physical_event_id",
      "physical_event_title",
      "tele_event_id",
      "tele_event_title",
      "video_volunteer_name",
      "video_volunteer_suggestion",
      "direct_volunteer_name",
      "direct_volunteer_suggestion",
      "rejectionReason",
      "rejectionStage",
      "studentPhoto",
      "documentCommunityCertificate",
      "documentIncomeCertificate",
      "documentParentIdProof",
    ];

    const hasVirtualField = virtualFields.some((f) => payload[f] !== undefined);

    if (hasVirtualField || payload.additional_remarks !== undefined) {
      let additionalRemarks = {};
      if (payload.additional_remarks) {
        try {
          additionalRemarks =
            typeof payload.additional_remarks === "string"
              ? JSON.parse(payload.additional_remarks)
              : payload.additional_remarks;
        } catch {
          additionalRemarks = { customRemarks: payload.additional_remarks };
        }
      } else {
        try {
          const { data: current } = await supabaseAdmin
            .from("applications")
            .select("additional_remarks")
            .eq(filterCol, id)
            .maybeSingle();
          if (current?.additional_remarks) {
            additionalRemarks =
              typeof current.additional_remarks === "string"
                ? JSON.parse(current.additional_remarks)
                : current.additional_remarks;
          }
        } catch {}
      }

      for (const field of virtualFields) {
        if (payload[field] !== undefined) {
          additionalRemarks[field] = payload[field];
          delete payload[field];
        }
      }

      payload.additional_remarks = JSON.stringify(additionalRemarks);
    }

    const { data, error } = await supabaseAdmin
      .from("applications")
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq(filterCol, id)
      .select()
      .maybeSingle();

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
