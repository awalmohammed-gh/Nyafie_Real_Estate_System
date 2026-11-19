import client from "./client";

// Mirrors REPORT_REASONS in backend/models/SafetyReport.js (the server checks the reason again)
export const REPORT_REASONS = {
  property: {
    scam: "Asks for money upfront or looks like a scam",
    unavailable: "Already sold or rented",
    wrong_details: "Wrong price, photos or location",
    duplicate: "Duplicate listing",
    offensive: "Offensive or inappropriate",
    other: "Something else",
  },
  agent: {
    scam: "Asked for money upfront or tried to scam me",
    conduct: "Rude, threatening or unprofessional",
    no_show: "Missed a viewing or stopped responding",
    impersonation: "Pretending to be someone else",
    other: "Something else",
  },
};

// targetType: "property" | "agent"
export const sendReport = async ({ targetType, targetId, reason, details }) => (await client.post("/reports", { targetType, targetId, reason, details })).data;

// Admin: status "open" | "resolved" | "dismissed" | "all"
export const getReports = async (status = "open") => (await client.get("/admin/reports", { params: { status } })).data;
// status "resolved" (action taken) | "dismissed" (no problem found); the note stays internal
export const reviewReport = async (id, status, note = "") => (await client.patch(`/admin/reports/${id}`, { status, note })).data;
