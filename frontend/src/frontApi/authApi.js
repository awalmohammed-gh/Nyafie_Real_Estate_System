import client from "./client";
import { mapUser } from "./mappers";

export const getCurrentUser = async () => mapUser((await client.get("/auth/me")).data);
export const loginUser = async (credentials) => mapUser((await client.post("/auth/login", credentials)).data);
export const loginAdmin = async (credentials) => mapUser((await client.post("/auth/admin/login", credentials)).data);
export const registerUser = async (details) => mapUser((await client.post("/auth/register", details)).data);
export const logoutUser = () => client.post("/auth/logout");
export const updateProfile = async (changes) => mapUser((await client.put("/auth/me", changes)).data);
export const changePassword = (currentPassword, newPassword) => client.put("/auth/me/password", { currentPassword, newPassword });
