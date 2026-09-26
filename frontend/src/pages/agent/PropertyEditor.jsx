import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, Bath, Bed, Check, Eye, Loader2, MapPin, Maximize2, Plus, Save, Send } from "lucide-react";
import { useAgent } from "../../hooks/useAgent";
import { useRealEstate } from "../../context/useRealEstate";
import { usePlatform } from "../../context/usePlatform";
import { useToast } from "../../context/useToast";
import ImageUploader from "../../components/agent/ImageUploader";
import LockedFeature from "../../components/ui/LockedFeature";
import { COUNTED_STATES, lockCopy } from "../../utils/permissions";
import PageTitle from "../../components/agent/PageTitle";
import Modal from "../../components/ui/Modal";
import EmptyState from "../../components/ui/EmptyState";
import PageLoader from "../../components/ui/PageLoader";
import { formatPrice, formatType, statusLabel } from "../../utils/property";

const PROPERTY_TYPES = [
  "Apartment", "Bungalow", "Duplex", "Family-Home", "Hotel-Apartment", "Luxury-Villa",
  "Manor", "Modern-Home", "Penthouse", "Single", "Studio", "Townhouse", "Villa",
];

const REGIONS = [
  "Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern", "Greater Accra", "North East",
  "Northern", "Oti", "Savannah", "Upper East", "Upper West", "Volta", "Western", "Western North",
];

const AMENITIES = [
  "Swimming Pool", "Gym", "24/7 Security", "Parking", "Garage", "Garden", "Balcony", "Borehole",
  "Solar Backup", "Air Conditioning", "Fitted Kitchen", "Staff Quarters", "Elevator", "Walled Compound",
];

const toForm = (property, user, contact) => {
  if (!property) {
    return {
      title: "", description: "", type: "", listingType: "Sale", price: "", rentPeriod: "month",
      neighbourhood: "", city: "", region: "Greater Accra", address: "",
      bedrooms: "", bathrooms: "", area: "", amenities: [], availability: "Available",
      contactName: contact?.name ?? user.name, contactPhone: contact?.phone ?? (user.phone || ""), contactEmail: contact?.email ?? user.email,
    };
  }
  const { pricing, location, property: d, agent } = property;
  return {
    title: property.title,
    description: property.description,
    type: d.type,
    listingType: d.status,
    price: String(pricing.amount || pricing.perMonth || pricing.perNight || ""),
    rentPeriod: pricing.perNight ? "night" : "month",
    neighbourhood: location.name,
    city: location.city,
    region: location.region,
    address: location.address,
    bedrooms: String(d.bedrooms ?? ""),
    bathrooms: String(d.bathrooms ?? ""),
    area: String(d.size?.value ?? ""),
    amenities: property.features || [],
    availability: property.listing.availability,
    contactName: agent.name,
    contactPhone: agent.phone,
    contactEmail: agent.email,
  };
};

const Field = ({ label, error, hint, children, className = "" }) => (
  <div className={className}>
    <label className="mb-1.5 block text-sm font-medium text-gray-700">
      {label}
      {children}
    </label>
    {error ? (
      <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
        <AlertCircle className="h-3.5 w-3.5" />
        {error}
      </p>
    ) : (
      hint && <p className="mt-1.5 text-xs text-gray-500">{hint}</p>
    )}
  </div>
);

const Section = ({ title, description, children }) => (
  <section className="rounded-3xl bg-white p-6 ring-1 ring-gray-200 sm:p-8">
    <h2 className="text-lg font-bold text-gray-900">{title}</h2>
    {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
    <div className="mt-6">{children}</div>
  </section>
);

const fieldClass = (error) => `field mt-1.5 ${error ? "border-red-300 focus:border-red-400 focus:ring-red-500/10" : ""}`;

// variant "admin": HomeBase listings. No plan limits or review, the platform image cap,
// the platform contact by default and a Featured option. The backend enforces the same rules.
const adminPermissions = (settings) => ({
  canCreateDraft: true,
  canAddProperty: true,
  requiresApproval: false,
  limitReached: false,
  nearLimit: false,
  imageLimit: settings.property.maxImages,
  plan: { name: "HomeBase" },
});

export const PropertyEditorForm = ({ existing, isEdit, variant = "agent" }) => {
  const agent = useAgent();
  const { settings } = usePlatform();
  const isAdminEditor = variant === "admin";
  const user = agent.user;
  const perms = isAdminEditor ? adminPermissions(settings) : agent.permissions;
  const basePath = isAdminEditor ? "/admin/properties" : "/agent/properties";
  const platformContact = { name: settings.platform.name, phone: settings.platform.phone, email: settings.platform.email };
  const { addListing, updateListing } = useRealEstate();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState(() => toForm(existing, user, isAdminEditor ? platformContact : null));
  const [featured, setFeatured] = useState(Boolean(existing?.meta?.isFeatured));
  const [images, setImages] = useState(() =>
    (existing?.media.images || []).map((src, i) => ({ id: `existing-${i}`, src, name: `Photo ${i + 1}`, status: "done", progress: 100 }))
  );
  const [customAmenity, setCustomAmenity] = useState("");
  const [errors, setErrors] = useState({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(null); // "draft" | "publish"

  if (isEdit && !existing) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Property not found"
        description="This property doesn't exist or doesn't belong to your account."
        action={<Link to={basePath} className="btn btn-primary">Back to properties</Link>}
      />
    );
  }

  // All restrictions come from the centralized permission system
  if (!perms.canCreateDraft) {
    const copy = lockCopy(perms);
    return (
      <LockedFeature
        title={copy.title}
        description={copy.description}
        cta={copy.cta}
        to={user.subscription ? `/agent/checkout?plan=${user.subscription.planId}` : "/agent/plans"}
      />
    );
  }

  const alreadyPublished = existing?.listing.state === "published";
  // Listings already occupying a slot (published / pending) don't need a new one
  const alreadyCounted = existing && COUNTED_STATES.includes(existing.listing.state);
  const publishBlocked = !alreadyCounted && !perms.canAddProperty;
  const blockCopy = lockCopy(perms, perms.limitReached ? "propertyLimit" : "publishing");
  // Agent submissions go to review when approval is required; approved listings stay live when edited
  const needsReview = perms.requiresApproval && !alreadyPublished;
  const publishLabel = needsReview ? "Submit for Review" : isEdit && alreadyPublished ? "Save & Publish" : "Publish Property";

  const set = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };
  const bind = (key) => ({ value: form[key], onChange: (e) => set(key, e.target.value) });

  const toggleAmenity = (amenity) =>
    set("amenities", form.amenities.includes(amenity) ? form.amenities.filter((a) => a !== amenity) : [...form.amenities, amenity]);

  const addCustomAmenity = () => {
    const value = customAmenity.trim();
    if (value && !form.amenities.includes(value)) set("amenities", [...form.amenities, value]);
    setCustomAmenity("");
  };

  const readyImages = images.filter((img) => img.status === "done");
  const uploading = images.some((img) => img.status === "uploading");

  const validate = (mode) => {
    const e = {};
    if (form.title.trim().length < 3) e.title = "Give the property a title (at least 3 characters).";
    if (mode === "publish") {
      if (form.description.trim().length < 30) e.description = "Describe the property in at least 30 characters.";
      if (!form.type) e.type = "Choose a property type.";
      if (!(Number(form.price) > 0)) e.price = "Enter a price greater than 0.";
      if (!form.neighbourhood.trim()) e.neighbourhood = "Enter the neighbourhood.";
      if (!form.city.trim()) e.city = "Enter the city or town.";
      if (!form.address.trim()) e.address = "Enter the street address.";
      if (form.bedrooms === "" || Number(form.bedrooms) < 0) e.bedrooms = "Enter the number of bedrooms.";
      if (form.bathrooms === "" || Number(form.bathrooms) < 0) e.bathrooms = "Enter the number of bathrooms.";
      if (!(Number(form.area) > 0)) e.area = "Enter the floor area.";
      if (readyImages.length === 0) e.images = "Add at least one photo before publishing.";
      else if (readyImages.length > perms.imageLimit) e.images = `Your ${perms.plan?.name} plan allows ${perms.imageLimit} photos per property. Remove ${readyImages.length - perms.imageLimit} to continue.`;
      if (!form.contactPhone.trim()) e.contactPhone = "Add a contact phone number.";
      if (!/^\S+@\S+\.\S+$/.test(form.contactEmail)) e.contactEmail = "Enter a valid email address.";
    }
    return e;
  };

  const buildProperty = (state) => {
    const price = Number(form.price) || 0;
    const pricing =
      form.listingType === "Sale"
        ? { amount: price, currency: "GHS" }
        : form.rentPeriod === "night"
          ? { perNight: price, currency: "GHS" }
          : { perMonth: price, currency: "GHS" };
    return {
      title: form.title.trim(),
      description: form.description.trim(),
      pricing,
      location: { name: form.neighbourhood.trim(), city: form.city.trim(), region: form.region, address: form.address.trim() },
      property: {
        type: form.type || "Apartment",
        status: form.listingType,
        bedrooms: Number(form.bedrooms) || 0,
        bathrooms: Number(form.bathrooms) || 0,
        size: { value: Number(form.area) || 0, unit: "sqm" },
      },
      features: form.amenities,
      media: { images: readyImages.map((img) => img.src) },
      agent: { id: user.id, name: form.contactName.trim() || user.name, phone: form.contactPhone.trim(), email: form.contactEmail.trim() },
      owner: { type: "agent", id: user.id },
      listing: { state, availability: form.availability },
      ...(isAdminEditor ? { meta: { isFeatured: state === "published" && featured } } : {}),
    };
  };

  const save = async (mode) => {
    if (uploading) {
      toast({ type: "warning", title: "Photos are still uploading", description: "Please wait for them to finish." });
      return;
    }
    const found = validate(mode);
    setErrors(found);
    if (Object.keys(found).length) {
      toast({ type: "error", title: "Please fix the highlighted fields" });
      requestAnimationFrame(() => document.querySelector("[aria-invalid='true']")?.focus());
      return;
    }
    if (mode === "publish" && publishBlocked) {
      toast({ type: "warning", title: blockCopy.title, description: blockCopy.description });
      return;
    }

    setSaving(mode);
    const state = mode === "draft" ? "draft" : needsReview ? "pending" : "published";
    const data = buildProperty(state);
    try {
      // New photos are sent as data URIs; the backend uploads them to Cloudinary and
      // re-checks plan limits, ownership and approval rules before saving.
      const { property } = isEdit ? await updateListing(existing.id, data) : await addListing(data);
      const saved = property?.listing?.state || state;
      toast({
        title: saved === "draft" ? "Draft saved" : saved === "pending" ? "Submitted for review" : isEdit ? "Changes published" : "Property published",
        description: saved === "pending" ? "An admin will review your listing before it goes live." : data.title,
      });
      navigate(basePath);
    } catch (err) {
      toast({ type: "error", title: err.message });
      setSaving(null);
    }
  };

  const inputProps = (key) => ({ ...bind(key), "aria-invalid": Boolean(errors[key]), className: fieldClass(errors[key]) });
  const preview = buildProperty(form.availability);

  return (
    <>
      <Link to={basePath} className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" />
        {isAdminEditor ? "Properties" : "My Properties"}
      </Link>
      <PageTitle
        title={isEdit ? "Edit property" : "Add a new property"}
        description={isEdit ? existing.title : isAdminEditor ? "A HomeBase listing. It is published straight away, with no plan limits." : "Fill in the details below. You can save a draft at any time."}
      />

      {existing?.listing.state === "rejected" && existing.listing.rejectionReason && (
        <p className="mb-6 flex items-start gap-3 rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-800 ring-1 ring-red-100">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <span>
            <span className="font-semibold">This listing was rejected by HomeBase:</span> {existing.listing.rejectionReason} Update it and submit again.
          </span>
        </p>
      )}

      {publishBlocked && (
        <div className="mb-6">
          <LockedFeature
            title={blockCopy.title}
            description={`${blockCopy.description} You can still save this property as a draft.`}
            cta={blockCopy.cta}
          />
        </div>
      )}

      {!publishBlocked && perms.nearLimit && !alreadyCounted && (
        <p className="mb-6 flex items-start gap-3 rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-900 ring-1 ring-amber-100">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          You are close to your property limit: {perms.activeCount} of {perms.propertyLimit} used on your {perms.plan?.name} plan.
        </p>
      )}

      {needsReview && !publishBlocked && (
        <p className="mb-6 text-sm text-gray-500">New listings are reviewed by HomeBase before they're published. You'll see the status on My Properties.</p>
      )}

      <form onSubmit={(e) => e.preventDefault()} className="space-y-6 pb-28" noValidate>
        <Section title="Basic information" description="What buyers and renters see first.">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Property title" error={errors.title} className="sm:col-span-2">
              <input {...inputProps("title")} placeholder="e.g. Modern 3-bedroom home in East Legon" maxLength={80} />
            </Field>
            <Field label="Description" error={errors.description} hint={`${form.description.length}/1500 characters`} className="sm:col-span-2">
              <textarea {...inputProps("description")} rows={5} maxLength={1500} placeholder="Describe the layout, finishes, surroundings and what makes it special." className={`${fieldClass(errors.description)} resize-y`} />
            </Field>
            <Field label="Property type" error={errors.type}>
              <select {...inputProps("type")}>
                <option value="">Select a type</option>
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>{formatType(t)}</option>
                ))}
              </select>
            </Field>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-gray-700">Listing type</span>
              <div role="radiogroup" className="mt-1.5 grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
                {["Sale", "Rent"].map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={form.listingType === option}
                    onClick={() => set("listingType", option)}
                    className={`rounded-lg py-2.5 text-sm font-semibold transition ${form.listingType === option ? "bg-white text-brand-700 shadow-sm" : "text-gray-600"}`}
                  >
                    For {option}
                  </button>
                ))}
              </div>
            </div>
            <Field label={form.listingType === "Sale" ? "Price (GHS)" : "Rent (GHS)"} error={errors.price}>
              <input {...inputProps("price")} type="number" min="0" inputMode="numeric" placeholder="0" />
            </Field>
            {form.listingType === "Rent" ? (
              <Field label="Rent period">
                <select {...bind("rentPeriod")} className="field mt-1.5">
                  <option value="month">Per month</option>
                  <option value="night">Per night</option>
                </select>
              </Field>
            ) : (
              <Field label="Property status">
                <select {...bind("availability")} className="field mt-1.5">
                  <option>Available</option>
                  <option>Under Offer</option>
                  <option>Sold</option>
                </select>
              </Field>
            )}
            {form.listingType === "Rent" && (
              <Field label="Property status">
                <select {...bind("availability")} className="field mt-1.5">
                  <option>Available</option>
                  <option>Under Offer</option>
                  <option>Rented</option>
                </select>
              </Field>
            )}
          </div>
        </Section>

        {isAdminEditor && (
          <Section title="Visibility" description="HomeBase listings skip review and plan limits.">
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-gray-50 px-4 py-3">
              <span>
                <span className="block text-sm font-semibold text-gray-900">Featured listing</span>
                <span className="block text-xs text-gray-500">Show this property first in featured spots when published.</span>
              </span>
              <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="h-5 w-5 accent-brand-500" />
            </label>
          </Section>
        )}

        <Section title="Location">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Street address" error={errors.address} className="sm:col-span-2">
              <input {...inputProps("address")} placeholder="e.g. 12 Palm Street" />
            </Field>
            <Field label="Neighbourhood" error={errors.neighbourhood}>
              <input {...inputProps("neighbourhood")} placeholder="e.g. East Legon" />
            </Field>
            <Field label="City / town" error={errors.city}>
              <input {...inputProps("city")} placeholder="e.g. Accra" />
            </Field>
            <Field label="Region">
              <select {...bind("region")} className="field mt-1.5">
                {REGIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Property details">
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            <Field label="Bedrooms" error={errors.bedrooms}>
              <input {...inputProps("bedrooms")} type="number" min="0" inputMode="numeric" placeholder="0" />
            </Field>
            <Field label="Bathrooms" error={errors.bathrooms}>
              <input {...inputProps("bathrooms")} type="number" min="0" step="0.5" inputMode="decimal" placeholder="0" />
            </Field>
            <Field label="Area (sqm)" error={errors.area} className="col-span-2 sm:col-span-1">
              <input {...inputProps("area")} type="number" min="0" inputMode="numeric" placeholder="0" />
            </Field>
          </div>

          <div className="mt-8">
            <p className="text-sm font-medium text-gray-700">Amenities</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[...new Set([...AMENITIES, ...form.amenities])].map((amenity) => {
                const active = form.amenities.includes(amenity);
                return (
                  <button
                    key={amenity}
                    type="button"
                    onClick={() => toggleAmenity(amenity)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition ${
                      active ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {active && <Check className="h-3.5 w-3.5" />}
                    {amenity}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex max-w-sm gap-2">
              <input
                value={customAmenity}
                onChange={(e) => setCustomAmenity(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomAmenity();
                  }
                }}
                placeholder="Add another amenity"
                aria-label="Add another amenity"
                className="field"
              />
              <button type="button" onClick={addCustomAmenity} className="btn btn-light shrink-0 px-4">
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>
          </div>
        </Section>

        <Section title="Photos" description="The first photo is used as the cover image.">
          <ImageUploader images={images} setImages={(v) => { setImages(v); if (errors.images) setErrors((p) => ({ ...p, images: undefined })); }} error={errors.images} max={perms.imageLimit} limitNote={isAdminEditor ? `HomeBase allows up to ${perms.imageLimit} photos per property.` : `${lockCopy(perms, "images").description} Upgrade your plan to add more photos.`} />
        </Section>

        <Section title="Contact information" description="How interested buyers and renters can reach you about this property.">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Field label="Contact name">
              <input {...bind("contactName")} className="field mt-1.5" />
            </Field>
            <Field label="Phone" error={errors.contactPhone}>
              <input {...inputProps("contactPhone")} type="tel" />
            </Field>
            <Field label="Email" error={errors.contactEmail}>
              <input {...inputProps("contactEmail")} type="email" />
            </Field>
          </div>
        </Section>

        {/* Sticky action bar */}
        <div className={`fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/90 backdrop-blur-lg ${isAdminEditor ? "md:left-20 xl:left-72" : "lg:left-64"}`}>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
            <p className="hidden text-sm text-gray-500 md:block">
              {uploading ? "Waiting for photos to finish uploading..." : `${readyImages.length} photo${readyImages.length === 1 ? "" : "s"} ready`}
            </p>
            <div className="grid w-full grid-cols-3 gap-2 md:flex md:w-auto">
              <button type="button" onClick={() => save("draft")} disabled={Boolean(saving)} className="btn btn-light px-3 sm:px-5">
                {saving === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span><span className="hidden sm:inline">Save </span>Draft</span>
              </button>
              <button type="button" onClick={() => setPreviewOpen(true)} className="btn btn-light px-3 sm:px-5">
                <Eye className="h-4 w-4" />
                Preview
              </button>
              <button type="button" onClick={() => save("publish")} disabled={Boolean(saving) || publishBlocked} title={publishBlocked ? blockCopy.title : undefined} className="btn btn-primary px-3 sm:px-5">
                {saving === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span><span className="sm:hidden">{needsReview ? "Submit" : "Publish"}</span><span className="hidden sm:inline">{publishLabel}</span></span>
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Preview */}
      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Listing preview" description="How your listing will look to visitors." size="lg"
        footer={
          <>
            <button onClick={() => setPreviewOpen(false)} className="btn btn-light">Keep editing</button>
            <button onClick={() => { setPreviewOpen(false); save("publish"); }} disabled={publishBlocked} className="btn btn-primary">
              <Send className="h-4 w-4" />
              {publishLabel}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          {preview.media.images[0] ? (
            <img src={preview.media.images[0]} alt="" className="aspect-16/9 w-full rounded-2xl object-cover" />
          ) : (
            <div className="grid aspect-16/9 w-full place-items-center rounded-2xl bg-gray-100 text-sm text-gray-400">No photo yet</div>
          )}
          <div>
            <p className="text-xs font-semibold tracking-wider text-brand-600 uppercase">
              {formatType(preview.property.type)} · {statusLabel(preview.property.status)}
            </p>
            <h3 className="mt-1 text-2xl font-extrabold text-gray-900">{preview.title || "Untitled property"}</h3>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
              <MapPin className="h-4 w-4" />
              {[preview.location.address, preview.location.name, preview.location.city].filter(Boolean).join(", ") || "Location not set"}
            </p>
          </div>
          <p className="text-2xl font-extrabold text-gray-900">{formatPrice(preview)}</p>
          <div className="grid grid-cols-3 gap-3 text-sm">
            {[
              [Bed, `${preview.property.bedrooms} beds`],
              [Bath, `${preview.property.bathrooms} baths`],
              [Maximize2, `${preview.property.size.value} sqm`],
            ].map(([Icon, text]) => (
              <div key={text} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2.5 text-gray-700">
                <Icon className="h-4 w-4 text-brand-500" />
                {text}
              </div>
            ))}
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-line text-gray-600">{preview.description || "No description yet."}</p>
          {preview.features.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {preview.features.map((f) => (
                <span key={f} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">{f}</span>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};

// Waits for the listings of the signed-in agent before mounting the form, so edit
// links opened directly start with the saved values. Only their own listings are found.
const PropertyEditor = () => {
  const { propertyId } = useParams();
  const { myProperties } = useAgent();
  const { listingsReady } = useRealEstate();
  if (propertyId && !listingsReady) return <PageLoader label="Loading property..." />;
  const existing = propertyId ? myProperties.find((p) => p.id === propertyId) : null;
  return <PropertyEditorForm key={propertyId || "new"} existing={existing} isEdit={Boolean(propertyId)} />;
};

export default PropertyEditor;
