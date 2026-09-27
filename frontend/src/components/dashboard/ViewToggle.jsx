import { LayoutGrid, List } from "lucide-react";

// Grid (visual cards) or list (table) for property views
const ViewToggle = ({ value, onChange }) => (
  <div role="radiogroup" aria-label="View" className="inline-flex shrink-0 rounded-md border border-gray-200 bg-white p-0.5">
    {[
      ["grid", LayoutGrid, "Cards"],
      ["list", List, "Table"],
    ].map(([id, Icon, label]) => (
      <button
        key={id}
        type="button"
        role="radio"
        aria-checked={value === id}
        aria-label={label}
        title={label}
        onClick={() => onChange(id)}
        className={`grid h-8 w-8 place-items-center rounded transition-colors ${value === id ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"}`}
      >
        <Icon className="h-4 w-4" />
      </button>
    ))}
  </div>
);

export default ViewToggle;
