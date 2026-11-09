import { lazy, Suspense, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { AlertCircle, ArrowLeft, Bath, Bed, Building2, Check, Eye, ImagePlus, KeyRound, Lightbulb, Loader2, MapPin, Maximize2, Minus, Plus, Save, Send, Tag } from "lucide-react";
import { useAgent } from "../../hooks/useAgent";
import { useRealEstate } from "../../context/useRealEstate";
import { usePlatform } from "../../context/usePlatform";
import { useToast } from "../../context/useToast";
import ImageUploader from "../../components/agent/ImageUploader";
import RoomTypesEditor from "../../components/agent/RoomTypesEditor";
import HotelPaymentSettings from "../../components/agent/HotelPaymentSettings";
import { NIGHTLY_RENTAL_DEFAULTS, STAY_BOOKING_DEFAULTS } from "../../utils/hotelPayments";
import MoveInFields from "../../components/agent/MoveInFields";
import { MOVE_IN_DEFAULTS } from "../../utils/moveIn";
import { roomToForm, roomsToPayload } from "../../utils/hotel";
import LockedFeature from "../../components/ui/LockedFeature";
import { COUNTED_STATES, lockCopy, withinImageLimit } from "../../utils/permissions";
import Modal from "../../components/ui/Modal";
import EmptyState from "../../components/ui/EmptyState";
import PageLoader from "../../components/ui/PageLoader";
import { formatPrice, formatType, getPriceParts, statusLabel } from "../../utils/property";
import ListingEditorGuide from "../../components/agent/ListingEditorGuide";
import { adminPath } from "../../utils/adminEntry";
import { isCoordinate } from "../../utils/geo";
import "./propertyEditor.css";

// Leaflet loads with the editor's map only
const LocationPicker = lazy(() => import("../../components/location/LocationPicker"));

const RENT_PERIOD_LABELS = { month: "Per month", night: "Per night" };

const REGIONS = [
  "Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern", "Greater Accra", "North East",
  "Northern", "Oti", "Savannah", "Upper East", "Upper West", "Volta", "Western", "Western North",
];

const AMENITIES = [
  "Swimming Pool", "Gym", "24/7 Security", "Parking", "Garage", "Garden", "Balcony", "Borehole",
  "Solar Backup", "Air Conditioning", "Fitted Kitchen", "Staff Quarters", "Elevator", "Walled Compound", "Furnished",
];

const toForm = (property, user, contact) => {
  if (!property) {
    return {
      title: "", description: "", type: "", listingType: "Sale", price: "", rentPeriod: "month",
      neighbourhood: "", city: "", region: "Greater Accra", address: "", country: "Ghana", digitalAddress: "", latitude: "", longitude: "",
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
    country: location.country || "Ghana",
    digitalAddress: location.digitalAddress || "",
    latitude: location.latitude ?? "",
    longitude: location.longitude ?? "",
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

const FieldError = ({ children }) => (
  <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
    <AlertCircle className="h-3.5 w-3.5" />
    {children}
  </p>
);

// A numbered chapter of the listing: big numeral, title and why it matters, then the fields
const Chapter = ({ id, number, title, description, children }) => (
  <motion.section id={id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }} className="property-editor-chapter scroll-mt-32">
    <div className="property-editor-chapter-heading mb-4 flex items-baseline gap-4">
      <span className="font-mono text-sm font-semibold text-brand-500 tabular-nums">{number}</span>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-gray-900">{title}</h2>
        {description && <p className="text-sm text-gray-500">{description}</p>}
      </div>
    </div>
    <div className="property-editor-chapter-content sm:pl-10">{children}</div>
  </motion.section>
);

// Segmented choice (rent period, availability)
const Segmented = ({ label, value, onChange, options }) => (
  <div>
    <p className="text-sm font-medium text-gray-700">{label}</p>
    <div role="radiogroup" aria-label={label} className="mt-1.5 inline-flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${value === o.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  </div>
);

// Number with − / + buttons (whole steps) that can also be typed, e.g. 1.5 bathrooms (inputStep)
const Stepper = ({ label, icon: Icon, value, onChange, step = 1, inputStep = step, error }) => {
  const n = Number(value) || 0;
  const change = (delta) => onChange(String(Math.max(0, Math.round((n + delta) * 2) / 2)));
  const id = `stepper-${label.toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium text-gray-700"><Icon className="h-4 w-4 text-gray-400" />{label}</label>
      <div className={`mt-1.5 flex items-center overflow-hidden rounded-xl border bg-white ${error ? "border-red-300" : "border-gray-200"}`}>
        <button type="button" onClick={() => change(-step)} disabled={n <= 0} aria-label={`Fewer ${label.toLowerCase()}`} className="grid h-11 w-11 shrink-0 place-items-center text-gray-500 hover:bg-gray-50 disabled:opacity-30">
          <Minus className="h-4 w-4" />
        </button>
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} type="number" min="0" step={inputStep} inputMode="decimal" placeholder="0" className="min-w-0 flex-1 bg-transparent text-center text-sm font-semibold text-gray-900 tabular-nums outline-none" />
        <button type="button" onClick={() => change(step)} aria-label={`More ${label.toLowerCase()}`} className="grid h-11 w-11 shrink-0 place-items-center text-gray-500 hover:bg-gray-50">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
};

const fieldClass = (error) => `field mt-1.5 ${error ? "border-red-300 focus:border-red-400 focus:ring-red-500/10" : ""}`;

// variant "admin": admin-owned listings. No plan limits or review, the platform image cap,
// the platform contact by default and a Featured option. The backend enforces the same rules.
const adminPermissions = (settings) => ({
  canCreateDraft: true,
  canAddProperty: true,
  requiresApproval: false,
  limitReached: false,
  nearLimit: false,
  imageLimit: settings.property.maxImages,
  plan: { name: settings.general.siteName },
});

export const PropertyEditorForm = ({ existing, isEdit, variant = "agent" }) => {
  const agent = useAgent();
  const { settings, siteName } = usePlatform();
  const isAdminEditor = variant === "admin";
  const user = agent.user;
  const perms = isAdminEditor ? adminPermissions(settings) : agent.permissions;
  const basePath = isAdminEditor ? adminPath("/properties") : "/agent/properties";
  const platformContact = { name: settings.general.siteName, phone: settings.contact.phone, email: settings.contact.email };
  // Options from Admin Settings > Property; a listing keeps a type/period it already has even if it was removed since
  const { propertyTypes, rentPeriods } = settings.property;
  const typeOptions = existing?.property?.type && !propertyTypes.includes(existing.property.type) ? [...propertyTypes, existing.property.type] : propertyTypes;
  const { addListing, updateListing } = useRealEstate();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState(() => {
    const initial = toForm(existing, user, isAdminEditor ? platformContact : null);
    if (!isAdminEditor) Object.assign(initial, { contactName: user.name, contactPhone: user.phone || "", contactEmail: user.email });
    if (!existing && !rentPeriods.includes(initial.rentPeriod)) initial.rentPeriod = rentPeriods[0];
    return initial;
  });
  const periodOptions = rentPeriods.includes(form.rentPeriod) ? rentPeriods : [...rentPeriods, form.rentPeriod];
  const [featured, setFeatured] = useState(Boolean(existing?.meta?.isFeatured));
  const [images, setImages] = useState(() =>
    (existing?.media.images || []).map((src, i) => ({ id: `existing-${i}`, src, name: `Photo ${i + 1}`, status: "done", progress: 100 }))
  );
  const [customAmenity, setCustomAmenity] = useState("");
  const [rooms, setRooms] = useState(() => (existing?.roomTypes || []).map(roomToForm));
  const hotel = form.type.toLowerCase() === "hotel";
  // Hotels and rentals priced per night let guests reserve and pay on arrival (each with its own defaults)
  const nightlyRental = !hotel && form.listingType === "Rent" && form.rentPeriod === "night";
  // Monthly rentals: advance, agent fee and deposit shown to tenants (utils/moveIn.js)
  const monthlyRental = !hotel && form.listingType === "Rent" && form.rentPeriod === "month";
  const [moveIn, setMoveIn] = useState(() => ({ ...MOVE_IN_DEFAULTS, ...existing?.moveIn }));
  const [bookingEdits, setBooking] = useState(() => existing?.stayBooking || {});
  const booking = { ...(hotel ? STAY_BOOKING_DEFAULTS : NIGHTLY_RENTAL_DEFAULTS), ...bookingEdits };
  // The platform's own hotels are paid into the platform account; agent hotels into their payout account
  const platformHotel = existing ? existing.owner.type === "admin" : isAdminEditor;
  const activeRooms = rooms.filter((room) => room.active);
  const hotelPrice = activeRooms.length ? Math.min(...activeRooms.map((room) => Number(room.pricePerNight) || 0)) : 0;
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
        to={user.subscription ? `/agent/subscription/checkout?plan=${user.subscription.planId}` : "/agent/subscription/plans"}
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
    setForm((prev) => ({ ...prev, [key]: value, ...(key === "type" && value.toLowerCase() === "hotel" ? { listingType: "Rent", rentPeriod: "night" } : {}) }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };
  const bind = (key) => ({ value: form[key], onChange: (e) => set(key, e.target.value) });
  // The map pin and the two coordinate boxes edit the same values
  const pin = form.latitude !== "" && form.longitude !== "" && isCoordinate(Number(form.latitude), Number(form.longitude))
    ? { latitude: Number(form.latitude), longitude: Number(form.longitude) } : null;
  const setPin = (value) => {
    set("latitude", value ? value.latitude : "");
    set("longitude", value ? value.longitude : "");
  };

  const toggleAmenity = (amenity) =>
    set("amenities", form.amenities.includes(amenity) ? form.amenities.filter((a) => a !== amenity) : [...form.amenities, amenity]);

  const addCustomAmenity = () => {
    const value = customAmenity.trim();
    if (value && !form.amenities.includes(value)) set("amenities", [...form.amenities, value]);
    setCustomAmenity("");
  };

  const readyImages = images.filter((img) => img.status === "done");
  // Matches the server: photos kept after a downgrade may stay, but no new ones beyond the limit
  const photosOk = withinImageLimit(readyImages, perms.imageLimit, existing?.media.images);
  const uploading = images.some((img) => img.status === "uploading") || rooms.some((room) => room.images.some((img) => img.status === "uploading"));

  const validate = (mode) => {
    const e = {};
    for (const [key, min, max] of [["latitude", -90, 90], ["longitude", -180, 180]]) {
      if (form[key] !== "" && (!Number.isFinite(Number(form[key])) || Number(form[key]) < min || Number(form[key]) > max)) e[key] = `Enter a value between ${min} and ${max}.`;
    }
    if ((form.latitude === "") !== (form.longitude === "")) e.latitude = "Provide both coordinates or leave both empty.";
    if (form.title.trim().length < 3) e.title = "Give the property a title (at least 3 characters).";
    if (monthlyRental && [moveIn.agentFeeValue, moveIn.securityDeposit].some((v) => v !== "" && !(Number(v) >= 0))) e.moveIn = "Amounts can't be negative.";
    if (monthlyRental && moveIn.agentFeeType === "percent" && !(Number(moveIn.agentFeeValue) <= 20)) e.moveIn = "Enter an agent fee between 0% and 20%.";
    if ((hotel || nightlyRental) && !booking.payOnArrival && !booking.payOnline) e.booking = "Choose at least one way for guests to pay.";
    if (mode === "publish") {
      if (form.description.trim().length < 30) e.description = "Describe the property in at least 30 characters.";
      if (!form.type) e.type = "Choose a property type.";
      if (!(hotel ? hotelPrice > 0 : Number(form.price) > 0)) e.price = hotel ? "Add a room type with a price greater than 0." : "Enter a price greater than 0.";
      if (hotel && !activeRooms.length) e.rooms = "Add at least one active room type.";
      if (hotel && activeRooms.some((room) => !room.name.trim() || !room.description.trim() || !room.images.some((img) => img.status === "done"))) e.rooms = "Add a name, description and photo for each active room type.";
      if (!form.neighbourhood.trim()) e.neighbourhood = "Enter the neighbourhood.";
      if (!form.city.trim()) e.city = "Enter the city or town.";
      if (!form.address.trim()) e.address = "Enter the street address.";
      if (!hotel && (form.bedrooms === "" || Number(form.bedrooms) < 0)) e.bedrooms = "Enter the number of bedrooms.";
      if (!hotel && (form.bathrooms === "" || Number(form.bathrooms) < 0)) e.bathrooms = "Enter the number of bathrooms.";
      if (!(Number(form.area) > 0)) e.area = "Enter the floor area.";
      if (readyImages.length === 0) e.images = "Add at least one photo before publishing.";
      else if (!photosOk) e.images = `Your ${perms.plan?.name} plan supports ${perms.imageLimit} photos per property. Remove the new photos, or upgrade your plan to add more.`;
      if (!form.contactPhone.trim()) e.contactPhone = "Add a contact phone number.";
      if (!/^\S+@\S+\.\S+$/.test(form.contactEmail)) e.contactEmail = "Enter a valid email address.";
    }
    return e;
  };

  const buildProperty = (state) => {
    const price = hotel ? hotelPrice : Number(form.price) || 0;
    const pricing =
      hotel ? { perNight: price, currency: "GHS" } : form.listingType === "Sale"
        ? { amount: price, currency: "GHS" }
        : form.rentPeriod === "night"
          ? { perNight: price, currency: "GHS" }
          : { perMonth: price, currency: "GHS" };
    return {
      title: form.title.trim(),
      description: form.description.trim(),
      pricing,
      location: { name: form.neighbourhood.trim(), city: form.city.trim(), region: form.region, address: form.address.trim(), country: form.country.trim(), digitalAddress: form.digitalAddress.trim(), latitude: form.latitude === "" ? null : Number(form.latitude), longitude: form.longitude === "" ? null : Number(form.longitude) },
      property: {
        type: form.type || "Apartment",
        status: hotel ? "Rent" : form.listingType,
        bedrooms: Number(form.bedrooms) || 0,
        bathrooms: Number(form.bathrooms) || 0,
        size: { value: Number(form.area) || 0, unit: "sqm" },
      },
      features: form.amenities,
      ...(hotel ? { roomTypes: roomsToPayload(rooms), stayBooking: booking } : nightlyRental ? { stayBooking: booking } : {}),
      ...(monthlyRental ? { moveIn: { ...moveIn, agentFeeValue: Number(moveIn.agentFeeValue) || 0, securityDeposit: Number(moveIn.securityDeposit) || 0 } } : {}),
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

  // Same rules as publishing, per chapter, for the "ready to publish" checklist
  const checklist = [
    { id: "chapter-basics", label: "Listing and property type", done: Boolean(form.type) },
    { id: "chapter-photos", label: "At least one photo", done: readyImages.length > 0 && photosOk },
    { id: "chapter-story", label: "Title and description", done: form.title.trim().length >= 3 && form.description.trim().length >= 30 },
    { id: hotel ? "chapter-rooms" : "chapter-price", label: hotel ? "Room types and prices" : "Price", done: hotel ? activeRooms.length > 0 && hotelPrice > 0 && activeRooms.every((room) => room.name.trim() && room.description.trim() && room.images.some((img) => img.status === "done")) : Number(form.price) > 0 },
    { id: "chapter-location", label: "Address and area", done: Boolean(form.address.trim() && form.neighbourhood.trim() && form.city.trim()) },
    { id: "chapter-details", label: "Rooms and floor area", done: (hotel || form.bedrooms !== "" && form.bathrooms !== "") && Number(form.area) > 0 },
    { id: "chapter-contact", label: "Contact details", done: Boolean(form.contactPhone.trim()) && /^\S+@\S+\.\S+$/.test(form.contactEmail) },
  ];
  const readyCount = checklist.filter((c) => c.done).length;
  const adminSections = [...checklist.slice(0, 4), { id: "chapter-visibility", done: false, optional: true }, ...checklist.slice(4)];
  const jumpTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  const availabilityOptions = ["Available", "Under Offer", form.listingType === "Sale" ? "Sold" : "Rented"];
  const statusChip = !existing ? "New listing" : { draft: "Draft", pending: "In review", published: "Published", rejected: "Rejected", suspended: "Hidden" }[existing.listing.state] || "Draft";
  const previewPrice = getPriceParts(preview);
  const hasPreviewPrice = hotel ? hotelPrice > 0 : Number(form.price) > 0;
  let chapter = 0;
  const next = () => String(++chapter).padStart(2, "0");

  return (
    <>
      {/* Header */}
      {isAdminEditor ? <div className="ape-heading mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link to={basePath} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition hover:text-brand-600">
            <ArrowLeft className="h-4 w-4" />
            {isAdminEditor ? "Properties" : "My Properties"}
          </Link>
          {isAdminEditor && <p className="ape-eyebrow">YOUR NEXT LISTING STARTS HERE</p>}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">{isAdminEditor ? isEdit ? "Edit property" : "Add a property" : isEdit ? "Edit listing" : "New listing"}</h1>
            <span className="rounded-full bg-gray-900 px-2.5 py-0.5 text-xs font-semibold text-white">{statusChip}</span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {isEdit ? existing.title : isAdminEditor ? "Give your property a great first impression. Save a draft, or publish when every detail is ready." : needsReview ? `Save a draft at any time. When you submit, ${siteName} reviews the listing before it goes live.` : "Save a draft at any time, or publish when every section is ready."}
          </p>
        </div>
        {isAdminEditor && <div className="ape-platform"><span><Building2 size={19} aria-hidden="true" /></span><div><strong>{siteName}</strong><small>Platform listing</small></div></div>}
      </div> : <ListingEditorGuide isEdit={isEdit} status={statusChip} description={isEdit ? existing.title : needsReview ? `Give your property a great first impression. Add the details, then send it to ${siteName} for review.` : "Give your property a great first impression. Add the details, save a draft, and publish when you’re ready."} checklist={checklist} permissions={perms} onJump={jumpTo} onPreview={() => setPreviewOpen(true)} />}

      {existing?.listing.state === "rejected" && existing.listing.rejectionReason && (
        <p className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <span>
            <span className="font-semibold">This listing was rejected by {siteName}:</span> {existing.listing.rejectionReason} Update it and submit again.
          </span>
        </p>
      )}

      {publishBlocked && (
        <div className="mb-6">
          <LockedFeature title={blockCopy.title} description={`${blockCopy.description} You can still save this property as a draft.`} cta={blockCopy.cta} />
        </div>
      )}

      {!publishBlocked && perms.nearLimit && !alreadyCounted && (
        <p className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          You are close to your property limit: {perms.activeCount} of {perms.propertyLimit} used on your {perms.plan?.name} plan.
        </p>
      )}

      {/* Progress on small screens (the checklist sits beside the form on large ones) */}
      {isAdminEditor && <nav className="ape-section-nav" aria-label="Property sections"><div className="ape-section-nav-heading"><p>Build your listing</p><span>{readyCount} of {checklist.length} required sections ready</span></div><ol>{adminSections.map((item, index) => <li key={item.id}><button type="button" onClick={() => jumpTo(item.id)} aria-label={item.optional ? "Visibility (optional)" : undefined} className={item.done ? "is-complete" : item.optional ? "is-optional" : ""}><span>{item.done ? <Check size={12} aria-hidden="true" /> : String(index + 1).padStart(2, "0")}</span>{({ "chapter-basics": "Property", "chapter-photos": "Photos", "chapter-story": "Description", "chapter-price": "Pricing", "chapter-rooms": "Room types", "chapter-visibility": "Visibility", "chapter-location": "Location", "chapter-details": "Details", "chapter-contact": "Contact" })[item.id]}</button></li>)}</ol></nav>}
      {isAdminEditor && <div className="ape-mobile-progress sticky top-14 z-20 -mx-4 mb-6 border-b border-gray-200 bg-gray-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 xl:hidden">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-gray-700">Ready to publish</span>
          <span className="text-gray-500 tabular-nums">{readyCount} of {checklist.length}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(readyCount / checklist.length) * 100}%` }} />
        </div>
      </div>}

      <form onSubmit={(e) => e.preventDefault()} className={`grid gap-8 pb-28 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_24rem] ${isAdminEditor ? "ape-layout" : "agpe-layout"}`} noValidate>
        <div className={`min-w-0 space-y-10 ${isAdminEditor ? "ape-fields" : "agpe-fields"}`}>
          {/* 01 What are you listing */}
          <Chapter id="chapter-basics" number={next()} title={isAdminEditor ? "What are you listing?" : "Property overview"} description={isAdminEditor ? "Customers filter by these first." : "Start with the kind of property and how you want to list it."}>
            <div role="radiogroup" aria-label="Listing type" className="grid grid-cols-2 gap-3">
              {[
                { value: "Sale", title: "For sale", text: isAdminEditor ? "Buyers make offers and pay at the office" : "Find the right buyer", icon: Tag },
                { value: "Rent", title: "For rent", text: isAdminEditor ? "Tenants request dates and pay online" : "Welcome your next tenant", icon: KeyRound },
              ].map((o) => {
                const active = form.listingType === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={hotel && o.value === "Sale"}
                    onClick={() => set("listingType", o.value)}
                    className={`flex flex-col items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors sm:flex-row sm:items-center ${
                      active ? "border-brand-500 bg-brand-50/60" : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${active ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                      <o.icon className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block text-base font-semibold text-gray-900">{o.title}</span>
                      <span className="block text-xs text-gray-500">{o.text}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-6">
              <p className="text-sm font-medium text-gray-700">Property type</p>
              <div role="radiogroup" aria-label="Property type" aria-invalid={Boolean(errors.type)} tabIndex={errors.type ? -1 : undefined} className="mt-2 flex flex-wrap gap-2 outline-none">
                {typeOptions.map((t) => {
                  const active = form.type === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={existing?.roomTypes?.length > 0 && t.toLowerCase() !== "hotel"}
                      onClick={() => set("type", t)}
                      className={`rounded-full px-3.5 py-1.5 text-sm font-medium capitalize transition-colors ${
                        active ? "bg-gray-900 text-white" : `bg-white text-gray-700 ring-1 hover:bg-gray-50 ${errors.type ? "ring-red-300" : "ring-gray-200"}`
                      }`}
                    >
                      {formatType(t)}
                    </button>
                  );
                })}
              </div>
              {errors.type && <FieldError>{errors.type}</FieldError>}
            </div>
          </Chapter>

          {/* 02 Photos */}
          <Chapter id="chapter-photos" number={next()} title="Photos" description="Listings with bright, well-framed photos get more interest. The first photo is the cover.">
            <ImageUploader
              images={images}
              setImages={(v) => {
                setImages(v);
                if (errors.images) setErrors((p) => ({ ...p, images: undefined }));
              }}
              error={errors.images}
              max={perms.imageLimit}
              limitNote={isAdminEditor ? `${siteName} allows up to ${perms.imageLimit} photos per property.` : lockCopy(perms, "images").description}
              limitAction={isAdminEditor || !perms.canUpgrade ? null : { to: perms.upgradePath, label: "View Upgrade Options" }}
            />
          </Chapter>

          {/* 03 The story */}
          <Chapter id="chapter-story" number={next()} title="Title and description" description="A clear title and an honest description answer most questions before they're asked.">
            <div className="space-y-5">
              <Field label="Listing title" error={errors.title} hint={`${form.title.length}/80`}>
                <input {...inputProps("title")} placeholder="e.g. Modern 3-bedroom home in East Legon" maxLength={80} />
              </Field>
              <Field label="Description" error={errors.description} hint={form.description.trim().length < 30 ? `At least 30 characters · ${form.description.length}/1500` : `${form.description.length}/1500`}>
                <textarea {...inputProps("description")} rows={6} maxLength={1500} placeholder="The layout and finishes, what's nearby, parking, water and power, and anything a buyer or tenant should know." className={`${fieldClass(errors.description)} resize-y`} />
              </Field>
            </div>
          </Chapter>

          {/* 04 Price */}
          {hotel ? <Chapter id="chapter-rooms" number={next()} title="Room Types" description="Set a price and inventory for each room type. The hotel's starting price is taken from your active rooms.">
            <RoomTypesEditor rooms={rooms} setRooms={setRooms} imageLimit={perms.imageLimit} />
            {(errors.rooms || errors.price) && <FieldError>{errors.rooms || errors.price}</FieldError>}
          </Chapter> : null}
          {!hotel && <Chapter id="chapter-price" number={next()} title={form.listingType === "Sale" ? "Asking price" : "Rent"} description={form.listingType === "Sale" ? "Buyers can make offers below or above this." : nightlyRental ? "Guests pay this per night, online or on arrival (see How guests pay)." : "Tenants pay this online when their rental is confirmed."}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label htmlFor="price-input" className="text-sm font-medium text-gray-700">{form.listingType === "Sale" ? "Asking price" : "Rental amount"} in Ghana cedi (GHS)</label>
                <div className={`mt-1.5 flex items-center overflow-hidden rounded-xl border bg-white focus-within:ring-4 ${errors.price ? "border-red-300 focus-within:ring-red-500/10" : "border-gray-200 focus-within:border-brand-500 focus-within:ring-brand-500/10"}`}>
                  <span className="pl-4 text-2xl font-semibold text-gray-400">₵</span>
                  <input
                    id="price-input"
                    {...bind("price")}
                    aria-invalid={Boolean(errors.price)}
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="0"
                    className="min-w-0 flex-1 bg-transparent px-2 py-3 text-2xl font-semibold text-gray-900 tabular-nums outline-none"
                  />
                  {form.listingType === "Rent" && <span className="pr-4 text-sm text-gray-500">/{form.rentPeriod}</span>}
                </div>
                {errors.price && <FieldError>{errors.price}</FieldError>}
              </div>
              {form.listingType === "Rent" && (
                <Segmented label="Charged" value={form.rentPeriod} onChange={(v) => set("rentPeriod", v)} options={periodOptions.map((p) => ({ value: p, label: RENT_PERIOD_LABELS[p] }))} />
              )}
            </div>
            {monthlyRental && <MoveInFields value={moveIn} onChange={setMoveIn} rent={Number(form.price) || 0} error={errors.moveIn} />}
            <div className="mt-5">
              <Segmented label="Availability" value={form.availability} onChange={(v) => set("availability", v)} options={availabilityOptions.map((a) => ({ value: a, label: a }))} />
            </div>
          </Chapter>}
          {hotel && <Chapter id="chapter-payments" number={next()} title="How guests pay" description="Offer one or both. Rooms are only confirmed once they're secured for the guest's dates.">
            {isAdminEditor && !platformHotel
              ? <HotelPaymentSettings value={booking} onChange={setBooking} error={errors.booking} platform={false} propertyId={null} ownerConnects />
              : <HotelPaymentSettings value={booking} onChange={setBooking} error={errors.booking} platform={platformHotel} propertyId={existing?.id || null} />}
          </Chapter>}
          {nightlyRental && <Chapter id="chapter-payments" number={next()} title="How guests pay" description="Offer one or both. A reservation is only confirmed once the dates are free.">
            <HotelPaymentSettings stay="rental" value={booking} onChange={setBooking} error={errors.booking} platform={platformHotel} propertyId={null} />
          </Chapter>}

          {isAdminEditor && (
            <Chapter id="chapter-visibility" number={next()} title="Visibility" description="Give a featured property a little more visibility in the marketplace.">
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4">
                <span>
                  <span className="block text-sm font-semibold text-gray-900">Featured listing</span>
                  <span className="block text-xs text-gray-500">Show this property first in featured spots when published.</span>
                </span>
                <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="h-5 w-5 accent-brand-500" />
              </label>
            </Chapter>
          )}

          {/* 05 Location */}
          <Chapter id="chapter-location" number={next()} title={isAdminEditor ? "Where is it?" : "Location"} description="These details appear publicly on the listing. Pin it on the map so people searching nearby can find it.">
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
                  {form.region && !REGIONS.includes(form.region) && <option value={form.region}>{form.region}</option>}
                  {REGIONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Field>
              <Field label="Country"><input {...inputProps("country")} maxLength={100} /></Field>
              <Field label="GhanaPost GPS / digital address (optional)"><input {...inputProps("digitalAddress")} maxLength={30} placeholder="e.g. GA-123-4567" /></Field>
              <div className="sm:col-span-2">
                <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700"><MapPin className="h-4 w-4 text-gray-400" />Map pin <span className="font-normal text-gray-400">· shows the listing in “near me” search</span></p>
                <Suspense fallback={<div className="grid h-80 place-items-center rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-500" role="status">Loading the map…</div>}>
                  <LocationPicker
                    latitude={pin ? pin.latitude : null}
                    longitude={pin ? pin.longitude : null}
                    onChange={setPin}
                    approximate={Boolean(pin && existing?.location.approximate && pin.latitude === existing.location.latitude && pin.longitude === existing.location.longitude)}
                    addressQuery={[form.address, form.neighbourhood, form.city, form.region, form.country].map((part) => part.trim()).filter(Boolean).join(", ")}
                  />
                </Suspense>
              </div>
              <Field label="Latitude (exact, optional)" error={errors.latitude}><input {...inputProps("latitude")} type="number" step="any" min={-90} max={90} /></Field>
              <Field label="Longitude (exact, optional)" error={errors.longitude}><input {...inputProps("longitude")} type="number" step="any" min={-180} max={180} /></Field>
            </div>
          </Chapter>

          {/* 06 Rooms and amenities */}
          <Chapter id="chapter-details" number={next()} title={hotel ? "Hotel amenities and floor area" : "Rooms and amenities"} description={hotel ? "Facilities shared across the hotel. Add everything inside a room to its room type above." : "The facts customers compare between listings."}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {!hotel && <Stepper label="Bedrooms" icon={Bed} value={form.bedrooms} onChange={(v) => set("bedrooms", v)} error={errors.bedrooms} />}
              {!hotel && <Stepper label="Bathrooms" icon={Bath} value={form.bathrooms} onChange={(v) => set("bathrooms", v)} inputStep={0.5} error={errors.bathrooms} />}
              <div>
                <label htmlFor="area-input" className="flex items-center gap-1.5 text-sm font-medium text-gray-700"><Maximize2 className="h-4 w-4 text-gray-400" />Floor area</label>
                <div className={`mt-1.5 flex items-center overflow-hidden rounded-xl border bg-white focus-within:ring-4 ${errors.area ? "border-red-300 focus-within:ring-red-500/10" : "border-gray-200 focus-within:border-brand-500 focus-within:ring-brand-500/10"}`}>
                  <input id="area-input" {...bind("area")} aria-invalid={Boolean(errors.area)} type="number" min="0" inputMode="numeric" placeholder="0" className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm font-semibold text-gray-900 tabular-nums outline-none" />
                  <span className="pr-4 text-sm text-gray-500">sqm</span>
                </div>
                {errors.area && <FieldError>{errors.area}</FieldError>}
              </div>
            </div>

            <div className="mt-6 border-t border-gray-100 pt-6">
              <p className="text-sm font-medium text-gray-700">Amenities <span className="font-normal text-gray-400">· {form.amenities.length} selected</span></p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[...new Set([...(hotel ? ["Swimming Pool", "Restaurant", "Gym", "Parking", "Reception", "24/7 Security", "Elevator", "Garden"] : AMENITIES), ...form.amenities])].map((amenity) => {
                  const active = form.amenities.includes(amenity);
                  return (
                    <button
                      key={amenity}
                      type="button"
                      onClick={() => toggleAmenity(amenity)}
                      aria-pressed={active}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                        active ? "bg-brand-500 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {active ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5 text-gray-400" />}
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
                  placeholder="Something else? e.g. Rooftop terrace"
                  aria-label="Add another amenity"
                  className="field py-2"
                />
                <button type="button" onClick={addCustomAmenity} className="btn btn-light shrink-0 px-4 py-2">
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>
            </div>
          </Chapter>

          {/* 07 Contact */}
          <Chapter id="chapter-contact" number={next()} title={isAdminEditor ? "Who customers contact" : "Contact details"} description={isAdminEditor ? "Shown on the listing so buyers and tenants can reach you." : "Already linked to your agent profile, so customers know who to contact."}>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <Field label="Contact name">
                <input {...bind("contactName")} readOnly={!isAdminEditor} className="field mt-1.5" />
              </Field>
              <Field label="Phone" error={errors.contactPhone}>
                <input {...inputProps("contactPhone")} readOnly={!isAdminEditor} type="tel" />
              </Field>
              <Field label="Email" error={errors.contactEmail}>
                <input {...inputProps("contactEmail")} readOnly={!isAdminEditor} type="email" />
              </Field>
            </div>
            {!isAdminEditor && <Link to="/agent/settings" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-brand-600">Manage your agent profile</Link>}
          </Chapter>
        </div>

        {/* Live listing card + checklist */}
        <aside aria-label="Listing preview and checklist" className={`hidden xl:block ${isAdminEditor ? "ape-sidebar" : "agpe-sidebar"}`}>
          <div className="sticky top-20 space-y-4">
            <div className={`overflow-hidden rounded-xl border border-gray-200 bg-white ${isAdminEditor ? "" : "agpe-preview-card"}`}>
              <p className="flex items-center gap-1.5 border-b border-gray-100 px-4 py-2.5 text-xs font-medium text-gray-500">
                <Eye className="h-3.5 w-3.5" />
                How customers will see it
              </p>
              <div className="relative aspect-4/3 bg-gray-100">
                {preview.media.images[0] ? (
                  <img src={preview.media.images[0]} alt="" className="h-full w-full object-cover" />
                ) : (
                  <button type="button" onClick={() => jumpTo("chapter-photos")} className="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-400 hover:text-brand-600">
                    <ImagePlus className="h-7 w-7" />
                    <span className="text-xs font-medium">Add a cover photo</span>
                  </button>
                )}
                <span className="absolute top-3 left-3 rounded-md bg-gray-950/75 px-2 py-0.5 text-[11px] font-semibold text-white uppercase">{statusLabel(preview.property.status)}</span>
                <span className="absolute top-3 right-3 rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-gray-800">{form.availability}</span>
              </div>
              <div className="p-4">
                <p className="text-xl font-semibold tracking-tight text-gray-900 tabular-nums">
                  {hasPreviewPrice ? previewPrice.value : "₵ —"}
                  {hasPreviewPrice && <span className="text-sm font-medium text-gray-500">{previewPrice.period}</span>}
                </p>
                <p className={`mt-0.5 truncate text-sm font-semibold ${form.title.trim() ? "text-gray-900" : "text-gray-400"}`}>{form.title.trim() || "Your listing title"}</p>
                <p className="mt-1 flex items-center gap-1 truncate text-xs text-gray-500">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {[form.neighbourhood.trim(), form.city.trim()].filter(Boolean).join(", ") || "Neighbourhood, city"}
                  {form.type && <span className="capitalize"> · {formatType(form.type)}</span>}
                </p>
                <div className="mt-3 flex gap-3 border-t border-gray-100 pt-3 text-xs text-gray-600">
                  <span className="flex items-center gap-1"><Bed className="h-3.5 w-3.5 text-gray-400" />{form.bedrooms || 0} {Number(form.bedrooms) === 1 ? "bed" : "beds"}</span>
                  <span className="flex items-center gap-1"><Bath className="h-3.5 w-3.5 text-gray-400" />{form.bathrooms || 0} {Number(form.bathrooms) === 1 ? "bath" : "baths"}</span>
                  <span className="flex items-center gap-1"><Maximize2 className="h-3.5 w-3.5 text-gray-400" />{form.area || 0} sqm</span>
                </div>
              </div>
            </div>

            <div className={`rounded-xl border border-gray-200 bg-white p-4 ${isAdminEditor ? "" : "agpe-checklist"}`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">{isAdminEditor ? "Listing checklist" : "Ready to publish"}</p>
                <p className="text-xs text-gray-500 tabular-nums">{readyCount} of {checklist.length}</p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(readyCount / checklist.length) * 100}%` }} />
              </div>
              <ul className="mt-3 space-y-0.5">
                {checklist.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => jumpTo(c.id)} className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left text-sm transition-colors hover:bg-gray-50">
                      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${c.done ? "bg-emerald-500 text-white" : "border border-gray-300"}`}>
                        {c.done && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      <span className={c.done ? "text-gray-500 line-through decoration-gray-300" : "text-gray-800"}>{c.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {!isAdminEditor && (
                <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">
                  {perms.plan?.name} plan · {readyImages.length}/{perms.imageLimit} photos
                  {!alreadyCounted && ` · ${perms.remainingListings} ${perms.remainingListings === 1 ? "slot" : "slots"} left`}
                </p>
              )}
            </div>
            {!isAdminEditor && <div className="agpe-tip"><Lightbulb size={18} aria-hidden="true" /><div><h3>A great first impression</h3><p>Use a bright, clear cover photo and describe what makes this property special. Preview your listing before you submit.</p></div></div>}
          </div>
        </aside>

        {/* Sticky action bar */}
        <div className={`fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur lg:left-(--sidebar-width) ${isAdminEditor ? "ape-actions" : "agpe-actions"}`}>
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
            <p className="hidden text-sm text-gray-500 md:block">
              {uploading ? "Waiting for photos to finish uploading..." : readyCount === checklist.length ? "Everything's ready." : `${checklist.length - readyCount} ${checklist.length - readyCount === 1 ? "section" : "sections"} left before you can ${needsReview ? "submit" : "publish"}. Drafts can be saved anytime.`}
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
            <img src={preview.media.images[0]} alt="" className="aspect-video w-full rounded-lg object-cover" />
          ) : (
            <div className="grid aspect-video w-full place-items-center rounded-lg bg-gray-100 text-sm text-gray-400">No photo yet</div>
          )}
          <div>
            <p className="text-xs font-semibold tracking-wider text-brand-600 uppercase">
              {formatType(preview.property.type)} · {statusLabel(preview.property.status)}
            </p>
            <h3 className="mt-1 text-2xl font-semibold text-gray-900">{preview.title || "Untitled property"}</h3>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
              <MapPin className="h-4 w-4" />
              {[preview.location.address, preview.location.name, preview.location.city].filter(Boolean).join(", ") || "Location not set"}
            </p>
          </div>
          <p className="text-2xl font-semibold text-gray-900">{formatPrice(preview)}</p>
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
  return <div className="agent-property-editor"><PropertyEditorForm key={propertyId || "new"} existing={existing} isEdit={Boolean(propertyId)} /></div>;
};

export default PropertyEditor;
