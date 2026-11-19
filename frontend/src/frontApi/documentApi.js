import client from "./client";

// Ownership documents for a sale listing (private: files are opened through links that expire)
const base = (propertyId) => `/properties/${propertyId}/documents`;

export const getDocuments = async (propertyId) => (await client.get(base(propertyId))).data;
// kind: land_title | indenture | search_report | site_plan | building_permit | other; file: a data URI
export const addDocument = async (propertyId, { kind, name, file }) => (await client.post(base(propertyId), { kind, name, file })).data;
export const removeDocument = async (propertyId, documentId) => (await client.delete(`${base(propertyId)}/${documentId}`)).data;
export const submitDocuments = async (propertyId) => (await client.post(`${base(propertyId)}/submit`)).data;
export const reopenDocuments = async (propertyId) => (await client.post(`${base(propertyId)}/reopen`)).data;
export const getDocumentLink = async (propertyId, documentId) => (await client.get(`${base(propertyId)}/${documentId}/link`)).data.url;

// Admin: status pending | verified | rejected | all
export const getDocumentChecks = async (status = "pending") => (await client.get("/admin/document-checks", { params: { status } })).data;
export const getCheckDocumentLink = async (checkId, documentId) => (await client.get(`/admin/document-checks/${checkId}/documents/${documentId}/link`)).data.url;
// decision: verify | reject (reject needs a note for the owner)
export const reviewDocumentCheck = async (checkId, decision, note = "") => (await client.patch(`/admin/document-checks/${checkId}`, { decision, note })).data;

// Mirrors DOCUMENT_KINDS in backend/utils/propertyDocuments.js
export const DOCUMENT_KINDS = {
  land_title: "Land title certificate",
  indenture: "Indenture (deed of conveyance)",
  search_report: "Lands Commission search report",
  site_plan: "Site plan",
  building_permit: "Building permit",
  other: "Other supporting document",
};
export const MAX_DOCUMENT_BYTES = 3_000_000;
