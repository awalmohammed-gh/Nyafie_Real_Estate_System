import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Building2, ExternalLink, Eye, Inbox, Lock, Pencil, PlusSquare, Search, Settings2, Star, Trash2 } from "lucide-react";
import { useAgent } from "../../hooks/useAgent";
import { useRealEstate } from "../../context/useRealEstate";
import { useTransactions } from "../../context/useTransactions";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import PageTitle from "../../components/agent/PageTitle";
import DataTable from "../../components/ui/DataTable";
import FilterTabs from "../../components/ui/FilterTabs";
import SearchInput from "../../components/ui/SearchInput";
import StatusBadge from "../../components/ui/StatusBadge";
import { hasMapPin } from "../../utils/geo";
import ActionMenu from "../../components/ui/ActionMenu";
import EmptyState from "../../components/ui/EmptyState";
import LockedFeature from "../../components/ui/LockedFeature";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { formatPrice, formatType, getListingStatus, statusLabel } from "../../utils/property";
import { formatDate } from "../../utils/date";
import { lockCopy } from "../../utils/permissions";
import { useViewMode } from "../../hooks/useViewMode";
import PropertyTile from "../../components/dashboard/PropertyTile";
import ViewToggle from "../../components/dashboard/ViewToggle";
import PropertyQuickView from "../../components/agent/PropertyQuickView";
import WorkspaceStats from "../../components/agent/WorkspaceStats";

const tabs = [
  { id: "all", label: "All" },
  { id: "published", label: "Published" },
  { id: "pending", label: "In review" },
  { id: "draft", label: "Drafts" },
  { id: "rejected", label: "Rejected" },
];

const MyProperties = () => {
  const { myProperties, myInquiries, permissions: perms } = useAgent();
  const { deleteListing, isPubliclyVisible } = useRealEstate();
  const { offers, rentals, sales } = useTransactions();
  const run = useAsyncAction();
  const navigate = useNavigate();
  const [tab, setTab] = useState("all");
  const [listingType, setListingType] = useState("all");
  const [propertyType, setPropertyType] = useState("all");
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("latest");
  const [deleting, setDeleting] = useState(null);
  const [view, setView] = useViewMode("agent-properties");
  const inquiryCount = (p) => myInquiries.filter((i) => i.propertyId === p.id).length;

  const search = query.trim().toLowerCase();
  const rows = myProperties
    .filter((p) => tab === "all" || p.listing.state === tab)
    .filter((p) => listingType === "all" || p.property.status === listingType)
    .filter((p) => propertyType === "all" || p.property.type === propertyType)
    .filter((p) => !search || `${p.title} ${p.location.name} ${p.location.city} ${p.property.type}`.toLowerCase().includes(search))
    .sort((a, b) => sort === "views" ? (b.meta?.views || 0) - (a.meta?.views || 0) : sort === "oldest" ? new Date(a.listing.createdAt) - new Date(b.listing.createdAt) : new Date(b.listing.createdAt) - new Date(a.listing.createdAt));
  const count = (id) => myProperties.filter((p) => id === "all" || p.listing.state === id).length;

  // A published listing is only truly live when the agent is in good standing
  const statusOf = (p) => getListingStatus(p, p.listing.state !== "published" || isPubliclyVisible(p));
  const offerCount = (p) => offers.filter((o) => o.property.id === p.id).length;
  const pendingOffers = (p) => offers.filter((o) => o.property.id === p.id && o.status === "Pending").length;
  const limitCopy = lockCopy(perms, "propertyLimit");
  const manage = (p) => navigate(`/agent/properties/${p.id}`);
  const types = [...new Set(myProperties.map((p) => p.property.type))].sort();

  // Quick view (?view=<id>): a side panel instead of leaving the list
  const viewed = myProperties.find((p) => p.id === params.get("view")) || null;
  const setViewed = (p) => {
    const next = new URLSearchParams(params);
    if (p) next.set("view", p.id);
    else next.delete("view");
    setParams(next, { replace: !p });
  };
  const interestFor = (p) => ({
    views: p.meta?.views || 0,
    inquiries: inquiryCount(p),
    offers: offerCount(p),
    requests: rentals.filter((r) => r.property.id === p.id).length + sales.filter((x) => x.property.id === p.id).length,
  });

  const confirmDelete = async () => {
    const property = deleting;
    setDeleting(null);
    const { ok } = await run(deleteListing(property.id), { success: "Property deleted", description: property.title, type: "info" });
    if (ok && viewed?.id === property.id) setViewed(null);
  };

  const actionsFor = (p) => [
    { label: "Quick view", icon: Eye, onClick: () => setViewed(p) },
    { label: "Full details", icon: Settings2, onClick: () => manage(p) },
    { label: perms.canEditProperty ? "Edit details" : "Editing is paused", icon: Pencil, disabled: !perms.canEditProperty, onClick: () => navigate(`/agent/properties/${p.id}/edit`) },
    { label: "Inquiries", icon: Inbox, onClick: () => navigate(`/agent/inquiries?property=${p.id}`) },
    { label: "View public page", icon: ExternalLink, hidden: !isPubliclyVisible(p), onClick: () => navigate(`/house/${p.id}`) },
    { label: "Delete", icon: Trash2, danger: true, disabled: !perms.canDeleteProperty, onClick: () => setDeleting(p) },
  ];

  const statusCell = (p) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <StatusBadge status={statusOf(p)} />
      {p.listing.state === "published" && !["Available", statusOf(p)].includes(p.listing.availability) && <StatusBadge status={p.listing.availability} dot={false} />}
      {!hasMapPin(p) && <span title="Add a map pin in the editor so this listing appears in “near me” search"><StatusBadge status="No map pin" tone="gray" dot={false} /></span>}
      {hasMapPin(p) && p.location.approximate && <span title="Placed automatically from the address. Drag the pin onto the exact building in the editor."><StatusBadge status="Area pin" tone="gray" dot={false} /></span>}
    </div>
  );

  const columns = [
    {
      key: "property",
      header: "Property",
      render: (p) => (
        <div className="flex min-w-0 items-center gap-3">
          <img src={p.media.images[0]} alt="" className="h-10 w-14 shrink-0 rounded-md bg-gray-100 object-cover" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-medium text-gray-900">
              {p.meta?.isFeatured && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Featured" />}
              <span className="truncate">{p.title}</span>
            </p>
            <p className="truncate text-xs text-gray-500">
              {formatType(p.property.type)} · {p.location.name}, {p.location.city}
            </p>
          </div>
        </div>
      ),
    },
    { key: "type", header: "Listing", render: (p) => <span className="whitespace-nowrap text-gray-600">{statusLabel(p.property.status)}</span> },
    { key: "price", header: "Price", render: (p) => <span className="font-medium whitespace-nowrap text-gray-900">{formatPrice(p)}</span> },
    { key: "status", header: "Status", render: statusCell },
    { key: "views", header: "Views", align: "right", render: (p) => <span className="text-gray-600 tabular-nums">{(p.meta?.views || 0).toLocaleString()}</span> },
    {
      key: "offers",
      header: "Offers",
      align: "right",
      render: (p) => (
        <span className="tabular-nums">
          {offerCount(p)}
          {pendingOffers(p) > 0 && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">{pendingOffers(p)} new</span>}
        </span>
      ),
    },
    { key: "added", header: "Added", render: (p) => <span className="whitespace-nowrap text-gray-500">{formatDate(p.listing.createdAt)}</span> },
    { key: "actions", header: <span className="sr-only">Actions</span>, align: "right", render: (p) => <ActionMenu actions={actionsFor(p)} label={`Actions for ${p.title}`} /> },
  ];

  return (
    <>
      <PageTitle
        title="My Properties"
        description="Your listings, how they're performing and what customers are asking about."
        action={
          perms.canCreateDraft ? (
            <Link to="/agent/properties/add" className="btn btn-primary px-3.5 py-2">
              <PlusSquare className="h-4 w-4" />
              Add Property
            </Link>
          ) : (
            <span className="btn btn-light cursor-not-allowed px-3.5 py-2 opacity-60" title={lockCopy(perms).description}>
              <Lock className="h-4 w-4" />
              Add Property
            </span>
          )
        }
      />

      <WorkspaceStats className="mb-6" items={[
        { label: "All properties", value: myProperties.length, note: "Your complete portfolio" },
        { label: "Live on the website", value: myProperties.filter(isPubliclyVisible).length, note: "Visible to customers" },
        { label: "In review", value: count("pending"), note: "Waiting for approval" },
        { label: "Drafts", value: count("draft"), note: "Ready for your next update" },
      ]} />

      {perms.isActive && perms.limitReached && (
        <div className="mb-6">
          <LockedFeature compact title={limitCopy.title} description={`${limitCopy.description} You can still save drafts.`} cta={limitCopy.cta} />
        </div>
      )}

      {myProperties.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No properties yet"
          description="Create your first listing. You can save it as a draft and submit it when you're ready."
          action={perms.canCreateDraft && <Link to="/agent/properties/add" className="btn btn-primary px-3.5 py-2">Add Property</Link>}
        />
      ) : (
        <>
          <div className="workspace-toolbar">
            <div className="workspace-toolbar-top">
            <FilterTabs label="Listing status" value={tab} onChange={setTab} tabs={tabs.map((t) => ({ ...t, count: count(t.id) }))} />
            <div className="flex items-center gap-3"><span className="text-xs text-gray-500" role="status">{rows.length} {rows.length === 1 ? "property" : "properties"}</span><ViewToggle value={view} onChange={setView} /></div>
            </div>
            <div className="workspace-filters">
              <SearchInput value={query} onChange={setQuery} placeholder="Search by title, area or city" />
              <select value={listingType} onChange={(e) => setListingType(e.target.value)} aria-label="Filter by listing type" className="field w-36 py-2">
                <option value="all">Sale & rent</option>
                <option value="Sale">For sale</option>
                <option value="Rent">For rent</option>
              </select>
              {types.length > 1 && (
                <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} aria-label="Filter by property type" className="field w-40 py-2 capitalize">
                  <option value="all">All types</option>
                  {types.map((t) => <option key={t} value={t}>{formatType(t)}</option>)}
                </select>
              )}
              <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort properties" className="field py-2"><option value="latest">Newest first</option><option value="oldest">Oldest first</option><option value="views">Most viewed</option></select>
              {(query || tab !== "all" || listingType !== "all" || propertyType !== "all") && <button type="button" className="btn btn-light text-xs" onClick={() => { setQuery(""); setTab("all"); setListingType("all"); setPropertyType("all"); }}>Reset filters</button>}
            </div>
          </div>

          {view === "grid" ? (
            rows.length === 0 ? (
              <EmptyState icon={Search} title="No matching properties" description="Try a different search or filter." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {rows.map((p, i) => (
                  <PropertyTile
                    key={p.id}
                    index={i}
                    property={p}
                    status={statusOf(p)}
                    metrics={{ views: p.meta?.views || 0, inquiries: inquiryCount(p), offers: offerCount(p) }}
                    actions={actionsFor(p)}
                    onOpen={setViewed}
                  />
                ))}
              </div>
            )
          ) : (
          <DataTable
            tableFrom="xl"
            columns={columns}
            rows={rows}
            minWidth={900}
            onRowClick={setViewed}
            empty={<EmptyState icon={Search} title="No matching properties" description="Try a different search or filter." />}
            mobileCard={(p) => (
              <div className="flex gap-3">
                <button onClick={() => setViewed(p)} className="shrink-0">
                  <img src={p.media.images[0]} alt="" className="h-16 w-20 rounded-md bg-gray-100 object-cover" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <button onClick={() => setViewed(p)} className="min-w-0 text-left">
                      <p className="truncate font-medium text-gray-900">{p.title}</p>
                      <p className="truncate text-xs text-gray-500">
                        {statusLabel(p.property.status)} · {formatPrice(p)}
                      </p>
                    </button>
                    <ActionMenu actions={actionsFor(p)} label={`Actions for ${p.title}`} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    {statusCell(p)}
                    <span className="flex shrink-0 items-center gap-1 text-xs text-gray-500">
                      <Eye className="h-3.5 w-3.5" />
                      {(p.meta?.views || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}
          />
          )}
        </>
      )}

      <PropertyQuickView
        key={viewed?.id || "closed"}
        property={viewed}
        status={viewed && statusOf(viewed)}
        interest={viewed ? interestFor(viewed) : {}}
        perms={perms}
        onClose={() => setViewed(null)}
        onDelete={(p) => setDeleting(p)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete this property?"
        description={deleting && `${deleting.title} will be removed from your listings and the public site. This can't be undone.`}
        confirmLabel="Delete property"
      />
    </>
  );
};

export default MyProperties;
