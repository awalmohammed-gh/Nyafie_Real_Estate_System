import client from "./client";
import { mapPaymentRecord, mapRental } from "./mappers";

// Starts a Paystack checkout for a saved rental. The backend recalculates the amount;
// returns { mode: "paystack", authorizationUrl, accessCode, reference }.
export const initializeRentalPayment = async (rentalId) => (await client.post("/payments/initialize", { rentalId })).data;

// The backend verifies the transaction with Paystack and returns the confirmed rental
export const verifyPayment = async (reference) =>
  mapRental((await client.get(`/payments/verify/${encodeURIComponent(reference)}`)).data);

// Admin: every rental (Paystack) and sale (office) payment record
export const getAdminPayments = async () => (await client.get("/admin/payments")).data.map(mapPaymentRecord);
