// Segmented status filter with counts; scrolls sideways on small screens
const FilterTabs = ({ tabs, value, onChange, label = "Filter" }) => (
  <div className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
    <div role="tablist" aria-label={label} className="inline-flex w-max gap-0.5 rounded-xl bg-gray-100 p-1">
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors ${
              active ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:bg-white/60 hover:text-gray-900"
            }`}
          >
            {tab.label}
            {tab.count != null && <span className={`min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums ${active ? "bg-brand-50 text-brand-700" : "text-gray-500"}`}>{tab.count}</span>}
          </button>
        );
      })}
    </div>
  </div>
);

export default FilterTabs;
