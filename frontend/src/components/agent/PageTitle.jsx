import { PageHeader } from "../dashboard/Page";

// Agent pages: same title row as the admin console
const PageTitle = ({ title, description, action }) => <PageHeader title={title} description={description} actions={action} />;

export default PageTitle;
