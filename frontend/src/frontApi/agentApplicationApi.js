import client from "./client";
import { mapUser } from "./mappers";
const config = { headers: { "X-Session-Domain": "agent" } };
export const MAX_PROOF_BYTES = 3_000_000;
export const getProofDocuments = async () => (await client.get("/agents/application/documents", config)).data;
export const addProofDocument = async (document) => (await client.post("/agents/application/documents", document, config)).data;
export const removeProofDocument = async (id) => (await client.delete(`/agents/application/documents/${id}`, config)).data;
export const proofDocumentLink = async (id) => (await client.get(`/agents/application/documents/${id}/link`, config)).data.url;
const adminConfig = { headers: { "X-Session-Domain": "admin" } };
export const getAdminProofDocuments = async (id) => (await client.get(`/admin/agent-applications/${id}/documents`, adminConfig)).data;
export const adminProofDocumentLink = async (id, docId) => (await client.get(`/admin/agent-applications/${id}/documents/${docId}/link`, adminConfig)).data.url;
export const getApplication = async () => {
  const data = (await client.get("/agents/application", config)).data;
  return { ...data, user: mapUser(data.user) };
};
export const saveApplication = async (profile) => mapUser((await client.put("/agents/application", profile, config)).data);
export const submitApplication = async () => mapUser((await client.post("/agents/application/submit", {}, config)).data);
export const updateAgentProfile = async (profile) => mapUser((await client.put("/agents/profile", profile, config)).data);
