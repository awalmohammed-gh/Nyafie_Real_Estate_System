import { usePlatform } from "../../context/usePlatform";

const RANGES = [
  { id: "all", label: "Any time" },
  { id: "7", label: "Last 7 days" },
  { id: "30", label: "Last 30 days" },
  { id: "90", label: "Last 90 days" },
];

// Secondary filters shared by the transaction boards: agent (admins only), property and date
const Filters = ({ isAdmin, owners = [], ownerId, setOwnerId, properties = [], propertyId, setPropertyId, range, setRange }) => {
  const { siteName } = usePlatform();
  return (
  <div className={isAdmin ? "mb-4 grid gap-2 sm:grid-cols-3" : "workspace-toolbar grid gap-3 sm:grid-cols-2"}>
    {isAdmin && (
      <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} aria-label="Filter by agent" className="field py-2">
        <option value="all">All agents & {siteName}</option>
        {owners.map((o) => (
          <option key={o.id} value={o.id}>{o.type === "admin" ? `${siteName} (admin listings)` : o.name}</option>
        ))}
      </select>
    )}
    <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} aria-label="Filter by property" className="field py-2">
      <option value="all">All properties</option>
      {properties.map((p) => (
        <option key={p.id} value={p.id}>{p.title}</option>
      ))}
    </select>
    <select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Filter by date" className="field py-2">
      {RANGES.map((r) => (
        <option key={r.id} value={r.id}>{r.label}</option>
      ))}
    </select>
  </div>
  );
};

export default Filters;
