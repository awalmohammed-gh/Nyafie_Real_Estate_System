import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, Bath, Bed, Building2, ExternalLink, Eye, Lock, MapPin, Maximize2, Pencil, PlusSquare, Search, Star, Trash2 } from "lucide-react";
import { useAgent } from "../../hooks/useAgent";
import { useRealEstate } from "../../context/useRealEstate";
import { useToast } from "../../context/useToast";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import PageTitle from "../../components/agent/PageTitle";
import StatusBadge from "../../components/ui/StatusBadge";
import EmptyState from "../../components/ui/EmptyState";
import LockedFeature from "../../components/ui/LockedFeature";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { formatPrice, formatType, getListingStatus, statusLabel } from "../../utils/property";
import { formatDate } from "../../utils/date";
import { lockCopy } from "../../utils/permissions";

const tabs = [
  { id: "all", label: "All" },
  { id: "published", label: "Published" },
  { id: "pending", label: "Pending Review" },
  { id: "draft", label: "Drafts" },
  { id: "rejected", label: "Rejected" },
];

const IconButton = ({ label, onClick, disabled, danger, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className={`grid h-9 w-9 place-items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${
      danger ? "text-gray-500 hover:bg-red-50 hover:text-red-600" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
    }`}
  >
    {children}
  </button>
);

const MyProperties = () => {
  const { myProperties, permissions: perms } = useAgent();
  const { updateListing, deleteListing, setListingState, setFeatured, isPubliclyVisible } = useRealEstate();
  const { toast } = useToast();
  const run = useAsyncAction();
  const navigate = useNavigate();
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const search = query.trim().toLowerCase();
  const visible = myProperties
    .filter((p) => tab === "all" || p.listing.state === tab)
    .filter((p) => !search || `${p.title} ${p.location.name} ${p.property.type}`.toLowerCase().includes(search))
    .sort((a, b) => new Date(b.listing.createdAt) - new Date(a.listing.createdAt));
  const count = (id) => myProperties.filter((p) => id === "all" || p.listing.state === id).length;

  const viewed = viewing && myProperties.find((p) => p.id === viewing);
  // A published listing is only truly live when the agent is in good standing
  const statusOf = (p) => getListingStatus(p, p.listing.state !== "published" || isPubliclyVisible(p));
  const limitCopy = lockCopy(perms, "propertyLimit");
  const featuredCopy = lockCopy(perms, "featured");

  const handleAvailability = (property, availability) => {
    run(updateListing(property.id, { listing: { availability } }), { success: "Status updated", description: `${property.title} is now marked ${availability}.` });
  };

  const submitDraft = (property) => {
    if (!perms.canAddProperty) {
      toast({ type: "warning", title: limitCopy.title, description: limitCopy.description });
      return;
    }
    // The backend decides pending vs published and re-checks the plan limit
    run(setListingState(property.id, "pending"), { success: perms.requiresApproval ? "Submitted for review" : "Property published", description: property.title });
  };

  const toggleFeatured = (property) => {
    const featuring = !property.meta?.isFeatured;
    if (featuring && !perms.canFeatureProperty) {
      toast({ type: "warning", title: featuredCopy.title, description: featuredCopy.description });
      return;
    }
    run(setFeatured(property.id, featuring), { success: featuring ? "Property featured" : "Removed from featured", description: property.title });
  };

  const confirmDelete = async () => {
    const property = deleting;
    setDeleting(null);
    const { ok } = await run(deleteListing(property.id), { success: "Property deleted", description: property.title, type: "info" });
    if (ok && viewing === property.id) setViewing(null);
  };

  const actions = (property) => (
    <div className="flex items-center justify-end gap-1">
      <IconButton label="View details" onClick={() => setViewing(property.id)}>
        <Eye className="h-4.5 w-4.5" />
      </IconButton>
      <IconButton label={perms.canEditProperty ? "Edit" : "Editing is paused"} disabled={!perms.canEditProperty} onClick={() => navigate(`/agent/properties/${property.id}/edit`)}>
        <Pencil className="h-4.5 w-4.5" />
      </IconButton>
      <IconButton label="Delete" danger disabled={!perms.canDeleteProperty} onClick={() => setDeleting(property)}>
        <Trash2 className="h-4.5 w-4.5" />
      </IconButton>
    </div>
  );

  const nameCell = (property) => (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 truncate font-semibold text-gray-900">
        {property.meta?.isFeatured && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Featured" />}
        {property.title}
      </p>
      <p className="truncate text-xs text-gray-500">{formatType(property.property.type)} · {property.location.name}, {property.location.city}</p>
    </div>
  );

  return (
    <>
      <PageTitle
        title="My Properties"
        description="Only properties you have listed appear here."
        action={
          perms.canCreateDraft ? (
            <Link to="/agent/properties/add" className="btn btn-primary">
              <PlusSquare className="h-4 w-4" />
              Add Property
            </Link>
          ) : (
            <span className="btn btn-light cursor-not-allowed opacity-60" title={lockCopy(perms).description}>
              <Lock className="h-4 w-4" />
              Add Property
            </span>
          )
        }
      />

      {perms.isActive && perms.limitReached && (
        <div className="mb-6">
          <LockedFeature compact title={limitCopy.title} description={`${limitCopy.description} You can still save drafts.`} cta={limitCopy.cta} />
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
          <div role="tablist" className="flex w-max gap-1 rounded-full bg-white p-1 ring-1 ring-gray-200">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition ${tab === t.id ? "bg-brand-500 text-white" : "text-gray-600 hover:text-gray-900"}`}
              >
                {t.label} <span className={tab === t.id ? "text-brand-100" : "text-gray-400"}>{count(t.id)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="relative lg:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your properties" aria-label="Search your properties" className="field rounded-full pl-10" />
        </div>
      </div>

      {myProperties.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="You haven't listed any properties yet"
          description="Create your first listing. You can save it as a draft and submit it when you're ready."
          action={perms.canCreateDraft && <Link to="/agent/properties/add" className="btn btn-primary">Add your first property</Link>}
        />
      ) : visible.length === 0 ? (
        <EmptyState icon={Search} title="No matching properties" description="Try a different search or tab." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-3xl bg-white ring-1 ring-gray-200 lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50/70 text-xs font-semibold tracking-wider text-gray-500 uppercase">
                <tr>
                  <th className="px-5 py-3.5">Property</th>
                  <th className="px-3 py-3.5">Price</th>
                  <th className="px-3 py-3.5">Status</th>
                  <th className="px-3 py-3.5 text-right">Views</th>
                  <th className="px-3 py-3.5">Added</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <AnimatePresence initial={false}>
                  {visible.map((property) => (
                    <motion.tr key={property.id} layout exit={{ opacity: 0 }} className="transition-colors hover:bg-gray-50/60">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <img src={property.media.images[0]} alt="" className="h-12 w-16 shrink-0 rounded-xl bg-gray-100 object-cover" />
                          {nameCell(property)}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-semibold whitespace-nowrap text-gray-900">{formatPrice(property)}</td>
                      <td className="px-3 py-3"><StatusBadge status={statusOf(property)} /></td>
                      <td className="px-3 py-3 text-right text-gray-600">{(property.meta?.views || 0).toLocaleString()}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-gray-600">{formatDate(property.listing.createdAt)}</td>
                      <td className="px-5 py-3">{actions(property)}</td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {/* Mobile / tablet cards */}
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:hidden">
            <AnimatePresence initial={false}>
              {visible.map((property) => (
                <motion.li key={property.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} className="overflow-hidden rounded-3xl bg-white ring-1 ring-gray-200">
                  <div className="relative">
                    <img src={property.media.images[0]} alt="" className="aspect-16/9 w-full bg-gray-100 object-cover" />
                    <StatusBadge status={statusOf(property)} className="absolute top-3 left-3 bg-white" />
                  </div>
                  <div className="p-4">
                    {nameCell(property)}
                    <div className="mt-3 flex items-center justify-between">
                      <p className="font-extrabold text-brand-600">{formatPrice(property)}</p>
                      <p className="flex items-center gap-1 text-xs text-gray-500">
                        <Eye className="h-3.5 w-3.5" />
                        {(property.meta?.views || 0).toLocaleString()} · {formatDate(property.listing.createdAt)}
                      </p>
                    </div>
                    <div className="mt-3 border-t border-gray-100 pt-2">{actions(property)}</div>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </>
      )}

      {/* Details / quick actions */}
      <Modal
        open={Boolean(viewed)}
        onClose={() => setViewing(null)}
        title={viewed?.title}
        description={viewed && `${formatType(viewed.property.type)} · ${statusLabel(viewed.property.status)}`}
        size="lg"
        footer={
          viewed && (
            <>
              <button onClick={() => setDeleting(viewed)} disabled={!perms.canDeleteProperty} className="btn btn-light text-red-600">
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
              {isPubliclyVisible(viewed) && (
                <Link to={`/house/${viewed.id}`} className="btn btn-light">
                  <ExternalLink className="h-4 w-4" />
                  Public page
                </Link>
              )}
              <button onClick={() => navigate(`/agent/properties/${viewed.id}/edit`)} disabled={!perms.canEditProperty} className="btn btn-primary">
                <Pencil className="h-4 w-4" />
                {viewed.listing.state === "rejected" ? "Edit & resubmit" : "Edit property"}
              </button>
            </>
          )
        }
      >
        {viewed && (
          <div className="space-y-5">
            {viewed.listing.state === "pending" && (
              <p className="flex items-start gap-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                Pending Review: HomeBase is checking this listing. It isn't visible to the public yet.
              </p>
            )}
            {viewed.listing.state === "rejected" && (
              <p className="flex items-start gap-2 rounded-2xl bg-red-50 p-4 text-sm text-red-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <span><span className="font-semibold">Rejected:</span> {viewed.listing.rejectionReason || "Please review the listing details and resubmit."}</span>
              </p>
            )}
            {viewed.listing.state === "suspended" && (
              <p className="flex items-start gap-2 rounded-2xl bg-red-50 p-4 text-sm text-red-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                This listing has been hidden by HomeBase. Contact support for details.
              </p>
            )}
            <img src={viewed.media.images[0]} alt="" className="aspect-16/9 w-full rounded-2xl bg-gray-100 object-cover" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-2xl font-extrabold text-gray-900">{formatPrice(viewed)}</p>
              <div className="flex gap-2">
                <StatusBadge status={statusOf(viewed)} />
                {viewed.meta?.isFeatured && <StatusBadge status="Featured" dot={false} />}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              {[
                [Bed, `${viewed.property.bedrooms} beds`],
                [Bath, `${viewed.property.bathrooms} baths`],
                [Maximize2, `${viewed.property.size?.value} ${viewed.property.size?.unit}`],
              ].map(([Icon, text]) => (
                <div key={text} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2.5 text-gray-700">
                  <Icon className="h-4 w-4 shrink-0 text-brand-500" />
                  {text}
                </div>
              ))}
            </div>
            <p className="flex items-start gap-2 text-sm text-gray-600">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              {viewed.location.address}, {viewed.location.name}, {viewed.location.city}, {viewed.location.region}
            </p>

            {/* Quick actions, each checked against the permission system */}
            <div className="space-y-4 rounded-2xl bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-900">Quick actions</p>
              {!perms.isActive ? (
                <p className="flex items-center gap-2 text-sm text-gray-500">
                  <Lock className="h-4 w-4" />
                  {lockCopy(perms).description}
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {viewed.listing.state === "published" && (
                      <label className="text-sm">
                        <span className="mb-1.5 block text-gray-500">Availability</span>
                        <select value={viewed.listing.availability} onChange={(e) => handleAvailability(viewed, e.target.value)} className="field bg-white">
                          <option>Available</option>
                          <option>Under Offer</option>
                          <option>{viewed.property.status === "Sale" ? "Sold" : "Rented"}</option>
                        </select>
                      </label>
                    )}
                    <div className="text-sm">
                      <span className="mb-1.5 block text-gray-500">Visibility</span>
                      {viewed.listing.state === "draft" && (
                        <button onClick={() => submitDraft(viewed)} disabled={!perms.canAddProperty} title={!perms.canAddProperty ? limitCopy.description : undefined} className="btn btn-light w-full bg-white">
                          {perms.requiresApproval ? "Submit for review" : "Publish now"}
                        </button>
                      )}
                      {viewed.listing.state === "published" && (
                        <button onClick={() => run(setListingState(viewed.id, "draft"), { success: "Moved to drafts", description: viewed.title })} className="btn btn-light w-full bg-white">
                          Move to drafts
                        </button>
                      )}
                      {viewed.listing.state === "pending" && (
                        <button onClick={() => run(setListingState(viewed.id, "draft"), { success: "Submission withdrawn", description: viewed.title })} className="btn btn-light w-full bg-white">
                          Withdraw submission
                        </button>
                      )}
                      {["rejected", "suspended"].includes(viewed.listing.state) && (
                        <p className="rounded-xl bg-white px-3 py-2.5 text-gray-500 ring-1 ring-gray-200">Edit and resubmit to change visibility.</p>
                      )}
                    </div>
                  </div>
                  {viewed.listing.state === "draft" && !perms.canAddProperty && (
                    <p className="text-xs text-amber-700">{limitCopy.description}</p>
                  )}

                  {/* Featured listing (plan-limited) */}
                  {viewed.listing.state === "published" &&
                    (perms.canUseFeatured ? (
                      <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-gray-200">
                        <span className="text-sm">
                          <span className="block font-semibold text-gray-900">Featured listing</span>
                          <span className="text-xs text-gray-500">{perms.featuredCount} of {perms.featuredLimit} featured slots used</span>
                        </span>
                        <button
                          onClick={() => toggleFeatured(viewed)}
                          disabled={!viewed.meta?.isFeatured && !perms.canFeatureProperty}
                          className={`btn px-4 py-2 ${viewed.meta?.isFeatured ? "btn-light" : "btn-primary"}`}
                        >
                          <Star className="h-4 w-4" />
                          {viewed.meta?.isFeatured ? "Unfeature" : "Feature"}
                        </button>
                      </div>
                    ) : (
                      <LockedFeature compact title={featuredCopy.title} description={featuredCopy.description} cta={featuredCopy.cta} />
                    ))}
                </>
              )}
            </div>
            <p className="text-xs text-gray-400">
              Added {formatDate(viewed.listing.createdAt)} · Last updated {formatDate(viewed.listing.updatedAt)} · {(viewed.meta?.views || 0).toLocaleString()} views
            </p>
          </div>
        )}
      </Modal>

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
