const { supabaseAdmin } = require("../config/supabase");

/**
 * Generate sequential application number in format: MF-2025-001
 */
async function generateNextApplicationNumber() {
  const YEAR = "2025";
  const PREFIX = `MF-${YEAR}-`;

  try {
    // Query existing application numbers starting with MF-2025-
    const { data: apps, error } = await supabaseAdmin
      .from("applications")
      .select("application_number")
      .ilike("application_number", `${PREFIX}%`);

    let maxSequence = 0;
    if (apps && apps.length > 0) {
      for (const a of apps) {
        if (a.application_number) {
          const parts = a.application_number.split("-");
          if (parts.length >= 3) {
            const seq = parseInt(parts[2], 10);
            if (!isNaN(seq) && seq > maxSequence) {
              maxSequence = seq;
            }
          }
        }
      }
    }

    // Fallback: if no MF-2025- found, count existing records to maintain sequence
    if (maxSequence === 0) {
      const { count } = await supabaseAdmin
        .from("applications")
        .select("id", { count: "exact", head: true });
      maxSequence = count || 0;
    }

    const nextSequence = maxSequence + 1;
    return `${PREFIX}${String(nextSequence).padStart(3, "0")}`;
  } catch (err) {
    console.error("Error generating application number:", err);
    const rand = Math.floor(1 + Math.random() * 999);
    return `${PREFIX}${String(rand).padStart(3, "0")}`;
  }
}

module.exports = {
  generateNextApplicationNumber,
};
