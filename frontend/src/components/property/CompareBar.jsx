import { Link, useLocation } from "react-router-dom";
import { GitCompareArrows, X } from "lucide-react";
import { useBrowsingList } from "../../hooks/useBrowsingList";
import { COMPARE_KEY, COMPARE_LIMIT, clearCompare } from "../../utils/browsingLists";

// Floating reminder of the homes picked for comparison, on public pages (hidden on the compare page)
const CompareBar = () => {
  const ids = useBrowsingList(COMPARE_KEY);
  const { pathname } = useLocation();
  if (!ids.length || pathname === "/compare") return null;
  // Listing pages have a sticky action bar at the bottom on phones: sit above it
  const raised = pathname.startsWith("/house/");
  return (
    <div className={`fixed left-1/2 z-40 -translate-x-1/2 ${raised ? "bottom-28 lg:bottom-6" : "bottom-4 sm:bottom-6"}`} role="region" aria-label="Homes to compare">
      <div className="flex items-center gap-1 rounded-full bg-gray-950 py-1.5 pr-1.5 pl-4 text-sm text-white shadow-xl">
        <GitCompareArrows className="h-4 w-4 text-brand-300" aria-hidden="true" />
        <span className="mr-2 ml-1.5 whitespace-nowrap">{ids.length} of {COMPARE_LIMIT} homes</span>
        <Link to="/compare" className="rounded-full bg-white px-4 py-1.5 font-semibold whitespace-nowrap text-gray-900 hover:bg-brand-50">{ids.length > 1 ? "Compare now" : "View"}</Link>
        <button type="button" onClick={clearCompare} className="grid h-8 w-8 place-items-center rounded-full text-gray-300 hover:bg-white/10 hover:text-white" aria-label="Clear comparison"><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>
    </div>
  );
};

export default CompareBar;
