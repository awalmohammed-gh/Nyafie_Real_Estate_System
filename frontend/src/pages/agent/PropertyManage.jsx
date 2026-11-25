import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, Building2, CheckCircle2, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { useAgent } from "../../hooks/useAgent";
import { useRealEstate } from "../../context/useRealEstate";
import { usePagedList } from "../../hooks/usePagedList";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { DetailList, Panel } from "../../components/dashboard/Page";
import PropertyQuickActions from "../../components/agent/PropertyQuickActions";
import AssignWork from "../../components/agent/AssignWork";
import { offerApi, propertyApi, rentalApi, saleRequestApi } from "../../frontApi";
import StatusBadge from "../../components/ui/StatusBadge";
import EmptyState from "../../components/ui/EmptyState";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { formatPrice, formatType, getListingStatus, statusLabel, formatGhs } from "../../utils/property";
import { formatDate, formatRelative } from "../../utils/date";
import { usePlatform } from "../../context/usePlatform";
import WorkspaceStats from "../../components/agent/WorkspaceStats";
import HotelInventory from "../../components/agent/HotelInventory";
import { isHotel } from "../../utils/hotel";
import { cloudImage } from "../../utils/cloudImage";
import PropertyDocuments from "../../components/agent/PropertyDocuments";
import ListingInsights from "../../components/agent/ListingInsights";

const Notice = ({ tone, children }) => (
  <p className={`mb-6 flex items-start gap-2 rounded-lg border p-3 text-sm ${tone === "red" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
    <span>{children}</span>
  </p>
);

// One list of customer activity for this property (inquiries, offers, requests)
const InterestList = ({ rows, empty, to, toLabel }) => (
  <>
    {rows.length === 0 ? (
      <p className="px-5 py-6 text-sm text-gray-500">{empty}</p>
    ) : (
      <ul className="divide-y divide-gray-100">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-3 px-5 py-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">{row.name.charAt(0)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-gray-900">{row.name}</span>
              <span className="block truncate text-xs text-gray-500">{row.detail} · {formatRelative(row.at)}</span>
            </span>
            <StatusBadge status={row.status} className="shrink-0" />
          </li>
        ))}
      </ul>
    )}
    <div className="border-t border-gray-100 px-5 py-2.5">
      <Link to={to} className="text-xs font-semibold text-brand-600 hover:text-brand-800">{toLabel}</Link>
    </div>
  </>
);

// /agent/properties/:propertyId: everything about one listing in one place
const PropertyManage = () => {
  const { siteName } = usePlatform();
  const { propertyId } = useParams();
  const navigate = useNavigate();
  const { myProperties, myInquiries, permissions: perms } = useAgent();
  const { deleteListing, isPubliclyVisible, refreshListings, refreshInquiries } = useRealEstate();
  const run = useAsyncAction();
  const [activeImage, setActiveImage] = useState(0);
  const [tab, setTab] = useState("inquiries");
  const [deleting, setDeleting] = useState(false);

  const property = myProperties.find((p) => p.id === propertyId);
  const isSale = property?.property.status === "Sale";
  const offerList = usePagedList("agent-property-offers", { property: propertyId, limit: 6 }, (params) => offerApi.getOffersPage("agent", params));
  const requestList = usePagedList(`agent-property-${isSale ? "sales" : "rentals"}`, { property: propertyId, limit: 6, ...(isSale ? { tab: "all" } : {}) }, (params) => (isSale ? saleRequestApi.getSaleRequestsPage("agent", params) : rentalApi.getRentalsPage("agent", params)));
  if (!property) {
    return (
      <EmptyState
        icon={Building2}
        title="Property not found"
        description="It may have been deleted, or it belongs to another account."
        action={<Link to="/agent/properties" className="btn btn-primary px-3.5 py-2">Back to my properties</Link>}
      />
    );
  }

  const state = property.listing.state;
  const status = getListingStatus(property, state !== "published" || isPubliclyVisible(property));
  const images = property.media.images;

  const inquiries = myInquiries.filter((i) => i.propertyId === property.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const propertyOffers = offerList.data?.items || [];
  const requests = requestList.data?.items || [];

  const lists = {
    inquiries: {
      label: "Inquiries",
      total: inquiries.length,
      rows: inquiries.map((i) => ({ id: i.id, name: i.name, detail: i.message, at: i.createdAt, status: i.status })),
      empty: "No inquiries about this property yet.",
      to: `/agent/inquiries?property=${property.id}`,
      toLabel: "Manage inquiries",
    },
    offers: {
      label: "Offers",
      total: offerList.data?.total,
      rows: propertyOffers.map((o) => ({ id: o.id, name: o.customer.name, detail: `Offered ${formatGhs(o.amount)}`, at: o.createdAt, status: o.status })),
      empty: "No offers on this property yet.",
      to: `/agent/offers?property=${property.id}`,
      toLabel: "Respond to offers",
    },
    requests: {
      label: isSale ? "Sale requests" : "Rental requests",
      total: requestList.data?.total,
      rows: requests.map((r) =>
        isSale
          ? { id: r.id, name: r.contactName, detail: `${r.paymentStatus} payment`, at: r.createdAt, status: r.status }
          : { id: r.id, name: r.contactName, detail: `${formatGhs(r.amount)} · move-in ${formatDate(r.startDate)}`, at: r.createdAt, status: r.status }
      ),
      empty: isSale ? "No purchase requests yet." : "No rental requests yet.",
      to: `${isSale ? "/agent/sale-requests" : "/agent/rentals"}?property=${property.id}`,
      toLabel: isSale ? "Manage sale requests" : "Manage rental requests",
    },
  };
  const current = lists[tab];

  const confirmDelete = async () => {
    setDeleting(false);
    const { ok } = await run(deleteListing(property.id), { success: "Property deleted", description: property.title, type: "info" });
    if (ok) navigate("/agent/properties");
  };

  return (
    <>
      <Link to="/agent/properties" className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" />
        My properties
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">{property.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <StatusBadge status={status} />
            {state === "published" && <StatusBadge status={property.listing.availability} dot={false} />}
            {property.meta?.isFeatured && <StatusBadge status="Featured" dot={false} />}
            <span>
              {formatType(property.property.type)} · {statusLabel(property.property.status)} · {property.location.name}, {property.location.city}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {isPubliclyVisible(property) && (
            <Link to={`/house/${property.id}`} className="btn btn-light px-3.5 py-2">
              <ExternalLink className="h-4 w-4" />
              Public page
            </Link>
          )}
          <button onClick={() => setDeleting(true)} disabled={!perms.canDeleteProperty} className="btn btn-light px-3.5 py-2 text-red-600">
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
          <button onClick={() => navigate(`/agent/properties/${property.id}/edit`)} disabled={!perms.canEditProperty} className="btn btn-primary px-3.5 py-2">
            <Pencil className="h-4 w-4" />
            {state === "rejected" ? "Edit & resubmit" : "Edit"}
          </button>
        </div>
      </div>

      {state === "pending" && <Notice>In review: {siteName} is checking this listing. It isn't visible to the public yet.</Notice>}
      {state === "rejected" && <Notice tone="red"><strong className="font-semibold">Rejected:</strong> {property.listing.rejectionReason || "Please review the listing details and resubmit."}</Notice>}
      {state === "suspended" && <Notice tone="red">This listing has been hidden by {siteName}. Contact support for details.</Notice>}

      <WorkspaceStats className="mb-6" items={[
        { label: "Property views", value: (property.meta?.views || 0).toLocaleString(), note: "Customer interest in this listing" },
        { label: "Inquiries", value: inquiries.length, note: "Customers asking for details", to: `/agent/inquiries?property=${property.id}` },
        { label: "Offers", value: offerList.data?.total ?? "—", note: "Price offers received", to: `/agent/offers?property=${property.id}` },
        { label: isSale ? "Purchase requests" : "Rental requests", value: requestList.data?.total ?? "—", note: "Customers taking the next step", to: `${isSale ? "/agent/sale-requests" : "/agent/rentals"}?property=${property.id}` },
      ]} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel bodyClassName="p-3">
            <img src={cloudImage(images[activeImage] || images[0], 640)} alt={property.title} className="aspect-video w-full rounded-lg bg-gray-100 object-cover" />
            {images.length > 1 && (
              <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
                {images.map((src, i) => (
                  <button key={src + i} onClick={() => setActiveImage(i)} aria-label={`Show photo ${i + 1}`} className={`h-14 w-20 shrink-0 overflow-hidden rounded-md ring-2 transition ${i === activeImage ? "ring-brand-500" : "ring-transparent opacity-70 hover:opacity-100"}`}>
                    <img src={cloudImage(src, 80)} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Property information">
            <DetailList
              columns="sm:grid-cols-3"
              items={[
                ["Price", formatPrice(property)],
                ["Listing type", statusLabel(property.property.status)],
                ["Property type", formatType(property.property.type)],
                ["Bedrooms", property.property.bedrooms],
                ["Bathrooms", property.property.bathrooms],
                ["Size", `${property.property.size?.value} ${property.property.size?.unit}`],
                ["Availability", property.listing.availability],
                ["Views", (property.meta?.views || 0).toLocaleString()],
                ["Photos", images.length],
                ["Address", property.location.address || "—"],
                ["Area", `${property.location.name}, ${property.location.city}`],
                ["Region", property.location.region || "—"],
                ["Added", formatDate(property.listing.createdAt)],
                ["Last updated", formatDate(property.listing.updatedAt)],
              ]}
            />
          </Panel>
          {isHotel(property) && <HotelInventory property={property} />}

          <Panel title="Description & amenities">
            <p className="text-sm leading-relaxed whitespace-pre-line text-gray-700">{property.description || "No description yet."}</p>
            {property.features.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                {property.features.map((f) => (
                  <li key={f} className="flex items-center gap-1.5 rounded-md bg-gray-50 px-2.5 py-1 text-xs text-gray-700 ring-1 ring-gray-200">
                    <CheckCircle2 className="h-3.5 w-3.5 text-brand-500" />
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Manage listing">
            <PropertyQuickActions property={property} perms={perms} />
            {perms.canAssignWork && <div className="mt-5 border-t border-gray-100 pt-5"><AssignWork assignedTo={property.assignedTo} canAssign assign={(memberId) => propertyApi.assignProperty(property.id, memberId)} onDone={() => { refreshListings(); refreshInquiries(); }} note="Its inquiries, chats, offers and requests go to the same person." /></div>}
          </Panel>

          <ListingInsights propertyId={property.id} />

          {/* Sale listings: private ownership documents for the "Documents checked" badge */}
          {property.details?.status === "Sale" && <PropertyDocuments propertyId={property.id} />}

          <Panel title="Customer interest" bodyClassName="">
            <div className="grid grid-cols-3 border-b border-gray-100 text-center">
              {Object.entries(lists).map(([key, list]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  aria-pressed={tab === key}
                  className={`border-b-2 px-2 py-2.5 transition-colors ${tab === key ? "border-brand-500 bg-brand-50/40" : "border-transparent hover:bg-gray-50"}`}
                >
                  <span className="block text-lg font-semibold text-gray-900 tabular-nums">{list.total ?? "–"}</span>
                  <span className="block truncate text-[11px] font-medium text-gray-500">{list.label}</span>
                </button>
              ))}
            </div>
            <InterestList rows={current.rows.slice(0, 6)} empty={current.empty} to={current.to} toLabel={current.toLabel} />
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={confirmDelete}
        title="Delete this property?"
        description={`${property.title} will be removed from your listings and the public site. This can't be undone.`}
        confirmLabel="Delete property"
      />
    </>
  );
};

export default PropertyManage;
