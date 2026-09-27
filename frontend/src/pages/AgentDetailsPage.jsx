import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { ChevronRight, Eye, Home, Mail, MapPin, Phone, Star } from "lucide-react";
import { useRealEstate } from "../context/useRealEstate";
import HouseCard from "../components/card/HouseCard";
import Reveal from "../components/ui/Reveal";
import NotFound from "./NotFound";
import NavOverlay from "../components/nav/NavOverlay";
import PageLoader from "../components/ui/PageLoader";
import { getInitials } from "../utils/property";
import { usePlatform } from "../context/usePlatform";

const tabs = [
  { label: "All", value: "All" },
  { label: "For Sale", value: "Sale" },
  { label: "For Rent", value: "Rent" },
];

const AgentDetailsPage = () => {
  const { paths } = usePlatform();
  const { id } = useParams();
  const { agents, agentsLoading } = useRealEstate();
  const [selectedCategory, setSelectedCategory] = useState("All");

  const agent = agents.find((item) => item.id === id);

  if (!agent && agentsLoading) return <PageLoader label="Loading agent..." />;

  if (!agent) {
    return <NotFound message="We couldn't find this agent." />;
  }

  const listings = agent.properties.filter(
    (p) => selectedCategory === "All" || p.property.status === selectedCategory
  );

  const stats = [
    { icon: Home, label: "Listings", value: agent.properties.length },
    { icon: Star, label: "Avg. rating", value: agent.rating ? agent.rating.toFixed(1) : "N/A" },
    { icon: Eye, label: "Total views", value: agent.views.toLocaleString() },
    { icon: MapPin, label: "Areas", value: agent.locations.length },
  ];

  return (
    <>
      {/* Profile header */}
      <section className="relative isolate overflow-hidden bg-gray-950">
        <NavOverlay />
        <div className="absolute inset-0 -z-10 bg-linear-to-br from-brand-700/60 via-gray-950 to-gray-950" />
        <div className="absolute -top-32 -right-32 -z-10 h-96 w-96 rounded-full bg-brand-500/30 blur-3xl" />

        <div className="container-page pt-28 pb-12 sm:pt-32 sm:pb-16 lg:pt-36">
          <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-1.5 text-sm text-gray-400">
            <Link to="/" className="hover:text-white">Home</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link to={paths.agents} className="hover:text-white">Agents</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-white">{agent.name}</span>
          </nav>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between"
          >
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <span className="grid h-24 w-24 shrink-0 place-items-center rounded-3xl bg-white text-3xl font-extrabold text-brand-600 shadow-2xl">
                {getInitials(agent.name)}
              </span>
              <div>
                <p className="text-sm font-semibold tracking-wider text-brand-300 uppercase">Real Estate Agent</p>
                <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{agent.name}</h1>
                <p className="mt-2 flex items-start gap-1.5 text-gray-300">
                  <MapPin className="mt-1 h-4 w-4 shrink-0 text-brand-400" />
                  {agent.locations.join(" · ")}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              {agent.phone && (
                <a href={`tel:${agent.phone.replace(/\s+/g, "")}`} className="btn btn-primary">
                  <Phone className="h-4 w-4" />
                  {agent.phone}
                </a>
              )}
              <a href={`mailto:${agent.email}`} className="btn bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20">
                <Mail className="h-4 w-4" />
                Send email
              </a>
            </div>
          </motion.div>

          <dl className="mt-12 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
                <stat.icon className="h-5 w-5 text-brand-300" />
                <dd className="mt-3 text-2xl font-extrabold text-white">{stat.value}</dd>
                <dt className="text-sm text-gray-400">{stat.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Listings */}
      <section className="container-page py-14 sm:py-20">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
            Listings by {agent.name.split(" ")[0]}
          </h2>
          <div role="tablist" className="flex w-fit gap-1 rounded-full bg-gray-100 p-1.5">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                role="tab"
                aria-selected={selectedCategory === tab.value}
                onClick={() => setSelectedCategory(tab.value)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  selectedCategory === tab.value ? "bg-white text-brand-600 shadow-sm" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {listings.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((property, index) => (
              <Reveal key={property.id} delay={(index % 3) * 0.08} className="h-full">
                <HouseCard house={property} />
              </Reveal>
            ))}
          </div>
        ) : (
          <p className="rounded-3xl bg-gray-50 px-6 py-16 text-center text-gray-500">
            {agent.name.split(" ")[0]} has no listings in this category right now.
          </p>
        )}
      </section>
    </>
  );
};

export default AgentDetailsPage;
