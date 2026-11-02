import client from "./client";
import { mapPaymentRecord, mapRefund, mapRental } from "./mappers";

// Starts a Paystack checkout for a saved rental. The backend recalculates the amount;
// returns { mode: "paystack", authorizationUrl, accessCode, reference }.
export const initializeRentalPayment = async (rentalId) => (await client.post("/payments/initialize", { rentalId })).data;

// The backend verifies the transaction with Paystack and returns the confirmed rental
export const verifyPayment = async (reference) =>
  mapRental((await client.get(`/payments/verify/${encodeURIComponent(reference)}`)).data);

// Admin: every rental (Paystack) and sale (office) payment record
export const getAdminPayments = async () => (await client.get("/admin/payments")).data.map(mapPaymentRecord);

// Admin refunds of flagged payments. Each returns { refund, message }.
const refundResult = (response) => ({ refund: mapRefund(response.data), message: response.message });
// { source: "payment" | "subscription", id, method: "paystack" | "manual", reason, externalReference }
export const requestRefund = async (body) => refundResult(await client.post("/admin/refunds", body));
export const checkRefund = async (id) => refundResult(await client.post(`/admin/refunds/${id}/check`));
// { outcome: "processed" | "failed", note } for a refund Paystack never confirmed
export const resolveRefund = async (id, body) => refundResult(await client.post(`/admin/refunds/${id}/resolve`, body));
