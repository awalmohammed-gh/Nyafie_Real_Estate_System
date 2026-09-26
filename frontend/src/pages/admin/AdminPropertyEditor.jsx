import { Link, useParams } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { useRealEstate } from "../../context/useRealEstate";
import { PropertyEditorForm } from "../agent/PropertyEditor";
import EmptyState from "../../components/ui/EmptyState";
import PageLoader from "../../components/ui/PageLoader";

// Add / edit HomeBase (admin-owned) listings with the shared property form.
// Agent listings are moderated from the Properties page instead.
const AdminPropertyEditor = () => {
  const { propertyId } = useParams();
  const { listings, listingsReady } = useRealEstate();
  if (propertyId && !listingsReady) return <PageLoader label="Loading property..." />;

  const existing = propertyId ? listings.find((p) => p.id === propertyId) : null;
  if (propertyId && existing?.owner.type !== "admin") {
    return (
      <EmptyState
        icon={AlertCircle}
        title="This isn't a HomeBase listing"
        description="Only HomeBase listings are edited here. Agent listings are moderated from the Properties page."
        action={<Link to="/admin/properties" className="btn btn-primary">Back to properties</Link>}
      />
    );
  }
  return <PropertyEditorForm key={propertyId || "new"} existing={existing} isEdit={Boolean(propertyId)} variant="admin" />;
};

export default AdminPropertyEditor;
