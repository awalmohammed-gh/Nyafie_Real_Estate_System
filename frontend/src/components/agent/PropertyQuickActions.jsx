import { Lock, Star } from "lucide-react";
import { useRealEstate } from "../../context/useRealEstate";
import { useToast } from "../../context/useToast";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import LockedFeature from "../ui/LockedFeature";
import { lockCopy } from "../../utils/permissions";

// Availability, visibility and featured controls for one of the agent's listings.
// Every action is checked against the plan permissions (and again by the backend).
const PropertyQuickActions = ({ property, perms }) => {
  const { updateListing, setListingState, setFeatured } = useRealEstate();
  const { toast } = useToast();
  const run = useAsyncAction();
  const limitCopy = lockCopy(perms, "propertyLimit");
  const featuredCopy = lockCopy(perms, "featured");
  const state = property.listing.state;

  if (!perms.isActive) {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-500">
        <Lock className="h-4 w-4 shrink-0" />
        {lockCopy(perms).description}
      </p>
    );
  }

  const setAvailability = (availability) =>
    run(updateListing(property.id, { listing: { availability } }), { success: "Status updated", description: `${property.title} is now marked ${availability}.` });

  const submitDraft = () => {
    if (!perms.canAddProperty) {
      toast({ type: "warning", title: limitCopy.title, description: limitCopy.description });
      return;
    }
    // The backend decides pending vs published and re-checks the plan limit
    run(setListingState(property.id, "pending"), { success: perms.requiresApproval ? "Submitted for review" : "Property published", description: property.title });
  };

  const toggleFeatured = () => {
    const featuring = !property.meta?.isFeatured;
    if (featuring && !perms.canFeatureProperty) {
      toast({ type: "warning", title: featuredCopy.title, description: featuredCopy.description });
      return;
    }
    run(setFeatured(property.id, featuring), { success: featuring ? "Property featured" : "Removed from featured", description: property.title });
  };

  return (
    <div className="space-y-4">
      {state === "published" && (
        <label className="block text-sm">
          <span className="mb-1.5 block text-xs font-medium text-gray-500">Availability</span>
          <select value={property.listing.availability} onChange={(e) => setAvailability(e.target.value)} className="field py-2">
            <option>Available</option>
            <option>Under Offer</option>
            <option>{property.property.status === "Sale" ? "Sold" : "Rented"}</option>
          </select>
        </label>
      )}

      <div className="text-sm">
        <span className="mb-1.5 block text-xs font-medium text-gray-500">Visibility</span>
        {state === "draft" && (
          <>
            <button onClick={submitDraft} disabled={!perms.canAddProperty} title={!perms.canAddProperty ? limitCopy.description : undefined} className="btn btn-primary w-full px-3.5 py-2">
              {perms.requiresApproval ? "Submit for review" : "Publish now"}
            </button>
            {!perms.canAddProperty && <p className="mt-1.5 text-xs text-amber-700">{limitCopy.description}</p>}
          </>
        )}
        {state === "published" && (
          <button onClick={() => run(setListingState(property.id, "draft"), { success: "Moved to drafts", description: property.title })} className="btn btn-light w-full px-3.5 py-2">
            Move to drafts
          </button>
        )}
        {state === "pending" && (
          <button onClick={() => run(setListingState(property.id, "draft"), { success: "Submission withdrawn", description: property.title })} className="btn btn-light w-full px-3.5 py-2">
            Withdraw submission
          </button>
        )}
        {["rejected", "suspended"].includes(state) && <p className="rounded-md bg-gray-50 px-3 py-2 text-gray-500">Edit and resubmit to change visibility.</p>}
      </div>

      {state === "published" &&
        (perms.canUseFeatured ? (
          <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <span className="text-sm">
              <span className="block font-medium text-gray-900">Featured listing</span>
              <span className="text-xs text-gray-500">
                {perms.featuredCount} of {perms.featuredLimit} slots used
              </span>
            </span>
            <button
              onClick={toggleFeatured}
              disabled={!property.meta?.isFeatured && !perms.canFeatureProperty}
              className={`btn px-3 py-1.5 ${property.meta?.isFeatured ? "btn-light" : "btn-primary"}`}
            >
              <Star className="h-4 w-4" />
              {property.meta?.isFeatured ? "Unfeature" : "Feature"}
            </button>
          </div>
        ) : (
          <LockedFeature compact title={featuredCopy.title} description={featuredCopy.description} cta={featuredCopy.cta} />
        ))}
    </div>
  );
};

export default PropertyQuickActions;
