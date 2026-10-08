const PageTitle = ({ title, description, action, eyebrow = "Your workspace" }) => (
  <header className="workspace-page-title">
    <div className="min-w-0"><p className="workspace-eyebrow mb-2">{eyebrow}</p><h1>{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">{description}</p>}</div>
    {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
  </header>
);

export default PageTitle;
