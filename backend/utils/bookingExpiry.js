import Rental from "../models/Rental.js";
import { flagCancelledBookingPayment, announceCancelledBookingRefund } from "./refunds.js";
import { notifyOwner, notifyUser } from "./notify.js";
import { formatGHS } from "./ownership.js";
import { reportError } from "./monitoring.js";

/*
 * Hotel bookings the hotel doesn't answer: a booking must be approved (room assigned) by 24 hours
 * before check-in, or it is cancelled automatically. The held rooms are released, the guest and the
 * hotel are told, and a payment made online is flagged for a refund. A booking made less than a day
 * before check-in gives the hotel 2 hours (never past check-in itself).
 *
 * Runs in the daily job and also whenever bookings are looked at (the hotel's and the guest's
 * lists, a booking, room availability, an approval), so a deadline never waits for the next day.
 */
const HOUR = 60 * 60 * 1000;
export const APPROVAL_LEAD_MS = 24 * HOUR;
export const LAST_MINUTE_GRACE_MS = 2 * HOUR;

// Ghana keeps GMT all year: the check-in day at the guest's arrival time (noon if none was given)
export const checkInTime = (rental) => new Date(`${new Date(rental.startDate).toISOString().slice(0, 10)}T${rental.arrivalTime || "12:00"}:00Z`);

/** When an unapproved hotel booking is cancelled */
export const approvalDeadline = (rental) => {
  const checkIn = checkInTime(rental).getTime();
  const usual = checkIn - APPROVAL_LEAD_MS;
  const booked = new Date(rental.createdAt || Date.now()).getTime();
  // Booked within the last day before check-in: a short window to answer, never past check-in
  return new Date(booked + LAST_MINUTE_GRACE_MS > usual ? Math.min(checkIn, booked + LAST_MINUTE_GRACE_MS) : usual);
};

// Waiting for the hotel: a pay-at-hotel reservation, or a booking paid online, with no rooms assigned
export const AWAITING_APPROVAL = { hotelId: { $exists: true, $ne: null }, approvedAt: { $exists: false }, $or: [{ status: "confirmed", paymentOption: "on_arrival" }, { status: "paid" }] };
export const isAwaitingApproval = (rental) => Boolean(rental?.hotelId) && !rental.approvedAt && ((rental.status === "confirmed" && rental.paymentOption === "on_arrival") || rental.status === "paid");

const cancelOne = async (candidate, now) => {
  // Imported here: the hotel transaction lives with the controllers that import this file
  const { hotelTransaction } = await import("./hotel.js");
  let flagged = null;
  const cancelled = await hotelTransaction(candidate.hotelId, async (_hotel, session) => {
    const current = await Rental.findById(candidate._id).session(session);
    // Approved or changed meanwhile: leave it
    if (!current || !isAwaitingApproval(current) || approvalDeadline(current) > now) return null;
    current.status = "cancelled";
    current.history.push({ status: "cancelled", paymentStatus: current.paymentStatus, note: "Cancelled automatically: the hotel didn't approve the booking in time (24 hours before check-in)" });
    await current.save({ session });
    flagged = current.paymentStatus === "paid" ? await flagCancelledBookingPayment(current, session) : null;
    return current;
  });
  if (!cancelled) return false;
  if (flagged) await announceCancelledBookingRefund(flagged);
  const day = new Date(cancelled.startDate).toISOString().slice(0, 10);
  await Promise.all([
    notifyUser(cancelled.customer, { type: "status", title: "Hotel booking cancelled", message: `The hotel didn't approve your ${cancelled.roomName} booking for ${day} in time, so it was cancelled and the rooms released.${flagged ? ` Your payment of ${formatGHS(flagged.amount)} will be refunded.` : " Nothing was paid."} You can book again or choose another hotel.`, link: "/account/rentals" }),
    notifyOwner(cancelled, { type: "rental", title: "Unanswered booking cancelled", message: `${cancelled.contactName}'s booking for ${day} (${cancelled.numberOfRooms} ${cancelled.roomName}) wasn't approved 24 hours before check-in, so it was cancelled and the rooms released.`, path: "rentals" }),
  ]);
  return true;
};

/**
 * Cancels the overdue unapproved bookings matching `scope` (e.g. { hotelId }, { customer }, { _id }).
 * Never throws: a failure is logged and reported, and the request that triggered it carries on.
 * Returns how many were cancelled.
 */
export const expireUnansweredBookings = async (scope = {}, now = new Date()) => {
  try {
    // Only bookings whose check-in is near can be overdue (the deadline is at most a day before it)
    const candidates = await Rental.find({ ...scope, ...AWAITING_APPROVAL, startDate: { $lte: new Date(now.getTime() + 2 * APPROVAL_LEAD_MS) } })
      .select("_id hotelId status paymentOption approvedAt startDate arrivalTime createdAt").limit(200).lean();
    let count = 0;
    for (const candidate of candidates) {
      if (approvalDeadline(candidate) > now) continue;
      if (await cancelOne(candidate, now)) count += 1;
    }
    return count;
  } catch (error) {
    console.error("Unanswered booking expiry failed:", error.message);
    await reportError(error, { tags: { job: "booking-expiry" } });
    return 0;
  }
};
