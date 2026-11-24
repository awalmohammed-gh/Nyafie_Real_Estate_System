import { Link, useParams } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { useApiQuery } from "../../hooks/useApiQuery";
import { adminApi } from "../../frontApi";
import { ErrorState } from "../../components/dashboard/States";
import { PropertyEditorForm } from "../agent/PropertyEditor";
import EmptyState from "../../components/ui/EmptyState";
import PageLoader from "../../components/ui/PageLoader";
import { usePlatform } from "../../context/usePlatform";
import { adminPath } from "../../utils/adminEntry";
import "./adminPropertyEditor.css";

// Add / edit NyaFie (admin-owned) listings with the shared property form.
// Agent listings are moderated from the Properties page instead.
const AdminPropertyEditor = () => {
  const { siteName } = usePlatform();
  const { propertyId } = useParams();
  // Loaded once: a refresh would replace what is being typed
  const query = useApiQuery(propertyId ? `admin-property:${propertyId}` : null, () => adminApi.getAdminProperty(propertyId));
  if (propertyId && query.loading) return <PageLoader label="Loading property..." />;
  if (propertyId && query.error) return <ErrorState title="Couldn't load this property" message={query.error} onRetry={query.reload} />;

  const existing = propertyId ? query.data : null;
  if (propertyId && existing?.owner.type !== "admin") {
    return (
      <EmptyState
        icon={AlertCircle}
        title={`This isn't a ${siteName} listing`}
        description={`Only ${siteName} listings are edited here. Agent listings are moderated from the Properties page.`}
        action={<Link to={adminPath("/properties")} className="btn btn-primary">Back to properties</Link>}
      />
    );
  }
  return <div className="admin-property-editor"><PropertyEditorForm key={propertyId || "new"} existing={existing} isEdit={Boolean(propertyId)} variant="admin" /></div>;
};

export default AdminPropertyEditor;
