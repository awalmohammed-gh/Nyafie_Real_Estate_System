import client from "./client";
import { mapUser } from "./mappers";
const config = { headers: { "X-Session-Domain": "agent" } };
export const getApplication = async () => {
  const data = (await client.get("/agents/application", config)).data;
  return { ...data, user: mapUser(data.user) };
};
export const saveApplication = async (profile) => mapUser((await client.put("/agents/application", profile, config)).data);
export const submitApplication = async () => mapUser((await client.post("/agents/application/submit", {}, config)).data);
export const updateAgentProfile = async (profile) => mapUser((await client.put("/agents/profile", profile, config)).data);
