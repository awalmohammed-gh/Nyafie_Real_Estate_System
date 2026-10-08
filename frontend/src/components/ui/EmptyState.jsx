const EmptyState = ({ icon: Icon, title, description, action }) => (
  <div className="flex flex-col items-center rounded-3xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center in-[.dash]:rounded-xl in-[.dash]:py-12">
    {Icon && (
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-500 in-[.dash]:h-11 in-[.dash]:w-11 in-[.dash]:rounded-lg">
        <Icon className="h-7 w-7" />
      </span>
    )}
    <h3 className="mt-5 text-lg font-bold text-gray-900 in-[.dash]:mt-4 in-[.dash]:text-base in-[.dash]:font-semibold">{title}</h3>
    {description && <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>}
    {action && <div className="mt-6">{action}</div>}
  </div>
);

export default EmptyState;
