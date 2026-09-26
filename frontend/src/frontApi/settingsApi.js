import client from "./client";

export const getSettings = async () => (await client.get("/settings")).data;
