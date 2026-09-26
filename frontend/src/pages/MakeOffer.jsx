import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Bath, Bed, CheckCircle2, Home, Info, Loader2, MapPin, Send, Trash2 } from 'lucide-react';
import { useRealEstate } from '../context/useRealEstate';
import { formatLocation, formatPrice } from '../utils/property';

const MakeOffer = () => {
  const navigate = useNavigate();
  const { makeOffer, properties, setMakeOffer, removeFromOffer } = useRealEstate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [formData, setFormData] = useState({
    fullname: "",
    email: "",
    phone: "",
    price: "",
    message: "",
  });
  const timers = useRef([]);

  const selected = makeOffer.map((id) => properties.find((item) => item.id === id)).filter(Boolean);

  // Cancel pending timers if the user leaves the page mid-submit
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate API call. Replace with a real request that sends
    // { propertyIds: makeOffer, ...formData } to the backend.
    timers.current.push(setTimeout(() => {
      setMakeOffer([]);
      setIsSubmitting(false);
      setSubmitSuccess(true);
      timers.current.push(setTimeout(() => navigate('/listings'), 4000));
    }, 1500));
  };

  if (submitSuccess) {
    return (
      <div className="grid min-h-[70vh] place-items-center bg-gray-50 px-4 py-16">
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl sm:p-10"
        >
          <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          </span>
          <h1 className="mt-6 text-2xl font-extrabold text-gray-900">Offer submitted!</h1>
          <p className="mt-2 text-gray-600">
            Your offer has been sent successfully. The property owner will contact you shortly.
          </p>
          <Link to="/listings" className="btn btn-primary mt-8">
            Browse More Properties
          </Link>
          <p className="mt-4 text-xs text-gray-400">Taking you back to listings in a moment...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 py-10 sm:py-14">
      <div className="container-page">
        <Link to="/listings" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" />
          Back to listings
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">Make an Offer</h1>
        <p className="mt-2 text-gray-600">Submit your offer for the properties you're interested in.</p>

        <div className="mt-10 grid gap-8 lg:grid-cols-5">
          {/* Selected properties */}
          <section className="lg:col-span-3">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
              Your selected properties
              <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-sm text-brand-700">{selected.length}</span>
            </h2>

            {selected.length === 0 ? (
              <div className="rounded-3xl bg-white px-6 py-16 text-center ring-1 ring-gray-200/80">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gray-50 text-gray-400">
                  <Home className="h-8 w-8" />
                </span>
                <p className="mt-5 font-semibold text-gray-900">No properties selected yet</p>
                <p className="mt-1 text-sm text-gray-500">Open a property and tap "Make an Offer" to add it here.</p>
                <Link to="/listings" className="btn btn-primary mt-6">
                  Browse Properties
                </Link>
              </div>
            ) : (
              <ul className="space-y-4">
                <AnimatePresence initial={false}>
                  {selected.map((item) => (
                    <motion.li
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -30 }}
                      className="flex gap-4 rounded-3xl bg-white p-3 ring-1 ring-gray-200/80 sm:p-4"
                    >
                      <Link to={`/house/${item.id}`} className="shrink-0">
                        <img
                          src={item.media.images[0]}
                          alt={item.title}
                          className="h-24 w-24 rounded-2xl object-cover sm:h-28 sm:w-36"
                        />
                      </Link>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <Link to={`/house/${item.id}`} className="font-bold text-gray-900 hover:text-brand-600">
                            {item.title}
                          </Link>
                          <button
                            onClick={() => removeFromOffer(item.id)}
                            aria-label={`Remove ${item.title}`}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-gray-400 transition hover:bg-red-50 hover:text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="flex items-center gap-1 text-sm text-gray-500">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{formatLocation(item.location)}</span>
                        </p>
                        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
                          <span className="flex items-center gap-3 text-xs text-gray-500">
                            <span className="flex items-center gap-1"><Bed className="h-3.5 w-3.5" />{item.property.bedrooms}</span>
                            <span className="flex items-center gap-1"><Bath className="h-3.5 w-3.5" />{item.property.bathrooms}</span>
                          </span>
                          <span className="font-extrabold text-brand-600">{formatPrice(item)}</span>
                        </div>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </section>

          {/* Offer form */}
          <section className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-gray-200/80 sm:p-8 lg:sticky lg:top-28">
              <h2 className="text-lg font-bold text-gray-900">Your details</h2>
              <div>
                <label htmlFor="fullname" className="mb-1.5 block text-sm font-medium text-gray-700">Full name</label>
                <input id="fullname" name="fullname" value={formData.fullname} onChange={handleChange} required autoComplete="name" placeholder="Enter your full name" className="field" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
                  <input id="email" type="email" name="email" value={formData.email} onChange={handleChange} required autoComplete="email" placeholder="you@example.com" className="field" />
                </div>
                <div>
                  <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-gray-700">Phone</label>
                  <input id="phone" type="tel" name="phone" value={formData.phone} onChange={handleChange} required autoComplete="tel" placeholder="+233 ..." className="field" />
                </div>
              </div>
              <div>
                <label htmlFor="price" className="mb-1.5 block text-sm font-medium text-gray-700">Your offer (GHS)</label>
                <div className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 font-semibold text-gray-400">₵</span>
                  <input id="price" type="number" min="1" inputMode="numeric" name="price" value={formData.price} onChange={handleChange} required placeholder="Enter your offer amount" className="field pl-9" />
                </div>
              </div>
              <div>
                <label htmlFor="message" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Message <span className="text-gray-400">(optional)</span>
                </label>
                <textarea id="message" name="message" rows={3} value={formData.message} onChange={handleChange} placeholder="Anything the owner should know?" className="field resize-none" />
              </div>

              <p className="flex items-start gap-2 rounded-2xl bg-sky-50 p-4 text-sm text-sky-800">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                Your offer is sent to the listing agent, who will contact you to discuss next steps.
              </p>

              <button type="submit" disabled={isSubmitting || selected.length === 0} className="btn btn-primary w-full py-3.5">
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Submit Offer
                  </>
                )}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
};

export default MakeOffer;
