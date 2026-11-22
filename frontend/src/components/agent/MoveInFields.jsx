import { ADVANCE_OPTIONS, moveInCosts } from "../../utils/moveIn";
import { formatGhs } from "../../utils/property";

/**
 * Editor fields for a monthly rental's move-in costs: months of rent in advance, the agent fee and
 * a security deposit, with the total tenants will see. All optional.
 */
const MoveInFields = ({ value, onChange, rent, error }) => {
  const set = (key) => (event) => onChange({ ...value, [key]: event.target.value === "" ? "" : event.target.type === "number" || key === "advanceMonths" ? Number(event.target.value) : event.target.value });
  const costs = moveInCosts(rent, value);
  const advanceOptions = ADVANCE_OPTIONS.includes(Number(value.advanceMonths)) ? ADVANCE_OPTIONS : [...ADVANCE_OPTIONS, Number(value.advanceMonths)].sort((a, b) => a - b);

  return (
    <fieldset className="mt-6 rounded-2xl border border-gray-200 bg-gray-50/60 p-5">
      <legend className="px-1 text-sm font-semibold text-gray-900">Move-in costs <span className="font-normal text-gray-500">(optional)</span></legend>
      <p className="text-xs leading-5 text-gray-500">What tenants pay to move in. Shown on the listing so there are no surprises; you collect them as you do today.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]">
        <label className="text-sm font-medium text-gray-700">
          Rent paid in advance
          <select value={value.advanceMonths} onChange={set("advanceMonths")} className="field mt-1.5">
            {advanceOptions.map((months) => <option key={months} value={months}>{months === 0 ? "Not stated" : `${months} ${months === 1 ? "month" : "months"}`}</option>)}
          </select>
        </label>
        <div className="text-sm font-medium text-gray-700">
          <label htmlFor="move-in-fee-type">Agent fee</label>
          <div className="mt-1.5 flex gap-2">
            <select id="move-in-fee-type" value={value.agentFeeType} onChange={set("agentFeeType")} className="field min-w-0 flex-1">
              <option value="none">No fee</option>
              <option value="percent">% of advance</option>
              <option value="fixed">Fixed (₵)</option>
            </select>
            {value.agentFeeType !== "none" && (
              <input type="number" min="0" max={value.agentFeeType === "percent" ? 20 : undefined} step="any" inputMode="decimal" aria-label={value.agentFeeType === "percent" ? "Agent fee percentage" : "Agent fee amount in cedis"} aria-invalid={Boolean(error)} value={value.agentFeeValue} onChange={set("agentFeeValue")} className="field w-24" />
            )}
          </div>
        </div>
        <label className="text-sm font-medium text-gray-700">
          Security deposit (₵)
          <input type="number" min="0" step="any" inputMode="decimal" aria-invalid={Boolean(error)} value={value.securityDeposit} onChange={set("securityDeposit")} placeholder="0" className="field mt-1.5" />
        </label>
      </div>
      {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
      {costs && (
        <p className="mt-4 rounded-xl bg-white p-3 text-sm text-gray-700 ring-1 ring-gray-200">
          Tenants will see a total of <strong className="text-gray-900">{formatGhs(costs.total)}</strong> to move in
          {costs.advanceMonths > 0 && <> ({costs.advanceMonths} {costs.advanceMonths === 1 ? "month" : "months"} of rent {formatGhs(costs.advance)}</>}
          {costs.fee > 0 && <>{costs.advanceMonths > 0 ? ", " : " ("}agent fee {formatGhs(costs.fee)}</>}
          {costs.deposit > 0 && <>{costs.advanceMonths > 0 || costs.fee > 0 ? ", " : " ("}deposit {formatGhs(costs.deposit)}</>}
          ).
        </p>
      )}
    </fieldset>
  );
};

export default MoveInFields;
