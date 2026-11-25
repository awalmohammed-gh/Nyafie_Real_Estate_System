import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Building2, CheckCircle2, ClipboardCheck, ExternalLink, Eye, EyeOff, FilePenLine, MapPin, Pencil, RotateCcw, Star, StarOff, Trash2, X, XCircle, Plus, Tag } from "lucide-react";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useDebounced, usePagedList } from "../../hooks/usePagedList";
import { useRealEstate } from "../../context/useRealEstate";
import { adminApi } from "../../frontApi";
import { ErrorState, TableSkeleton } from "../../components/dashboard/States";
import { useToast } from "../../context/useToast";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import DataTable, { Pager } from "../../components/ui/DataTable";
import FilterTabs from "../../components/ui/FilterTabs";
import SearchInput from "../../components/ui/SearchInput";
import StatusBadge from "../../components/ui/StatusBadge";
import { hasMapPin } from "../../utils/geo";
import ActionMenu from "../../components/ui/ActionMenu";
import AdminRecordModal from "../../components/admin/AdminRecordModal";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import { formatDate } from "../../utils/date";
import { formatPrice, formatType, getApprovalStatus, getListingStatus, statusLabel } from "../../utils/property";
import { usePlatform } from "../../context/usePlatform";
import { useViewMode } from "../../hooks/useViewMode";
import PropertyTile from "../../components/dashboard/PropertyTile";
import ViewToggle from "../../components/dashboard/ViewToggle";
import { propertyCardImageSources } from "../../utils/propertyImages";
import { adminPath } from "../../utils/adminEntry";
import FreshnessNotice, { FreshnessBadge } from "../../components/dashboard/FreshnessNotice";
import "./adminProperties.css";
import { cloudImage } from "../../utils/cloudImage";

// The owner as the list shows it (the server names it)
const ownerOf = (property) => (property.owner.type === "admin" ? { name: property.ownerName, type: "Admin" } : { name: property.ownerName, type: "Agent", id: property.owner.id });
const isPubliclyVisible = (property) => property.isPublic;

const EditPropertyModal = ({ property, onClose, onSaved }) => {
  const { updateListing } = useRealEstate();
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
    if (ok) {
      onSaved();
      onClose();
    }
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
  const { siteName, paths } = usePlatform();
  const { setListingState, setFeatured, deleteListing, updateListing, confirmAvailability } = useRealEstate();
  const runAction = useAsyncAction();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(params.get("status") || "all");
  const [ownerType, setOwnerType] = useState("all");
  const [query, setQuery] = useState("");
  const [purpose, setPurpose] = useState("all");
  const [sort, setSort] = useState("review");
  const [editing, setEditing] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [view, setView] = useViewMode("admin-properties");

  const ownerId = params.get("owner");
  const openId = params.get("open");
  const search = useDebounced(query.trim());
  const list = usePagedList("admin-properties", { status, ownerType, owner: ownerId || undefined, purpose, sort, search: search || undefined }, adminApi.getPropertiesPage);
  const rows = list.data?.items || [];
  // Opened from a link, it may not be on the page shown
  const onPage = openId && rows.find((p) => p.id === openId);
  const details = useApiQuery(openId && list.data && !onPage ? `admin-property:${openId}` : null, () => adminApi.getAdminProperty(openId));
  const viewed = openId && (onPage || details.data || null);
  // Every change reloads the page shown (and an open listing that isn't on it)
  const run = async (...args) => {
    const result = await runAction(...args);
    if (result.ok) {
      list.reload();
      details.reload();
    }
    return result;
  };

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const selectStatus = (value) => { setStatus(value); setParam("status", value === "all" ? null : value); };

  const counts = list.data?.counts || {};
  const purposes = list.data?.purposes || {};
  const count = (state) => counts[state] || 0;
  const filtered = status !== "all" || ownerType !== "all" || purpose !== "all" || Boolean(query.trim() || ownerId);
  const resetFilters = () => {
    setStatus("all"); setOwnerType("all"); setPurpose("all"); setQuery(""); setSort("review");
    setParams((current) => { const next = new URLSearchParams(current); next.delete("owner"); next.delete("status"); return next; }, { replace: true });
  };
  const reviewQueue = () => { selectStatus("pending"); setPurpose("all"); setQuery(""); setSort("review"); };
  const summary = [
    { id: "all", label: "Total properties", icon: Building2, note: `${purposes.Rent || 0} for rent · ${purposes.Sale || 0} for sale`, tone: "plum" },
    { id: "published", label: "Published", icon: CheckCircle2, note: "Approved listings", tone: "green" },
    { id: "pending", label: "Awaiting review", icon: ClipboardCheck, note: "Check details before publishing", tone: "amber" },
    { id: "draft", label: "Drafts", icon: FilePenLine, note: "Saved, not yet published", tone: "slate" },
  ];

  const approve = (p) => run(setListingState(p.id, "published"), { success: "Property approved", description: `${p.title} is now published.` });
  const hide = (p) => run(setListingState(p.id, "suspended"), { success: "Property hidden", description: p.title, type: "warning" });
  const restore = (p) => run(setListingState(p.id, "published"), { success: "Property visible again", description: p.title });
  const toggleFeatured = (p) =>
    run(setFeatured(p.id, !p.meta?.isFeatured), { success: p.meta?.isFeatured ? "Removed from featured" : "Marked as featured", description: p.title });

  // NyaFie listings: publish/unpublish and availability. Agent listings: review and moderation.
  const setAvailability = (p, availability) =>
    run(updateListing(p.id, { listing: { availability } }), { success: `Marked ${availability.toLowerCase()}`, description: p.title });
  const soldLabel = (p) => (p.property.status === "Sale" ? "Sold" : "Rented");

  const actionsFor = (p) => {
    const own = p.owner.type === "admin";
    const state = p.listing.state;
    return [
    { label: "View property", icon: Eye, onClick: () => setParam("open", p.id) },
    { label: "Edit property", icon: Pencil, onClick: () => (own ? navigate(adminPath(`/properties/${p.id}/edit`)) : setEditing(p)) },
    { label: "Publish", icon: CheckCircle2, onClick: () => run(setListingState(p.id, "published"), { success: "Property published", description: p.title }), hidden: !own || state === "published" },
    { label: "Unpublish", icon: EyeOff, onClick: () => run(setListingState(p.id, "draft"), { success: "Moved to drafts", description: p.title }), hidden: !own || state !== "published" },
    { label: `Mark as ${soldLabel(p).toLowerCase()}`, icon: Tag, onClick: () => setAvailability(p, soldLabel(p)), hidden: !own || p.listing.availability === soldLabel(p) },
    { label: "Mark as available", icon: Tag, onClick: () => setAvailability(p, "Available"), hidden: !own || p.listing.availability === "Available" },
    { label: "Still available", icon: CheckCircle2, onClick: () => run(confirmAvailability(p.id), { success: "Listing confirmed as still available", description: p.title }), hidden: p.listing.freshness === "fresh" },
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
      <div className="ap-owner-cell">
        <span className={`ap-owner-avatar ${owner.type === "Admin" ? "is-platform" : ""}`}>{owner.type === "Admin" ? <Building2 size={16} aria-hidden="true" /> : owner.name.charAt(0)}</span>
        <div className="min-w-0"><p className="truncate text-gray-800">{owner.name}</p><p className="truncate text-xs text-gray-500">{owner.type === "Admin" ? "Platform listing" : "Agent listing"}</p></div>
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
        <FreshnessBadge property={p} />
        {!hasMapPin(p) && <span title="No map pin: this listing doesn't appear in “near me” search until one is added"><StatusBadge status="No map pin" tone="gray" dot={false} /></span>}
        {hasMapPin(p) && p.location.approximate && <span title="Placed automatically from the address. Drag the pin onto the exact building in the editor."><StatusBadge status="Area pin" tone="gray" dot={false} /></span>}
      </div>
    );
  };

  const columns = [
    {
      key: "property",
      header: "Property",
      render: (p) => (
        <div className="flex min-w-0 items-center gap-3">
          {p.media.images[0] ? <img {...propertyCardImageSources(p.media.images[0])} sizes="64px" alt="" loading="lazy" className="ap-table-photo" /> : <span className="ap-table-photo ap-photo-placeholder"><Building2 size={22} aria-hidden="true" /></span>}
          <span className="min-w-0">
            <button type="button" onClick={() => setParam("open", p.id)} className="ap-property-name">{p.title}</button>
            <span className="ap-property-location"><MapPin size={12} aria-hidden="true" />{[p.location.name, p.location.city].filter(Boolean).join(", ") || "Location not provided"}</span>
          </span>
        </div>
      ),
    },
    { key: "price", header: "Price / purpose", render: (p) => <div className="ap-table-price"><strong>{formatPrice(p)}</strong><span>{statusLabel(p.property.status)} · {formatType(p.property.type)}</span></div> },
    { key: "owner", header: "Agent / owner", render: ownerCell },
    { key: "status", header: "Status", render: listingBadge },
    { key: "added", header: "Activity", render: (p) => <div className="ap-activity"><span><Eye size={13} aria-hidden="true" />{(p.meta?.views || 0).toLocaleString()} views</span><small>{formatDate(p.listing.createdAt)}</small></div> },
    { key: "actions", header: <span className="sr-only">Actions</span>, align: "right", render: (p) => <ActionMenu actions={actionsFor(p)} label={`Actions for ${p.title}`} /> },
  ];

  if (!list.data) return <div className="admin-properties">{list.error ? <ErrorState title="Couldn't load properties" message={list.error} onRetry={list.reload} /> : <TableSkeleton />}</div>;

  return (
    <div className="admin-properties">
      <header className="ap-heading">
        <div><p className="ap-eyebrow"><span />PROPERTY WORKSPACE</p><h1>Your property portfolio<span>.</span></h1><p>Keep every listing in view. Review, publish, and make room for what’s next.</p></div>
        <div className="ap-heading-actions"><Link to={paths.listings} className="ap-public-link">View marketplace<ArrowUpRight size={16} aria-hidden="true" /></Link><Link to={adminPath("/properties/add")} className="btn btn-primary"><Plus size={17} aria-hidden="true" />Add property</Link></div>
      </header>

      <section className="ap-summary" aria-label="Property overview">{summary.map(({ id, label, icon: Icon, note, tone }) => (
        <button key={id} type="button" className={`ap-stat is-${tone}`} aria-pressed={status === id} onClick={() => selectStatus(id)}>
          <span className="ap-stat-top"><span>{label}</span><span className="ap-stat-icon"><Icon size={19} aria-hidden="true" /></span></span>
          <strong>{count(id).toLocaleString()}</strong><span className="ap-stat-note">{note}</span><span className="ap-stat-bar"><span style={{ width: `${count("all") ? count(id) / count("all") * 100 : 0}%` }} /></span>
        </button>
      ))}</section>

      {count("pending") > 0 && <div className="ap-review-notice"><span className="ap-review-icon"><ClipboardCheck size={21} aria-hidden="true" /></span><div><h2>{count("pending")} {count("pending") === 1 ? "listing needs" : "listings need"} your review</h2><p>Check the photos, price, and property details before they go live.</p></div><button type="button" onClick={reviewQueue}>Review listings<ArrowRight size={16} aria-hidden="true" /></button></div>}

      {/* The platform's own listings: the admin team confirms they are still available */}
      <FreshnessNotice listings={list.data.stale} onConfirm={async (id) => { await confirmAvailability(id); list.reload(); }} className="mb-6" />

      <section className="ap-collection" aria-label="Manage properties">
      <div className="ap-collection-heading"><div><h2>Property collection</h2><p>Listings from {siteName} and your agent community.</p></div><div className="ap-view-control"><span>View</span><ViewToggle value={view} onChange={setView} /></div></div>
      <div className="ap-toolbar">
        <FilterTabs
          label="Listing status"
          value={status}
          onChange={selectStatus}
          tabs={[
            { id: "all", label: "All", count: count("all") },
            { id: "pending", label: "Pending Review", count: count("pending") },
            { id: "published", label: "Published", count: count("published") },
            { id: "rejected", label: "Rejected", count: count("rejected") },
            { id: "suspended", label: "Hidden", count: count("suspended") },
            { id: "draft", label: "Drafts", count: count("draft") },
          ]}
        />
        <div className="ap-filter-row">
          <SearchInput value={query} onChange={setQuery} placeholder="Search title, area, type or owner" className="ap-search" />
          <select value={ownerType} onChange={(e) => setOwnerType(e.target.value)} aria-label="Filter by owner type" className="field">
            <option value="all">All owners</option>
            <option value="admin">{siteName}</option>
            <option value="agent">Agents</option>
          </select>
          <select value={purpose} onChange={(event) => setPurpose(event.target.value)} aria-label="Filter by listing purpose" className="field"><option value="all">Rent & sale</option><option value="Rent">For rent</option><option value="Sale">For sale</option></select>
          <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort properties" className="field"><option value="review">Review priority</option><option value="newest">Newest first</option><option value="priceAsc">Price: low to high</option><option value="priceDesc">Price: high to low</option><option value="views">Most viewed</option></select>
        </div>
        <div className="ap-result-bar"><p role="status" aria-live="polite"><strong>{list.data.total}</strong> {list.data.total === 1 ? "property" : "properties"}<span>of {count("all")} in this collection</span></p><div className="ap-filter-chips">
          {ownerId && (
            <button onClick={() => setParam("owner", null)} className="ap-owner-filter">
              Owner: {list.data.ownerName || ownerId}
              <X className="h-4 w-4" />
            </button>
          )}
          {filtered && <button type="button" onClick={resetFilters} className="ap-clear"><RotateCcw size={12} aria-hidden="true" />Clear filters</button>}
        </div></div>
      </div>

      {view === "grid" ? (
        rows.length === 0 ? (
          list.data.empty ? (
            <EmptyState icon={Building2} title="No properties yet" description="Properties added to the platform will appear here." action={<Link to={adminPath("/properties/add")} className="btn btn-primary px-3.5 py-2"><Plus className="h-4 w-4" />Add Property</Link>} />
          ) : (
            <EmptyState icon={Building2} title="No matching properties" description="Try another area, owner, or listing status." action={<button type="button" onClick={resetFilters} className="btn btn-light">Clear filters</button>} />
          )
        ) : (
          <div className="space-y-4"><div className="ap-property-grid">
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
          </div>{list.paging.pages > 1 && <div className="admin-card overflow-hidden"><Pager {...list.paging} /></div>}</div>
        )
      ) : (
      <div className="ap-property-table"><DataTable
        columns={columns}
        rows={rows}
        paging={list.paging}
        minWidth={980}
        onRowClick={(p) => setParam("open", p.id)}
        empty={<EmptyState icon={Building2} title={list.data.empty ? "No properties yet" : "No matching properties"} description={!list.data.empty ? "Try another area, owner, or listing status." : "Add your first property to start your portfolio."} action={filtered ? <button type="button" onClick={resetFilters} className="btn btn-light">Clear filters</button> : <Link to={adminPath("/properties/add")} className="btn btn-primary">Add property</Link>} />}
        mobileCard={(p) => (
          <div className="flex gap-3">
            <img src={cloudImage(p.media.images[0], 96)} alt="" className="h-20 w-24 shrink-0 rounded-xl object-cover" />
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
      /></div>
      )}
      </section>

      {/* View / moderate */}
      <AdminRecordModal
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
            <img src={cloudImage(viewed.media.images[0], 480)} alt="" className="aspect-video w-full rounded-lg bg-gray-100 object-cover" />
            {viewed.media.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {viewed.media.images.slice(1).map((src, i) => <img key={i} src={cloudImage(src, 80)} alt="" className="h-14 w-20 shrink-0 rounded-md object-cover" />)}
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
      </AdminRecordModal>

      {editing && <EditPropertyModal property={editing} onClose={() => setEditing(null)} onSaved={() => { list.reload(); details.reload(); }} />}

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
    </div>
  );
};

export default AdminProperties;
