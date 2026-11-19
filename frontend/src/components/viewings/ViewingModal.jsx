import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { CalendarCheck, CheckCircle2, Loader2 } from "lucide-react";
import Modal from "../ui/Modal";
import ViewingTimeFields from "./ViewingTimeFields";
import { useAuth } from "../../context/useAuth";
import { viewingApi } from "../../frontApi";
import { formatViewingTime } from "../../utils/viewingTimes";

// A signed-in customer asks to see a property at a date and time; the owner confirms or suggests another
const ViewingModal = ({ property, ownerName, open, onClose }) => {
  const { user } = useAuth();
  const [when, setWhen] = useState({ date: "", time: "" });
  const [phone, setPhone] = useState(user?.phone || "");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent
  const [booked, setBooked] = useState(null);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setStatus("sending");
    try {
      setBooked(await viewingApi.requestViewing({ propertyId: property.id, ...when, phone: phone.trim(), message: message.trim() }));
      setStatus("sent");
    } catch (err) {
      setError(err.message);
      setStatus("idle");
    }
  };

  const close = () => {
    onClose();
    // Reset after the exit animation
    setTimeout(() => { setStatus("idle"); setWhen({ date: "", time: "" }); setMessage(""); setError(""); }, 250);
  };

  return (
    <Modal open={open} onClose={close} title={status === "sent" ? "Viewing requested" : "Book a viewing"} description={status === "sent" ? undefined : `${property.title} · with ${ownerName}`}>
      {status === "sent" ? (
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="py-6 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" aria-hidden="true" />
          </span>
          <p className="mt-4 font-semibold text-gray-900">Requested for {booked && formatViewingTime(booked.scheduledAt)}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">{ownerName} will confirm the time or suggest another. We'll notify you, and remind you the day before.</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/account/viewings" onClick={close} className="btn btn-light">View my viewings</Link>
            <button type="button" onClick={close} className="btn btn-primary">Done</button>
          </div>
        </motion.div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <ViewingTimeFields value={when} onChange={setWhen} disabled={status === "sending"} />
          <div>
            <label htmlFor="viewing-phone" className="mb-1.5 block text-sm font-medium text-gray-700">Phone the owner can call</label>
            <input id="viewing-phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" className="field" />
          </div>
          <div>
            <label htmlFor="viewing-message" className="mb-1.5 block text-sm font-medium text-gray-700">Note for the owner <span className="font-normal text-gray-500">(optional)</span></label>
            <textarea id="viewing-message" rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. I'll come with my partner. Is parking available?" className="field resize-none" />
          </div>
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={status === "sending" || !when.date || !when.time} className="btn btn-primary w-full py-3.5">
            {status === "sending" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CalendarCheck className="h-4 w-4" aria-hidden="true" />}
            Request viewing
          </button>
          <p className="text-xs leading-5 text-gray-500">Viewings are free. Never pay anyone to view a property.</p>
        </form>
      )}
    </Modal>
  );
};

export default ViewingModal;
