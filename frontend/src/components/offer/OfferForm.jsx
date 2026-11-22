import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { CheckCircle2, Info, Loader2, MessageCircle, Send } from "lucide-react";
import WhatsAppIcon from "../ui/WhatsAppIcon";
import { offerApi } from "../../frontApi";
import { getPriceParts, formatGhs } from "../../utils/property";
import { buildWhatsAppLink } from "../../utils/whatsapp";
import { propertyUrl } from "../../utils/siteUrl";
import { usePlatform } from "../../context/usePlatform";

// Make Offer: the customer proposes a price (a sale price, or a rent per period
// for rentals). Nothing is paid; the owner accepts, declines or counters, and the
// customer can keep negotiating on the website or WhatsApp.
const OfferForm = ({ property, ownerName, whatsappNumber }) => {
  const { settings } = usePlatform();
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [offer, setOffer] = useState(null);

  const isRent = property.property.status === "Rent";
  const { value: listed, period } = getPriceParts(property);
  const listedAmount = property.pricing.amount ?? property.pricing.perMonth ?? property.pricing.perNight;
  const value = Number(amount);
  const belowListed = value > 0 && listedAmount ? Math.round((1 - value / listedAmount) * 100) : 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!(value >= 1)) return setError("Enter the amount you'd like to offer.");
    setError("");
    setSending(true);
    try {
      setOffer(await offerApi.createOffer({ propertyId: property.id, amount: Math.round(value), message: message.trim() }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (offer) {
    const whatsappLink = buildWhatsAppLink(whatsappNumber, property, propertyUrl(property.id, settings), offer.amount);
    return (
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </span>
        <h2 className="mt-4 text-xl font-extrabold text-gray-900">Offer Submitted</h2>
        <dl className="mt-5 divide-y divide-gray-100 rounded-2xl px-4 text-left ring-1 ring-gray-200">
          <div className="flex justify-between py-3">
            <dt className="text-sm text-gray-500">Your offer</dt>
            <dd className="text-lg font-extrabold text-brand-600">{formatGhs(offer.amount)}{period}</dd>
          </div>
          <div className="flex justify-between py-3">
            <dt className="text-sm text-gray-500">{isRent ? "Listed rent" : "Asking price"}</dt>
            <dd className="font-semibold text-gray-900">{formatGhs(offer.askingPrice)}{period}</dd>
          </div>
        </dl>
        <p className="mt-5 text-sm text-gray-600">{ownerName} has been notified. You can now discuss your offer with them.</p>
        <div className={`mt-4 grid gap-3 ${whatsappLink ? "sm:grid-cols-2" : ""}`}>
          <Link to={offer.conversationId ? `/account/messages?c=${offer.conversationId}` : "/account/messages"} className="btn btn-primary">
            <MessageCircle className="h-4 w-4" />
            Chat on Website
          </Link>
          {whatsappLink && (
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="btn bg-emerald-600 text-white hover:bg-emerald-700">
              <WhatsAppIcon />
              WhatsApp
            </a>
          )}
        </div>
        <Link to="/account/offers" className="mt-5 inline-block text-sm font-semibold text-brand-600 hover:text-brand-800">
          View my offers
        </Link>
      </motion.div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex items-center justify-between rounded-2xl bg-gray-50 p-4">
        <span className="text-sm text-gray-500">{isRent ? "Listed rent" : "Asking price"}</span>
        <span className="text-lg font-extrabold text-gray-900">
          {listed}
          <span className="text-sm font-medium text-gray-500">{period}</span>
        </span>
      </div>
      <label className="block text-sm">
        <span className="mb-1.5 block font-semibold text-gray-900">
          Your Offer (GHS{isRent && period ? ` ${period.replace("/", "per ")}` : ""})
        </span>
        <span className="relative block">
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 font-semibold text-gray-400">₵</span>
          <input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            placeholder="Enter your offer amount"
            className="field pl-9 text-base font-semibold"
          />
        </span>
        {belowListed > 0 && <span className="mt-1.5 block text-xs text-gray-500">{belowListed}% below the listed price</span>}
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block font-semibold text-gray-900">
          Message <span className="font-normal text-gray-400">(optional)</span>
        </span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
          rows={5}
          placeholder={isRent ? "Rental length, move-in date, anything the owner should know..." : "Tell the owner about your offer, timing or financing..."}
          className="field resize-none"
        />
      </label>
      <p className="flex items-start gap-2 rounded-2xl bg-sky-50 p-4 text-sm text-sky-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        An offer is a proposal, not a payment. {ownerName} can accept, decline or counter, and you can negotiate in chat.
      </p>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={sending} className="btn btn-primary w-full py-4 text-base">
        {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        {sending ? "Submitting offer..." : "Submit Offer"}
      </button>
    </form>
  );
};

export default OfferForm;
