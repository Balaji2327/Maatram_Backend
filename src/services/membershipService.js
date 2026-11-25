const { ApplicationModel, admissionStatus } = require("../models/Application");

// Existing Supabase Auth accounts approved for student portal testing.
const studentPortalAccounts = new Set([
  "07efb9e1-0f48-45f2-a4da-c5c75187533a",
  "997d51b2-2f40-4ad1-a7f7-cd3232a2db90",
  "71a0147d-2b52-4df6-9bfa-ae9f41e89bcf",
  "4732ce1a-c880-42c0-8973-5a05cb776964",
  "b67de192-16f8-4f12-9dde-514bed973164",
  "e49d091d-92a1-4b16-9fd9-06a4175b5075",
  "9f2875d6-384f-4860-9f0c-71994470fadb",
  "205e9c9f-44bd-45fe-a01e-e8497069bf5a",
  "682891ee-5a5f-4179-b5da-92425d032c9e",
  "84030ad9-31fb-4bc4-b28e-4ae893e5913d",
]);

function memberRole(app, assignedRole) {
  if (app?.status === "rejected") return null;
  const number = app?.application_number || "";
  if (number.startsWith("MF-ALUM-")) return "alumni";
  if (admissionStatus(app?.status) === "selected" || app?.current_stage === "admitted" || number.startsWith("MF-SCH-")) {
    return assignedRole === "alumni" ? "alumni" : "student";
  }
  if (!app && ["student", "alumni"].includes(assignedRole)) return assignedRole;
  return null;
}

function portalRole(user, application) {
  if (studentPortalAccounts.has(user.id)) return "student";
  return memberRole(application, user.app_metadata?.role) === "alumni" ? "alumni" : null;
}

async function getMemberRole(user) {
  return portalRole(user, await ApplicationModel.findByUserId(user.id));
}

module.exports = { getMemberRole, memberRole, portalRole };
