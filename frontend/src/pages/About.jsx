import { Link } from "react-router-dom";
import { ArrowRight, Home, Mail, MapPin, MessageCircle, Phone, Search, ShieldCheck, Users } from "lucide-react";
import { usePlatform } from "../context/usePlatform";
import PageMetadata from "../components/brand/PageMetadata";

// Every statement here describes a working feature of the platform: no figures are invented.
const HIGHLIGHTS = [
  { icon: Home, title: "Buy, Rent & Stay", text: "All in one place" },
  { icon: Users, title: "Trusted Agents", text: "Reviewed & approved" },
  { icon: MapPin, title: "Across Ghana", text: "Listings in every region" },
];

const DIFFERENCES = [
  { icon: Search, title: "Easy Property Discovery", text: "Find homes, apartments and short stays that match your needs, budget and preferred location, in a list or on the map." },
  { icon: Users, title: "Direct Agent Connections", text: "Connect with approved property agents and owners, ask questions, and schedule viewings easily." },
  { icon: ShieldCheck, title: "A More Trusted Experience", text: "Work with reviewed agents, make secure payments through Paystack, and manage your property journey online." },
];

const About = () => {
  const { settings, siteName, paths } = usePlatform();
  const { general, contact } = settings;
  const office = [contact.address, contact.city, contact.country].filter(Boolean).join(", ");
  const intro = general.description || `${siteName} is a Ghanaian real estate marketplace connecting property seekers with homes, apartments, short stays, and property professionals across Ghana.`;

  return (
    <div className="bg-white">
      <PageMetadata title={`About us | ${siteName}`} description={general.description} />

      {/* Hero */}
      <section className="bg-brand-50/60">
        <div className="container-page grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
          <div>
            <p className="text-sm font-bold tracking-wide text-brand-700 uppercase">About {siteName}</p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-balance text-gray-900 sm:text-5xl">Making it easier to find a place to call home.</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-gray-600">{intro}</p>
            <p className="mt-4 max-w-xl text-base leading-7 text-gray-600">We’re building a simpler, more trusted way to discover properties, explore opportunities, and connect with the right people, all in one place.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={paths.listings} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-700 px-6 text-sm font-semibold text-white shadow-md shadow-brand-700/25 transition-colors hover:bg-brand-800">
                Explore Properties
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link to="/contact" className="inline-flex min-h-12 items-center rounded-xl border border-gray-300 bg-white px-6 text-sm font-semibold text-gray-900 transition-colors hover:border-brand-300 hover:text-brand-700">Contact Us</Link>
            </div>
          </div>
          <img src="/agentBg.jpg" alt="A modern two-storey home" width="736" height="913" className="aspect-[4/3] w-full rounded-3xl object-cover shadow-xl shadow-gray-900/10 lg:aspect-[5/3]" />
        </div>
      </section>

      {/* Mission */}
      <section aria-labelledby="about-mission" className="container-page grid items-center gap-10 py-14 sm:py-16 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-14">
        <img src="/banners/listings-suburb-960.jpg" alt="A residential neighbourhood" width="960" height="540" loading="lazy" className="aspect-[16/10] w-full rounded-3xl object-cover shadow-lg shadow-gray-900/10" />
        <div>
          <p className="text-sm font-bold tracking-wide text-brand-700 uppercase">Our mission</p>
          <h2 id="about-mission" className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Our mission at {siteName}</h2>
          <p className="mt-4 text-base leading-7 text-gray-600">To make the Ghanaian property market more accessible, transparent, and convenient for everyone, whether you’re buying, renting, booking a short stay, or managing property as an agent or agency.</p>
          <ul className="mt-8 grid gap-6 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-gray-200">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="sm:px-5 sm:first:pl-0">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon aria-hidden="true" className="h-5 w-5" /></span>
                <p className="mt-3 text-base font-bold text-gray-900">{title}</p>
                <p className="mt-0.5 text-sm text-gray-500">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* What makes it different */}
      <section aria-labelledby="about-different" className="bg-brand-50/50">
        <div className="container-page py-14 sm:py-16">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="about-different" className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">What makes {siteName} different</h2>
            <p className="mt-3 text-gray-600">A property platform built for convenience, trust, and a better real estate experience in Ghana.</p>
          </div>
          <ul className="mt-10 grid gap-5 md:grid-cols-3">
            {DIFFERENCES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm shadow-gray-900/3">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon aria-hidden="true" className="h-6 w-6" /></span>
                <h3 className="mt-4 text-lg font-bold text-gray-900">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Agents and owners */}
      <section aria-labelledby="about-agents" className="container-page py-14 sm:py-16">
        <div className="grid overflow-hidden rounded-3xl bg-linear-to-br from-brand-700 to-brand-900 text-white shadow-xl shadow-brand-900/20 lg:grid-cols-2">
          <img src="/banners/contact-support.jpg" alt="A property professional working on a laptop and phone" loading="lazy" className="h-64 w-full object-cover sm:h-80 lg:h-full" />
          <div className="flex flex-col justify-center p-8 sm:p-10">
            <p className="text-xs font-bold tracking-wide text-white/80 uppercase">For agents & property owners</p>
            <h2 id="about-agents" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">List properties, reach more clients, and grow your business.</h2>
            <p className="mt-4 text-sm leading-6 text-white/85">Join real estate professionals on {siteName}. Showcase your properties, manage listings and bookings, and connect with serious buyers and renters across Ghana.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/agent/start" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50">
                Become an Agent
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link to="/agent/plans" className="inline-flex min-h-12 items-center rounded-xl border border-white/60 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/10">View Plans</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Get in touch */}
      <section aria-labelledby="about-contact" className="container-page pb-14 sm:pb-16">
        <div className="flex flex-col gap-6 rounded-3xl bg-brand-50/70 p-6 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4 lg:border-r lg:border-brand-100 lg:pr-8">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-700 text-white"><MessageCircle aria-hidden="true" className="h-7 w-7" /></span>
            <div>
              <h2 id="about-contact" className="text-xl font-bold text-gray-900">Get in touch</h2>
              <p className="mt-0.5 text-sm text-gray-600">Have a question, feedback, or need support? We’re here to help.</p>
            </div>
          </div>
          <dl className="flex flex-1 flex-wrap gap-x-10 gap-y-4 lg:px-2">
            {office && (
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-brand-700"><MapPin aria-hidden="true" className="h-5 w-5" /></span>
                <div><dt className="text-xs text-gray-500">Office</dt><dd className="text-sm font-semibold text-gray-900">{office}</dd></div>
              </div>
            )}
            {contact.phone ? (
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-brand-700"><Phone aria-hidden="true" className="h-5 w-5" /></span>
                <div><dt className="text-xs text-gray-500">Phone</dt><dd className="text-sm font-semibold text-gray-900"><a href={`tel:${contact.phone.replace(/\s+/g, "")}`} className="hover:text-brand-700">{contact.phone}</a></dd></div>
              </div>
            ) : contact.email ? (
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-brand-700"><Mail aria-hidden="true" className="h-5 w-5" /></span>
                <div><dt className="text-xs text-gray-500">Email</dt><dd className="text-sm font-semibold break-all text-gray-900"><a href={`mailto:${contact.email}`} className="hover:text-brand-700">{contact.email}</a></dd></div>
              </div>
            ) : null}
          </dl>
          <Link to="/contact" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-700 px-6 text-sm font-semibold text-white shadow-md shadow-brand-700/25 transition-colors hover:bg-brand-800">
            Contact Us
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
};

export default About;
