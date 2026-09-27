import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Building2, CheckCircle2, ExternalLink, Eye, EyeOff, Pencil, Star, StarOff, Trash2, X, XCircle, Plus, Tag } from "lucide-react";
import { useAdminData } from "../../hooks/useAdminData";
import { useToast } from "../../context/useToast";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import AdminPageTitle from "../../components/admin/AdminPageTitle";
import DataTable from "../../components/ui/DataTable";
import FilterTabs from "../../components/ui/FilterTabs";
import SearchInput from "../../components/ui/SearchInput";
import StatusBadge from "../../components/ui/StatusBadge";
import ActionMenu from "../../components/ui/ActionMenu";
import SidePanel from "../../components/ui/SidePanel";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import { formatDate } from "../../utils/date";
import { formatPrice, formatType, getApprovalStatus, getListingStatus, statusLabel } from "../../utils/property";
import { usePlatform } from "../../context/usePlatform";
import { useViewMode } from "../../hooks/useViewMode";
import PropertyTile from "../../components/dashboard/PropertyTile";
import ViewToggle from "../../components/dashboard/ViewToggle";

const EditPropertyModal = ({ property, onClose }) => {
  const { updateListing } = useAdminData();
  const { toast } = useToast();
  const run = useAsyncAction();
  const priceKey = property.pricing.amount != null ? "amount" : property.pricing.perNight != null ? "perNight" : "perMonth";
  const [form, setForm] = useState({
    title: property.title,
    price: String(property.pricing[priceKey] ?? ""),
    availability: property.listing.availability,
    description: property.description,
  });

  const save = async () => {
    if (form.title.trim().length < 3 || !(Number(form.price) > 0)) {
      toast({ type: "error", title: "Enter a title and a valid price" });
      return;
    }
    const { ok } = await run(
      updateListing(property.id, {
        title: form.title.trim(),
        description: form.description.trim(),
        pricing: { ...property.pricing, [priceKey]: Number(form.price) },
        listing: { availability: form.availability },
      }),
      { success: "Property updated", description: form.title }
    );
    if (ok) onClose();
  };

  return (
    <Modal open onClose={onClose} title="Edit property" description={property.title} size="lg"
      footer={<><button onClick={onClose} className="btn btn-light">Cancel</button><button onClick={save} className="btn btn-primary">Save changes</button></>}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1.5 block font-medium text-gray-700">Title</span>
          <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className="field" />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-gray-700">Price (GHS{priceKey === "perMonth" ? " / month" : priceKey === "perNight" ? " / night" : ""})</span>
          <input type="number" min="1" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} className="field" />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-gray-700">Availability</span>
          <select value={form.availability} onChange={(e) => setForm((p) => ({ ...p, availability: e.target.value }))} className="field">
            <option>Available</option>
            <option>Under Offer</option>
            <option>{property.property.status === "Sale" ? "Sold" : "Rented"}</option>
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1.5 block font-medium text-gray-700">Description</span>
          <textarea rows={5} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className="field resize-y" />
        </label>
      </div>
    </Modal>
  );
};

const AdminProperties = () => {
  const { siteName } = usePlatform();
  const { listings, ownerOf, isPubliclyVisible, setListingState, setFeatured, deleteListing, updateListing, users } = useAdminData();
  const run = useAsyncAction();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(params.get("status") || "all");
  const [ownerType, setOwnerType] = useState("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [view, setView] = useViewMode("admin-properties");

  const ownerId = params.get("owner");
  const ownerFilterName = ownerId && users.find((u) => u.id === ownerId)?.name;
  const openId = params.get("open");
  const viewed = openId && listings.find((p) => p.id === openId);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const q = query.trim().toLowerCase();
  const scoped = listings.filter((p) => (!ownerId || p.owner.id === ownerId) && (ownerType === "all" || p.owner.type === ownerType));
  const rows = scoped
    .filter((p) => status === "all" || p.listing.state === status)
    .filter((p) => !q || `${p.title} ${p.location.name} ${p.location.city} ${ownerOf(p).name}`.toLowerCase().includes(q))
    .sort((a, b) => (a.listing.state === "pending" ? -1 : 0) - (b.listing.state === "pending" ? -1 : 0) || new Date(b.listing.createdAt) - new Date(a.listing.createdAt));

  const count = (state) => scoped.filter((p) => state === "all" || p.listing.state === state).length;

  const approve = (p) => run(setListingState(p.id, "published"), { success: "Property approved", description: `${p.title} is now published.` });
  const hide = (p) => run(setListingState(p.id, "suspended"), { success: "Property hidden", description: p.title, type: "warning" });
  const restore = (p) => run(setListingState(p.id, "published"), { success: "Property visible again", description: p.title });
  const toggleFeatured = (p) =>
    run(setFeatured(p.id, !p.meta?.isFeatured), { success: p.meta?.isFeatured ? "Removed from featured" : "Marked as featured", description: p.title });

  // HomeBase listings: publish/unpublish and availability. Agent listings: review and moderation.
  const setAvailability = (p, availability) =>
    run(updateListing(p.id, { listing: { availability } }), { success: `Marked ${availability.toLowerCase()}`, description: p.title });
  const soldLabel = (p) => (p.property.status === "Sale" ? "Sold" : "Rented");

  const actionsFor = (p) => {
    const own = p.owner.type === "admin";
    const state = p.listing.state;
    return [
    { label: "View property", icon: Eye, onClick: () => setParam("open", p.id) },
    { label: "Edit property", icon: Pencil, onClick: () => (own ? navigate(`/admin/properties/${p.id}/edit`) : setEditing(p)) },
    { label: "Publish", icon: CheckCircle2, onClick: () => run(setListingState(p.id, "published"), { success: "Property published", description: p.title }), hidden: !own || state === "published" },
    { label: "Unpublish", icon: EyeOff, onClick: () => run(setListingState(p.id, "draft"), { success: "Moved to drafts", description: p.title }), hidden: !own || state !== "published" },
    { label: `Mark as ${soldLabel(p).toLowerCase()}`, icon: Tag, onClick: () => setAvailability(p, soldLabel(p)), hidden: !own || p.listing.availability === soldLabel(p) },
    { label: "Mark as available", icon: Tag, onClick: () => setAvailability(p, "Available"), hidden: !own || p.listing.availability === "Available" },
    { label: "Approve", icon: CheckCircle2, onClick: () => approve(p), hidden: own || !["pending", "rejected"].includes(state) },
    { label: "Reject", icon: XCircle, onClick: () => { setRejecting(p); setReason(""); }, hidden: own || state !== "pending" },
    { label: p.meta?.isFeatured ? "Unfeature" : "Feature", icon: p.meta?.isFeatured ? StarOff : Star, onClick: () => toggleFeatured(p), hidden: p.listing.state !== "published" },
    p.listing.state === "suspended"
      ? { label: "Unhide", icon: Eye, onClick: () => restore(p) }
      : { label: "Hide property", icon: EyeOff, onClick: () => hide(p), hidden: p.listing.state !== "published" },
    { label: "Delete", icon: Trash2, danger: true, onClick: () => setDeleting(p) },
    ];
  };

  const ownerCell = (p) => {
    const owner = ownerOf(p);
    return (
      <div className="min-w-0">
        <p className="truncate text-gray-800">{owner.name}</p>
        <p className="truncate text-xs text-gray-500">{owner.type === "Admin" ? `${siteName} listing` : "Agent listing"}</p>
      </div>
    );
  };

  const listingBadge = (p) => {
    const visible = p.listing.state !== "published" || isPubliclyVisible(p);
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={getListingStatus(p, visible)} />
        {p.listing.state === "published" && !["Available", getListingStatus(p, visible)].includes(p.listing.availability) && <StatusBadge status={p.listing.availability} dot={false} />}
        {p.meta?.isFeatured && <StatusBadge status="Featured" dot={false} />}
      </div>
    );
  };

  const columns = [
    {
      key: "property",
      header: "Property",
      render: (p) => (
        <div className="flex min-w-0 items-center gap-3">
          <img src={p.media.images[0]} alt="" className="h-10 w-14 shrink-0 rounded-md bg-gray-100 object-cover" />
          <span className="min-w-0">
            <span className="block max-w-56 truncate font-medium text-gray-900">{p.title}</span>
            <span className="block text-xs text-gray-500"><span className="capitalize">{formatType(p.property.type)}</span> · {statusLabel(p.property.status)}</span>
          </span>
        </div>
      ),
    },
    { key: "location", header: "Location", render: (p) => <span className="block max-w-40 truncate text-gray-600">{p.location.name}, {p.location.city}</span> },
    { key: "price", header: "Price", render: (p) => <span className="font-medium whitespace-nowrap text-gray-900">{formatPrice(p)}</span> },
    { key: "owner", header: "Agent / owner", render: ownerCell },
    { key: "status", header: "Status", render: listingBadge },
    { key: "added", header: "Added", render: (p) => <span className="whitespace-nowrap text-gray-500">{formatDate(p.listing.createdAt)}</span> },
    { key: "actions", header: <span className="sr-only">Actions</span>, align: "right", render: (p) => <ActionMenu actions={actionsFor(p)} label={`Actions for ${p.title}`} /> },
  ];

  return (
    <>
      <AdminPageTitle
        title="Properties"
        description={`Every listing on the platform, from ${siteName} and agents.`}
        action={<Link to="/admin/properties/add" className="btn btn-primary"><Plus className="h-4 w-4" />Add Property</Link>}
      />

      <div className="mb-5 flex flex-col gap-3">
        <FilterTabs
          value={status}
          onChange={setStatus}
          tabs={[
            { id: "all", label: "All", count: count("all") },
            { id: "pending", label: "Pending Review", count: count("pending") },
            { id: "published", label: "Published", count: count("published") },
            { id: "rejected", label: "Rejected", count: count("rejected") },
            { id: "suspended", label: "Hidden", count: count("suspended") },
            { id: "draft", label: "Drafts", count: count("draft") },
          ]}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput value={query} onChange={setQuery} placeholder="Search title, area or owner" className="sm:w-80" />
          <select value={ownerType} onChange={(e) => setOwnerType(e.target.value)} aria-label="Filter by owner type" className="field py-2 sm:w-44">
            <option value="all">All owners</option>
            <option value="admin">Admin</option>
            <option value="agent">Agents</option>
          </select>
          {ownerId && (
            <button onClick={() => setParam("owner", null)} className="inline-flex items-center gap-1.5 self-start rounded-full bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100">
              Owner: {ownerFilterName || ownerId}
              <X className="h-4 w-4" />
            </button>
          )}
          <div className="flex items-center justify-between gap-3 sm:ml-auto">
            <p className="text-sm text-gray-500 sm:hidden">{rows.length} {rows.length === 1 ? "property" : "properties"}</p>
            <ViewToggle value={view} onChange={setView} />
          </div>
        </div>
      </div>

      {view === "grid" ? (
        rows.length === 0 ? (
          listings.length === 0 ? (
            <EmptyState icon={Building2} title="No properties yet" description="Properties added to the platform will appear here." action={<Link to="/admin/properties/add" className="btn btn-primary px-3.5 py-2"><Plus className="h-4 w-4" />Add Property</Link>} />
          ) : (
            <EmptyState icon={Building2} title="No properties here" description="Nothing matches these filters." />
          )
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {rows.map((p, i) => (
              <PropertyTile
                key={p.id}
                index={i}
                property={p}
                owner={ownerOf(p).name}
                status={getListingStatus(p, p.listing.state !== "published" || isPubliclyVisible(p))}
                actions={actionsFor(p)}
                onOpen={() => setParam("open", p.id)}
              />
            ))}
          </div>
        )
      ) : (
      <DataTable
        columns={columns}
        rows={rows}
        minWidth={980}
        onRowClick={(p) => setParam("open", p.id)}
        empty={<EmptyState icon={Building2} title="No properties here" description="Nothing matches these filters." />}
        mobileCard={(p) => (
          <div className="flex gap-3">
            <img src={p.media.images[0]} alt="" className="h-20 w-24 shrink-0 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => setParam("open", p.id)} className="min-w-0 text-left">
                  <p className="truncate font-semibold text-gray-900">{p.title}</p>
                  <p className="truncate text-xs text-gray-500">{ownerOf(p).name} · {formatPrice(p)}</p>
                </button>
                <ActionMenu actions={actionsFor(p)} label={`Actions for ${p.title}`} />
              </div>
              <div className="mt-2">{listingBadge(p)}</div>
            </div>
          </div>
        )}
      />
      )}

      {/* View / moderate */}
      <SidePanel
        open={Boolean(viewed)}
        onClose={() => setParam("open", null)}
        title={viewed?.title}
        description={viewed && `${formatType(viewed.property.type)} · ${statusLabel(viewed.property.status)} · added ${formatDate(viewed.listing.createdAt)}`}
        footer={
          viewed && (
            <>
              <button onClick={() => setDeleting(viewed)} className="btn btn-light text-red-600"><Trash2 className="h-4 w-4" />Delete</button>
              {viewed.listing.state === "pending" && (
                <button onClick={() => { setRejecting(viewed); setReason(""); }} className="btn btn-light"><XCircle className="h-4 w-4" />Reject</button>
              )}
              {["pending", "rejected"].includes(viewed.listing.state) ? (
                <button onClick={() => approve(viewed)} className="btn btn-primary"><CheckCircle2 className="h-4 w-4" />Approve & publish</button>
              ) : (
                <button onClick={() => setEditing(viewed)} className="btn btn-primary"><Pencil className="h-4 w-4" />Edit</button>
              )}
            </>
          )
        }
      >
        {viewed && (
          <div className="space-y-5">
            <img src={viewed.media.images[0]} alt="" className="aspect-video w-full rounded-lg bg-gray-100 object-cover" />
            {viewed.media.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {viewed.media.images.slice(1).map((src, i) => <img key={i} src={src} alt="" className="h-14 w-20 shrink-0 rounded-md object-cover" />)}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xl font-semibold text-gray-900">{formatPrice(viewed)}</p>
              <div className="flex flex-wrap gap-2">
                {listingBadge(viewed)}
                <StatusBadge status={`Approval: ${getApprovalStatus(viewed)}`} tone={{ Pending: "amber", Rejected: "red", Approved: "green" }[getApprovalStatus(viewed)] || "gray"} />
              </div>
            </div>
            {viewed.listing.state === "rejected" && viewed.listing.rejectionReason && (
              <p className="rounded-lg bg-red-50 p-4 text-sm text-red-800"><span className="font-semibold">Rejection reason:</span> {viewed.listing.rejectionReason}</p>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-gray-200 p-4 text-sm sm:grid-cols-3">
              {[
                ["Owner", `${ownerOf(viewed).name} (${ownerOf(viewed).type})`],
                ["Contact", viewed.agent?.name || "—"],
                ["Location", `${viewed.location.name}, ${viewed.location.city}`],
                ["Bedrooms", viewed.property.bedrooms],
                ["Bathrooms", viewed.property.bathrooms],
                ["Size", `${viewed.property.size?.value} ${viewed.property.size?.unit}`],
                ["Availability", viewed.listing.availability],
                ["Views", (viewed.meta?.views || 0).toLocaleString()],
                ["Photos", viewed.media.images.length],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="truncate font-semibold text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm leading-relaxed text-gray-600">{viewed.description}</p>
            <div className="flex flex-wrap gap-2">
              {viewed.listing.state === "published" && (
                <>
                  <button onClick={() => toggleFeatured(viewed)} className="btn btn-light">
                    {viewed.meta?.isFeatured ? <StarOff className="h-4 w-4" /> : <Star className="h-4 w-4" />}
                    {viewed.meta?.isFeatured ? "Unfeature" : "Feature"}
                  </button>
                  <button onClick={() => hide(viewed)} className="btn btn-light"><EyeOff className="h-4 w-4" />Hide</button>
                  {isPubliclyVisible(viewed) && <Link to={`/house/${viewed.id}`} className="btn btn-light"><ExternalLink className="h-4 w-4" />Public page</Link>}
                </>
              )}
              {viewed.listing.state === "suspended" && <button onClick={() => restore(viewed)} className="btn btn-light"><Eye className="h-4 w-4" />Unhide</button>}
            </div>
          </div>
        )}
      </SidePanel>

      {editing && <EditPropertyModal property={editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Reject property?"
        description={rejecting && `${rejecting.title} will be returned to the agent with your reason so they can fix and resubmit it.`}
        confirmLabel="Reject property"
        disabled={reason.trim().length < 5}
        onConfirm={async () => {
          const property = rejecting;
          setRejecting(null);
          await run(setListingState(property.id, "rejected", { rejectionReason: reason.trim() }), { success: "Property rejected", description: property.title, type: "info" });
        }}
      >
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-gray-700">Reason for the agent</span>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Photos are blurry and the price looks incorrect." className="field resize-none" />
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete property?"
        description={deleting && `${deleting.title} will be permanently removed from the platform. This can't be undone.`}
        confirmLabel="Delete property"
        onConfirm={async () => {
          const property = deleting;
          setDeleting(null);
          const { ok } = await run(deleteListing(property.id), { success: "Property deleted", description: property.title, type: "info" });
          if (ok && openId === property.id) setParam("open", null);
        }}
      />
    </>
  );
};

export default AdminProperties;
