import { Search } from "lucide-react";

const SearchInput = ({ value, onChange, placeholder = "Search", className = "" }) => (
  <div className={`relative ${className}`}>
    <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-gray-400" />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="field rounded-full pl-10"
    />
  </div>
);

export default SearchInput;
