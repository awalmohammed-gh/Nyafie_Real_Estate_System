import client from "./client";
import { mapUser } from "./mappers";

// Agency team (owner and managers): { owner, members, invites, limit, canInvite }
export const getTeam = async () => (await client.get("/agents/team")).data;
// Returns { id, role, expiresAt, url }. The link is only shown once; only a hash is stored.
export const createInvite = async (role) => (await client.post("/agents/team/invites", { role })).data;
export const revokeInvite = (id) => client.delete(`/agents/team/invites/${id}`);
export const updateMember = async (id, role) => (await client.patch(`/agents/team/members/${id}`, { role })).data;
export const removeMember = (id) => client.delete(`/agents/team/members/${id}`);

// Joining from an invite link: which agency sent it, then joining with the signed-in agent account
export const viewInvite = async (token) => (await client.get(`/team/invites/${encodeURIComponent(token)}`)).data;
export const acceptInvite = async (token) => mapUser((await client.post(`/team/invites/${encodeURIComponent(token)}/accept`)).data);
