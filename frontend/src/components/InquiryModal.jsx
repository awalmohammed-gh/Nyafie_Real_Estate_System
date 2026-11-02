import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import Modal from "./ui/Modal";
import { useAuth } from "../context/useAuth";
import { useRealEstate } from "../context/useRealEstate";

// Lets a visitor message the owner of a property (the admin or the listing agent)
const InquiryModal = ({ property, open, onClose }) => {
  const { user } = useAuth();
  const { addInquiry } = useRealEstate();
  const [form, setForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    message: `Hi, I'm interested in "${property.title}". Is it still available?`,
  });
  const [status, setStatus] = useState("idle"); // idle | sending | sent
  const [error, setError] = useState("");

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setStatus("sending");
    try {
      // The backend links the inquiry to the property owner
      await addInquiry({
        propertyId: property.id,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        message: form.message.trim(),
      });
      setStatus("sent");
    } catch (err) {
      setError(err.message);
      setStatus("idle");
    }
  };

  const close = () => {
    onClose();
    // Reset after the exit animation
    setTimeout(() => setStatus("idle"), 250);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={status === "sent" ? "Inquiry sent" : "Send an inquiry"}
      description={status === "sent" ? undefined : `About ${property.title}`}
    >
      {status === "sent" ? (
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="py-6 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </span>
          <p className="mt-4 font-semibold text-gray-900">{property.agent?.name || "The agent"} will get back to you soon.</p>
          <p className="mt-1 text-sm text-gray-500">We've shared your contact details with the listing agent.</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            {user && (
              <Link to="/account/inquiries" onClick={close} className="btn btn-light">
                View my inquiries
              </Link>
            )}
            <button onClick={close} className="btn btn-primary">Done</button>
          </div>
        </motion.div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="inq-name" className="mb-1.5 block text-sm font-medium text-gray-700">Full name</label>
              <input id="inq-name" name="name" value={form.name} onChange={handleChange} required autoComplete="name" className="field" />
            </div>
            <div>
              <label htmlFor="inq-phone" className="mb-1.5 block text-sm font-medium text-gray-700">Phone</label>
              <input id="inq-phone" name="phone" type="tel" value={form.phone} onChange={handleChange} required autoComplete="tel" className="field" />
            </div>
          </div>
          <div>
            <label htmlFor="inq-email" className="mb-1.5 block text-sm font-medium text-gray-700">Verified email</label>
            <input id="inq-email" name="email" type="email" value={user.email} readOnly required autoComplete="email" className="field" />
          </div>
          <div>
            <label htmlFor="inq-message" className="mb-1.5 block text-sm font-medium text-gray-700">Message</label>
            <textarea id="inq-message" name="message" rows={4} value={form.message} onChange={handleChange} required className="field resize-none" />
          </div>
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          {!user && <p className="text-xs text-gray-500">Sign in before sending to keep track of your inquiries in your account.</p>}
          <button type="submit" disabled={status === "sending"} className="btn btn-primary w-full py-3.5">
            {status === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send inquiry
          </button>
        </form>
      )}
    </Modal>
  );
};

export default InquiryModal;
