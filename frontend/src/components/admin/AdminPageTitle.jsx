const AdminPageTitle = ({ title, description, action }) => (
  <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">{title}</h1>
      {description && <p className="mt-1 text-gray-500">{description}</p>}
    </div>
    {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
  </div>
);

export default AdminPageTitle;
