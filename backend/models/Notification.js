import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

// In-app notifications. "admins" notifications (about NyaFie listings) are
// shared by every admin, the same way admin conversations are.
const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    audience: { type: String, enum: ["user", "admins"], default: "user", index: true },
    type: { type: String, required: true }, // e.g. rental_paid, sale_request, offer, message, status
    title: { type: String, required: true, maxlength: 140 },
    message: { type: String, default: "", maxlength: 300 },
    link: { type: String, default: "" }, // where to go in the app
    read: { type: Boolean, default: false, index: true },
    key: { type: String, index: true }, // groups repeats (e.g. several chat messages) into one unread notification
  },
  schemaOptions
);

export default mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
