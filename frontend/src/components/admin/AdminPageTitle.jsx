import { PageHeader } from "../dashboard/Page";

// Admin pages: shared dashboard title row
const AdminPageTitle = ({ title, description, action }) => <PageHeader title={title} description={description} actions={action} />;

export default AdminPageTitle;
