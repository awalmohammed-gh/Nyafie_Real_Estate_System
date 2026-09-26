// Pill tabs with counts; scrolls sideways on small screens
const FilterTabs = ({ tabs, value, onChange, label = "Filter" }) => (
  <div className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
    <div role="tablist" aria-label={label} className="flex w-max gap-1 rounded-full bg-white p-1 ring-1 ring-gray-200">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={`rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition ${
            value === tab.id ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          {tab.label}
          {tab.count != null && <span className={`ml-1.5 ${value === tab.id ? "text-gray-400" : "text-gray-400"}`}>{tab.count}</span>}
        </button>
      ))}
    </div>
  </div>
);

export default FilterTabs;
