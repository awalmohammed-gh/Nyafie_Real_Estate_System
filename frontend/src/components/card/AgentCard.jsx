import { ArrowUpRight, Mail, MapPin, Phone, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { getInitials } from "../../utils/property";

const AgentCard = ({ agent }) => {
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-gray-200/80 transition duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-brand-500/10 hover:ring-brand-200">
      {/* Banner + avatar */}
      <div className="h-24 bg-linear-to-br from-brand-500 to-brand-800" />
      <div className="-mt-10 flex items-end justify-between px-6">
        <div className="grid h-20 w-20 place-items-center rounded-2xl bg-white text-2xl font-extrabold text-brand-600 shadow-lg ring-4 ring-white">
          {getInitials(agent.name)}
        </div>
        {agent.rating && (
          <span className="mb-1 flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            {agent.rating.toFixed(1)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-6 pt-4">
        <h3 className="text-lg font-bold text-gray-900 transition-colors group-hover:text-brand-600">
          <Link to={`/agent/${agent.id}`} className="after:absolute after:inset-0">
            {agent.name}
          </Link>
        </h3>
        <p className="text-sm text-gray-500">Real Estate Agent</p>

        <dl className="mt-5 grid grid-cols-3 divide-x divide-gray-200 rounded-2xl bg-gray-50 py-3 text-center">
          <div>
            <dt className="text-xs text-gray-500">Listings</dt>
            <dd className="text-lg font-bold text-gray-900">{agent.properties.length}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">For Sale</dt>
            <dd className="text-lg font-bold text-gray-900">{agent.saleCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">For Rent</dt>
            <dd className="text-lg font-bold text-gray-900">{agent.rentCount}</dd>
          </div>
        </dl>

        <p className="mt-4 mb-6 flex items-start gap-1.5 text-sm text-gray-500">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
          {agent.locations.join(" · ")}
        </p>

        <div className="relative z-10 mt-auto flex items-center gap-2">
          <a href={`tel:${agent.phone.replace(/\s+/g, "")}`} className="btn btn-light flex-1 px-4 py-2.5">
            <Phone className="h-4 w-4" />
            Call
          </a>
          <a href={`mailto:${agent.email}`} className="btn btn-light flex-1 px-4 py-2.5">
            <Mail className="h-4 w-4" />
            Email
          </a>
          <Link
            to={`/agent/${agent.id}`}
            aria-label={`View profile of ${agent.name}`}
            className="grid h-10.5 w-10.5 shrink-0 place-items-center rounded-full bg-brand-500 text-white transition hover:bg-brand-700"
          >
            <ArrowUpRight className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </article>
  );
};

export default AgentCard;
