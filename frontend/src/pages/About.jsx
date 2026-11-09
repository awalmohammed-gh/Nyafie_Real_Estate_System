import { Link } from "react-router-dom";
import {
  ArrowRight, BadgeCheck, BedDouble, Building2, Clock, CreditCard, Home, KeyRound, Mail, MapPin,
  MessageCircle, Navigation, Phone, Search, ShieldCheck, Users,
} from "lucide-react";
import { usePlatform } from "../context/usePlatform";
import PageMetadata from "../components/brand/PageMetadata";

// What people can actually do on the platform (every item here is a working feature)
const OFFERS = [
  { icon: Home, title: "Buy a home", text: "Browse homes for sale with photos, prices and locations, request a viewing, and make an offer to the owner or agent." },
  { icon: KeyRound, title: "Rent a home", text: "See the full rent for your dates before you commit, then pay securely online once the owner confirms." },
  { icon: BedDouble, title: "Short stays and hotels", text: "Book a room or a short stay for your dates, then pay online or reserve now and pay when you arrive." },
  { icon: Navigation, title: "Search near you", text: "Find homes on the map around your location or any area in Ghana, sorted by how close they are." },
];

const TRUST = [
  { icon: BadgeCheck, title: "Reviewed agents", text: "Agents apply and are reviewed by our team before they can list properties." },
  { icon: CreditCard, title: "Verified payments", text: "Online payments go through Paystack, and every payment is checked with Paystack before a booking or plan is confirmed." },
  { icon: ShieldCheck, title: "You stay in control", text: "Contact owners through the app, WhatsApp or phone, and view a property before you pay for a purchase." },
];

const STEPS = [
  { icon: Search, title: "Search", text: "Filter by buy, rent or short stay, budget, area and amenities, or search on the map." },
  { icon: MessageCircle, title: "Connect", text: "Ask questions, request a viewing or make an offer directly with the owner or agent." },
  { icon: Building2, title: "Move in", text: "Confirm your rental or stay, pay securely, and keep everything in your account." },
];

const About = () => {
  const { settings, siteName, paths } = usePlatform();
  const { general, contact } = settings;
  const paragraphs = (general.fullDescription || general.description || "").split(/\n\s*\n/).map((text) => text.trim()).filter(Boolean);
  const address = [contact.address, contact.city, contact.region, contact.country].filter(Boolean).join(", ");
  const contactRows = [
    address && { icon: MapPin, label: "Office", value: address, href: contact.mapUrl || null },
    contact.phone && { icon: Phone, label: "Phone", value: contact.phone, href: `tel:${contact.phone.replace(/\s+/g, "")}` },
    contact.email && { icon: Mail, label: "Email", value: contact.email, href: `mailto:${contact.email}` },
    contact.hours && { icon: Clock, label: "Hours", value: contact.hours },
  ].filter(Boolean);

  return (
    <div className="bg-white">
      <PageMetadata title={`About us | ${siteName}`} description={general.description} />

      <section className="bg-linear-to-b from-brand-50/70 to-white">
        <div className="container-page py-14 sm:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold tracking-widest text-brand-700 uppercase">About us</p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-balance text-gray-900 sm:text-5xl">About {siteName}</h1>
            {general.tagline && <p className="mt-4 text-lg font-medium text-brand-700">{general.tagline}</p>}
            <div className="mt-6 space-y-5 text-base leading-8 text-gray-600 sm:text-lg">
              {paragraphs.map((text, index) => <p key={index}>{text}</p>)}
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to={paths.listings} className="btn btn-primary px-6 py-3">
                Explore properties
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link to="/contact" className="btn btn-light px-6 py-3">Contact us</Link>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="about-offers" className="container-page py-14 sm:py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="about-offers" className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">What you can do on {siteName}</h2>
          <p className="mt-3 text-gray-600">One place to find, rent, book and buy property across Ghana.</p>
        </div>
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {OFFERS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm shadow-gray-900/3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600"><Icon aria-hidden="true" className="h-5 w-5" /></span>
              <h3 className="mt-4 text-base font-bold text-gray-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="about-steps" className="bg-gray-50">
        <div className="container-page py-14 sm:py-16">
          <h2 id="about-steps" className="text-center text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">How it works</h2>
          <ol className="mx-auto mt-10 grid max-w-5xl gap-5 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, index) => (
              <li key={title} className="relative rounded-2xl bg-white p-6 ring-1 ring-gray-200">
                <span className="absolute top-5 right-5 text-3xl font-bold text-gray-100 tabular-nums" aria-hidden="true">0{index + 1}</span>
                <Icon aria-hidden="true" className="h-6 w-6 text-brand-600" />
                <h3 className="mt-4 text-base font-bold text-gray-900"><span className="sr-only">Step {index + 1}: </span>{title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="about-trust" className="container-page py-14 sm:py-16">
        <h2 id="about-trust" className="text-center text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Why people use {siteName}</h2>
        <ul className="mx-auto mt-10 grid max-w-5xl gap-8 md:grid-cols-3">
          {TRUST.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-600 text-white"><Icon aria-hidden="true" className="h-5 w-5" /></span>
              <div>
                <h3 className="text-base font-bold text-gray-900">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-gray-600">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="about-agents" className="container-page pb-14 sm:pb-16">
        <div className="grid gap-8 overflow-hidden rounded-3xl bg-linear-to-r from-brand-700 to-brand-500 p-8 text-white shadow-lg shadow-brand-900/20 sm:p-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15"><Users aria-hidden="true" className="h-6 w-6" /></span>
            <div>
              <h2 id="about-agents" className="text-xl font-bold sm:text-2xl">Are you an agent or property owner?</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/85">List your properties, manage rentals and bookings, and grow your business with your own team on {siteName}.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/agent/register" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-brand-700 hover:bg-brand-50">Become an agent<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
            <Link to="/agent/plans" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/60 px-5 text-sm font-semibold text-white hover:bg-white/10">See plans</Link>
          </div>
        </div>
      </section>

      {contactRows.length > 0 && (
        <section aria-labelledby="about-contact" className="border-t border-gray-100 bg-gray-50">
          <div className="container-page py-12">
            <h2 id="about-contact" className="text-xl font-bold tracking-tight text-gray-900">Get in touch</h2>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {contactRows.map(({ icon: Icon, label, value, href }) => (
                <div key={label} className="flex items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-gray-200">
                  <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                  <div className="min-w-0">
                    <dt className="text-xs text-gray-500">{label}</dt>
                    <dd className="mt-0.5 text-sm font-semibold break-words text-gray-900">
                      {href ? <a href={href} className="hover:text-brand-700" {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{value}</a> : value}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}
    </div>
  );
};

export default About;
