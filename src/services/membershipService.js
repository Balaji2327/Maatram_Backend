const { ApplicationModel, admissionStatus } = require("../models/Application");

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

async function getMemberRole(user) {
  return memberRole(await ApplicationModel.findByUserId(user.id), user.app_metadata?.role);
}

module.exports = { getMemberRole, memberRole };
