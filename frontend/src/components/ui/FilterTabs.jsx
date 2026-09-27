// Segmented status filter with counts; scrolls sideways on small screens
const FilterTabs = ({ tabs, value, onChange, label = "Filter" }) => (
  <div className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
    <div role="tablist" aria-label={label} className="inline-flex w-max gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5">
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
              active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            {tab.label}
            {tab.count != null && <span className={`text-xs tabular-nums ${active ? "text-gray-300" : "text-gray-400"}`}>{tab.count}</span>}
          </button>
        );
      })}
    </div>
  </div>
);

export default FilterTabs;
