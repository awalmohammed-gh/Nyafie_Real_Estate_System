import client from "./client";
import { mapUser } from "./mappers";
import { prepareCustomerTab, clearCustomerTab } from "../utils/customerTabSession";
import { loadGoogleChallenge } from "../utils/googleIdentity";

export const forSession = (domain) => {
  const base = '/auth/' + domain;
  const config = { headers: { "X-Session-Domain": domain } };
  const present = (user) => mapUser(user, domain);
  const authResult = (data) => data?.verificationRequired ? data : present(data);
  return {
    getCurrentUser: async () => present((await client.get(base + "/me", config)).data),
    login: async (credentials) => {
      if (domain === "customer") prepareCustomerTab();
      return authResult((await client.post(base + "/login", credentials, config)).data);
    },
    register: async (details) => {
      if (!["customer", "agent"].includes(domain)) throw new Error("Registration is not available in this area.");
      if (domain === "customer") prepareCustomerTab();
      return authResult((await client.post(base + "/register", details, config)).data);
    },
    verifyEmail: async (challenge, code) => present((await client.post(base + "/verify-email", { challenge, code }, config)).data),
    resendVerification: async (challenge) => (await client.post(base + "/resend-verification", { challenge }, config)).data,
    requestPasswordReset: (email) => client.post(base + "/forgot-password", { email }, config),
    resetPassword: (email, code, newPassword) => client.post(base + "/reset-password", { email, code, newPassword }, config),
    googleChallenge: async () => {
      prepareCustomerTab();
      return loadGoogleChallenge(async () => (await client.post(base + "/google/challenge", {}, config)).data);
    },
    googleLogin: async (credential, challenge) => {
      prepareCustomerTab();
      const data = (await client.post(base + "/google", { credential, challenge }, config)).data;
      return { ...present(data.user), createdWithGoogle: data.created };
    },
    logout: async () => {
      const result = await client.post(base + "/logout", {}, config);
      if (domain === "customer") clearCustomerTab();
      return result;
    },
    updateProfile: async (changes) => present((await client.put(base + "/me", changes, config)).data),
    changePassword: (currentPassword, newPassword) => client.put(base + "/me/password", { currentPassword, newPassword }, config),
    uploadProfilePhoto: async (image) => present((await client.post(base + "/me/photo", { image }, config)).data),
    removeProfilePhoto: async () => present((await client.delete(base + "/me/photo", config)).data),
  };
};

export const becomeAgent = async (planId) => mapUser((await client.post("/auth/customer/become-agent", { planId }, { headers: { "X-Session-Domain": "customer" } })).data);
