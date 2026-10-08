import client from "./client";
import { mapUser } from "./mappers";

export const forSession = (domain) => {
  const base = '/auth/' + domain;
  const config = { headers: { "X-Session-Domain": domain } };
  return {
    getCurrentUser: async () => mapUser((await client.get(base + "/me", config)).data),
    login: async (credentials) => mapUser((await client.post(base + "/login", credentials, config)).data),
    register: async (details) => {
      if (!["customer", "agent"].includes(domain)) throw new Error("Registration is not available in this area.");
      return mapUser((await client.post(base + "/register", details, config)).data);
    },
    logout: () => client.post(base + "/logout", {}, config),
    updateProfile: async (changes) => mapUser((await client.put(base + "/me", changes, config)).data),
    changePassword: (currentPassword, newPassword) => client.put(base + "/me/password", { currentPassword, newPassword }, config),
  };
};
