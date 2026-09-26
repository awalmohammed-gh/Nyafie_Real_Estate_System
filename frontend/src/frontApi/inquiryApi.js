import client from "./client";
import { mapInquiry } from "./mappers";

export const sendInquiry = async (inquiry) => mapInquiry((await client.post("/inquiries", inquiry)).data);
export const getMyInquiries = async () => (await client.get("/users/inquiries")).data.map(mapInquiry);
