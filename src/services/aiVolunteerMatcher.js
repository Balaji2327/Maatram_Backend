const { GoogleGenAI } = require("@google/genai");

/**
 * Service to intelligently cluster & match applicants to volunteers using Google Gemini AI,
 * with an ultra-reliable deterministic fallback for batch allocation (e.g. 10 per volunteer).
 */
class AiVolunteerMatcher {
  /**
   * Initialize Google Gen AI client with GEMINI_API_KEY
   */
  static getClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("[AI Matcher] GEMINI_API_KEY not configured. Falling back to deterministic matcher.");
      return null;
    }
    try {
      return new GoogleGenAI({ apiKey });
    } catch (e) {
      console.error("[AI Matcher] Failed to initialize GoogleGenAI client:", e.message);
      return null;
    }
  }

  /**
   * Deterministic dynamic fallback:
   * Takes the first N unassigned applicants from the pool
   */
  static deterministicBatchMatch(availableApplicants, batchSize = 10) {
    if (!availableApplicants || availableApplicants.length === 0) {
      return [];
    }
    const countToTake = Math.min(batchSize, availableApplicants.length);
    const selected = availableApplicants.slice(0, countToTake);
    return selected.map((app) => ({
      applicant_id: app.id,
      application_number: app.application_number || "",
      full_name: app.full_name || "Applicant",
      district: app.district || "",
      mobile_number: app.mobile_number || "",
      match_reason: "Sequential Batch Allocation (First-Come, First-Served)",
    }));
  }

  /**
   * Intelligent Hybrid Matching:
   * Uses Gemini AI to pick the best batch of up to `batchSize` applicants for this specific volunteer,
   * matching on geographic proximity (district), preferred branch/academics, and communication alignment.
   *
   * @param {Object} volunteer - Volunteer details { email, name, role, college, department, district, company }
   * @param {Array} availableApplicants - List of applicants currently unassigned for this event
   * @param {number} batchSize - Default 10 (or remaining count if < 10)
   * @returns {Promise<Array>} Array of selected applicant allocations
   */
  static async matchApplicantsForVolunteer(volunteer, availableApplicants = [], batchSize = 10) {
    if (!availableApplicants || availableApplicants.length === 0) {
      return [];
    }

    // Edge case: if remaining pool is smaller than or equal to batchSize, assign all remaining directly!
    if (availableApplicants.length <= batchSize) {
      return this.deterministicBatchMatch(availableApplicants, batchSize);
    }

    const ai = this.getClient();
    if (!ai) {
      return this.deterministicBatchMatch(availableApplicants, batchSize);
    }

    try {
      // Prepare compact candidate list for AI (to save tokens and ensure speed)
      const candidatePool = availableApplicants.map((app, idx) => ({
        index: idx,
        id: app.id,
        appNo: app.application_number || `APP-${idx + 1}`,
        name: app.full_name || `Applicant ${idx + 1}`,
        district: app.district || "Unknown",
        stream: app.preferred_branch || app.department || "General",
        phone: app.mobile_number || "",
      }));

      const prompt = `You are an AI volunteer-applicant coordinator for Maatram Foundation.
Your goal is to select exactly ${batchSize} candidate applicants from the pool below to assign to the following volunteer for telephonic background verification and academic evaluation.

VOLUNTEER PROFILE:
- Name: ${volunteer.name || "Volunteer"}
- Role: ${volunteer.role || "student"}
- Department/Branch: ${volunteer.department || volunteer.college || "Engineering"}
- District/Location: ${volunteer.current_city || volunteer.district || "Tamil Nadu"}
- Organization/College: ${volunteer.company || volunteer.college || "Maatram Foundation"}

MATCHING PREFERENCES (IN PRIORITY):
1. Geographic proximity: Prioritize applicants from the same or nearby district as the volunteer.
2. Academic stream: Match applicants interested in engineering/arts similar to the volunteer's background.
3. Diverse distribution: If multiple applicants match, pick sequentially to maintain balance.

AVAILABLE APPLICANTS POOL (Pick exactly ${batchSize}):
${JSON.stringify(candidatePool.slice(0, 100))}

RESPONSE FORMAT:
Respond with ONLY a valid raw JSON array containing the selected applicant IDs and a 1-sentence match reason.
Do not enclose in markdown codeblocks. Format:
[
  { "id": "uuid-here", "match_reason": "Same district (Madurai) and matching Engineering stream" }
]`;

      // Set 4-second timeout promise race so volunteer never hangs
      const aiCallPromise = ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("AI matching timeout")), 3500)
      );

      const response = await Promise.race([aiCallPromise, timeoutPromise]);
      const rawText = response.text ? response.text.trim() : "";

      // Clean markdown quotes if model added them
      const cleanJson = rawText
        .replace(/^```json/i, "")
        .replace(/^```/i, "")
        .replace(/```$/i, "")
        .trim();

      const parsed = JSON.parse(cleanJson);

      if (Array.isArray(parsed) && parsed.length > 0) {
        const idMap = new Map();
        availableApplicants.forEach((a) => idMap.set(a.id, a));

        const matchedList = [];
        for (const item of parsed) {
          const app = idMap.get(item.id);
          if (app && matchedList.length < batchSize) {
            matchedList.push({
              applicant_id: app.id,
              application_number: app.application_number || "",
              full_name: app.full_name || "Applicant",
              district: app.district || "",
              mobile_number: app.mobile_number || "",
              match_reason: item.match_reason || "AI matched by geographic & stream alignment",
            });
            idMap.delete(item.id); // Prevent duplicates
          }
        }

        // If AI returned fewer than batchSize, top up deterministically
        if (matchedList.length < batchSize) {
          for (const app of idMap.values()) {
            if (matchedList.length >= batchSize) break;
            matchedList.push({
              applicant_id: app.id,
              application_number: app.application_number || "",
              full_name: app.full_name || "Applicant",
              district: app.district || "",
              mobile_number: app.mobile_number || "",
              match_reason: "Top-up batch allocation",
            });
          }
        }

        console.log(`[AI Matcher] Successfully matched ${matchedList.length} applicants for volunteer ${volunteer.email} using Gemini.`);
        return matchedList;
      }

      // If parsing failed or returned empty array
      return this.deterministicBatchMatch(availableApplicants, batchSize);
    } catch (err) {
      console.warn(`[AI Matcher] Gemini matching fallback activated: ${err.message}. Using deterministic allocation.`);
      return this.deterministicBatchMatch(availableApplicants, batchSize);
    }
  }
}

module.exports = { AiVolunteerMatcher };
