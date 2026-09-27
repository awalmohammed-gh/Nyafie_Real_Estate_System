import { useState } from "react";
import { Link } from "react-router-dom";
import { Bath, BedDouble, Eye, HandCoins, Home, Inbox, KeyRound, MapPin, Maximize2, Pencil, Settings2, Trash2 } from "lucide-react";
import SidePanel from "../ui/SidePanel";
import StatusBadge from "../ui/StatusBadge";
import PropertyQuickActions from "./PropertyQuickActions";
import { formatDate } from "../../utils/date";
import { formatLocation, formatType, getPriceParts, statusLabel } from "../../utils/property";

/**
 * Side panel with one of the agent's listings: photos, key facts, customer interest and
 * the actions they're allowed to take. The full page (/agent/properties/:id) has the details.
 * interest: { views, inquiries, offers, requests }
 */
const PropertyQuickView = ({ property: p, status, interest, perms, onClose, onDelete }) => {
  const [photo, setPhoto] = useState(0);
  const open = Boolean(p);
  const images = p?.media.images || [];
  const price = p && getPriceParts(p);

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title={p?.title}
      description={p && `${formatType(p.property.type)} · ${statusLabel(p.property.status)} · listed ${formatDate(p.listing.createdAt)}`}
      footer={
        p && (
          <>
            <button type="button" onClick={() => onDelete(p)} disabled={!perms.canDeleteProperty} className="btn btn-light text-red-600 disabled:opacity-50">
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
            {perms.canEditProperty && (
              <Link to={`/agent/properties/${p.id}/edit`} className="btn btn-light"><Pencil className="h-4 w-4" />Edit</Link>
            )}
            <Link to={`/agent/properties/${p.id}`} className="btn btn-primary"><Settings2 className="h-4 w-4" />Full details</Link>
          </>
        )
      }
    >
      {p && (
        <div className="space-y-6">
          {/* Gallery */}
          <div>
            <div className="relative aspect-video overflow-hidden rounded-lg bg-gray-100">
              {images[photo] ? (
                <img src={images[photo]} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full place-items-center text-gray-300"><Home className="h-8 w-8" /></span>
              )}
              <span className="absolute top-3 left-3"><StatusBadge status={status} className="bg-white/95" /></span>
            </div>
            {images.length > 1 && (
              <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
                {images.map((src, i) => (
                  <button key={src + i} type="button" onClick={() => setPhoto(i)} aria-label={`Photo ${i + 1}`} className={`shrink-0 overflow-hidden rounded-md ring-2 transition ${i === photo ? "ring-brand-500" : "ring-transparent opacity-70 hover:opacity-100"}`}>
                    <img src={src} alt="" className="h-14 w-20 object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-semibold tracking-tight text-gray-900 tabular-nums">{price.value}<span className="text-sm font-medium text-gray-500">{price.period}</span></p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500"><MapPin className="h-4 w-4" />{formatLocation(p.location)}</p>
            </div>
            <StatusBadge status={p.listing.availability} />
          </div>

          <dl className="grid grid-cols-3 divide-x divide-gray-100 rounded-lg border border-gray-200 text-center">
            {[
              [BedDouble, "Bedrooms", p.property.bedrooms],
              [Bath, "Bathrooms", p.property.bathrooms],
              [Maximize2, "Area", `${p.property.size?.value || 0} ${p.property.size?.unit || "sqm"}`],
            ].map(([Icon, label, value]) => (
              <div key={label} className="px-2 py-3">
                <dt className="flex items-center justify-center gap-1 text-xs text-gray-500"><Icon className="h-3.5 w-3.5" />{label}</dt>
                <dd className="mt-0.5 text-sm font-semibold text-gray-900">{value}</dd>
              </div>
            ))}
          </dl>

          {/* Customer interest, each linking to where it's handled */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Customer interest</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                [Eye, "Views", interest.views, null],
                [Inbox, "Inquiries", interest.inquiries, `/agent/inquiries?property=${p.id}`],
                [HandCoins, "Offers", interest.offers, `/agent/offers?property=${p.id}`],
                [KeyRound, "Requests", interest.requests, p.property.status === "Sale" ? "/agent/sale-requests" : "/agent/rentals"],
              ].map(([Icon, label, value, to]) => {
                const body = (
                  <>
                    <span className="flex items-center gap-1.5 text-xs text-gray-500"><Icon className="h-3.5 w-3.5" />{label}</span>
                    <span className="mt-0.5 block text-lg font-semibold text-gray-900 tabular-nums">{(value || 0).toLocaleString()}</span>
                  </>
                );
                return to ? (
                  <Link key={label} to={to} className="rounded-lg border border-gray-200 px-3 py-2 transition-colors hover:border-brand-200 hover:bg-brand-50/40">{body}</Link>
                ) : (
                  <div key={label} className="rounded-lg border border-gray-200 px-3 py-2">{body}</div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Status and visibility</h3>
            <PropertyQuickActions property={p} perms={perms} />
          </div>

          {p.description && (
            <div>
              <h3 className="mb-1.5 text-sm font-semibold text-gray-900">Description</h3>
              <p className="text-sm leading-relaxed whitespace-pre-line text-gray-600">{p.description}</p>
            </div>
          )}

          {p.features.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Amenities</h3>
              <ul className="flex flex-wrap gap-1.5">
                {p.features.map((f) => (
                  <li key={f} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">{f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </SidePanel>
  );
};

export default PropertyQuickView;
