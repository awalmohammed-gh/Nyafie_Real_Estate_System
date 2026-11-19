import { GitCompareArrows } from "lucide-react";
import { useToast } from "../../context/useToast";
import { useBrowsingList } from "../../hooks/useBrowsingList";
import { COMPARE_KEY, COMPARE_LIMIT, toggleCompare } from "../../utils/browsingLists";

// Adds a home to (or removes it from) this device's comparison, up to COMPARE_LIMIT homes
const CompareButton = ({ propertyId, className = "" }) => {
  const { toast } = useToast();
  const ids = useBrowsingList(COMPARE_KEY);
  const added = ids.includes(propertyId);
  const toggle = () => {
    const result = toggleCompare(propertyId);
    if (result.full) toast({ type: "info", title: `You can compare up to ${COMPARE_LIMIT} homes`, description: "Remove one from the comparison first." });
  };
  return (
    <button type="button" onClick={toggle} aria-pressed={added} aria-label={added ? "Remove from comparison" : "Add to comparison"} className={className}>
      <GitCompareArrows aria-hidden="true" className={`h-4 w-4 ${added ? "text-brand-600" : ""}`} />
      {added ? "Comparing" : "Compare"}
    </button>
  );
};

export default CompareButton;
