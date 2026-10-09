import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Building, CheckCircle2, HandCoins, Loader2, MessageCircle, Send, ShieldAlert } from "lucide-react";
import WhatsAppIcon from "../ui/WhatsAppIcon";
import { useAuth } from "../../context/useAuth";
import { saleRequestApi } from "../../frontApi";
import { getPriceParts } from "../../utils/property";

// Buy Now (sale properties). Two ways forward:
//  A. make an offer or chat with the owner to negotiate
//  B. submit a purchase request at the asking price
// No payment happens online: the owner sends instructions and the customer pays at the office.
const BuyNowPanel = ({ property, ownerName, whatsappLink, onChat }) => {
  const { user } = useAuth();
  const [form, setForm] = useState({ fullName: user?.name || "", email: user?.email || "", phone: user?.phone || "", message: "" });
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [request, setRequest] = useState(null);
  const { value: price } = getPriceParts(property);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSending(true);
    try {
      setRequest(await saleRequestApi.createSaleRequest({ propertyId: property.id, ...form, fullName: form.fullName.trim(), email: form.email.trim(), phone: form.phone.trim(), message: form.message.trim() }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (request) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </span>
        <h2 className="mt-4 text-xl font-extrabold text-gray-900">Purchase request submitted</h2>
        <p className="mt-2 text-sm text-gray-600">
          Your purchase request has been submitted successfully. {ownerName} will contact you with the next steps.
        </p>
        <p className="mt-5 flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-left text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            <strong className="font-semibold">This records your interest and does not complete a sale.</strong> Agree on the final amount, viewing, documents and payment arrangements directly with {ownerName}.
          </span>
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link to="/account/purchases" className="btn btn-primary">Track my request</Link>
          <Link to={request.conversationId ? `/account/messages?c=${request.conversationId}` : "/account/messages"} className="btn btn-light">
            <MessageCircle className="h-4 w-4" />
            Chat with {ownerName}
          </Link>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Option A */}
      <section className="rounded-2xl bg-brand-50/60 p-5 ring-1 ring-brand-100">
        <h2 className="flex items-center gap-2 font-bold text-gray-900">
          <HandCoins className="h-5 w-5 text-brand-500" />
          Want to negotiate first?
        </h2>
        <p className="mt-1 text-sm text-gray-600">Propose your price, or talk to {ownerName} about the property.</p>
        <div className={`mt-4 grid gap-2 ${["", "", "sm:grid-cols-2", "sm:grid-cols-3"][1 + Boolean(onChat) + Boolean(whatsappLink)]}`}>
          <Link to={`/make-offer/${property.id}`} className="btn btn-primary px-3">
            <HandCoins className="h-4 w-4" />
            Make Offer
          </Link>
          {onChat && <button onClick={onChat} className="btn btn-light px-3">
            <MessageCircle className="h-4 w-4" />
            Chat
          </button>}
          {whatsappLink && (
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="btn bg-emerald-600 px-3 text-white hover:bg-emerald-700">
              <WhatsAppIcon />
              WhatsApp
            </a>
          )}
        </div>
      </section>

      {/* Option B */}
      <form onSubmit={submit} className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <Building className="h-5 w-5 text-brand-500" />
          Submit a purchase request
        </h2>
        <p className="-mt-2 text-sm text-gray-500">
          Register interest in this listing. The asking price is <span className="font-semibold text-gray-900">{price}</span>; the final amount is agreed with the agent or owner.
        </p>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-gray-700">Full name</span>
          <input value={form.fullName} onChange={set("fullName")} required autoComplete="name" className="field" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Phone number</span>
            <input type="tel" value={form.phone} onChange={set("phone")} required autoComplete="tel" placeholder="024 000 0000" className="field" />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Email</span>
            <input type="email" value={form.email} onChange={set("email")} required autoComplete="email" className="field" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-gray-700">
            Message <span className="font-normal text-gray-400">(optional)</span>
          </span>
          <textarea rows={3} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value.slice(0, 1000) }))} placeholder="When would you like to view the property?" className="field resize-none" />
        </label>
        <p className="flex items-start gap-2 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
          No purchase payment is taken online. {ownerName} will discuss the sale and payment arrangements with you.
        </p>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={sending} className="btn btn-primary w-full py-4 text-base">
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          {sending ? "Submitting request..." : "Submit purchase request"}
        </button>
      </form>
    </div>
  );
};

export default BuyNowPanel;
