import { useId, useState } from "react";
import { Calculator } from "lucide-react";
import { incomeNeeded, mortgageEstimate } from "../../utils/mortgage";

const TERMS = [5, 10, 15, 20, 25];
const cedis = (value) => `₵${Math.round(value).toLocaleString("en-GH")}`;

/**
 * What buying this home with a bank loan could cost each month. Everything is an estimate the
 * visitor can change: rates in Ghana vary a lot between banks and between cedi and dollar loans.
 */
const AffordabilityCalculator = ({ price }) => {
  const id = useId();
  const [form, setForm] = useState({ depositPercent: 20, ratePercent: 25, years: 15 });
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const estimate = mortgageEstimate({ price, ...form });

  return (
    <div className="grid gap-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm shadow-gray-900/3 sm:grid-cols-2 sm:p-6">
      <div className="space-y-4">
        <div>
          <label htmlFor={`${id}-deposit`} className="flex items-baseline justify-between text-sm font-medium text-gray-700">
            Deposit <span className="font-semibold text-gray-900 tabular-nums">{form.depositPercent}%{estimate ? ` · ${cedis(estimate.deposit)}` : ""}</span>
          </label>
          <input id={`${id}-deposit`} type="range" min="10" max="90" step="5" value={form.depositPercent} onChange={set("depositPercent")} className="mt-2 w-full accent-brand-600" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-gray-700">
            Interest rate (yearly)
            <span className="relative mt-1.5 block">
              <input type="number" min="0" max="60" step="0.5" inputMode="decimal" value={form.ratePercent} onChange={set("ratePercent")} className="field pr-8" />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-gray-500">%</span>
            </span>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Repay over
            <select value={form.years} onChange={set("years")} className="field mt-1.5">
              {TERMS.map((years) => <option key={years} value={years}>{years} years</option>)}
            </select>
          </label>
        </div>
        <p className="text-xs leading-5 text-gray-500">An estimate only. Banks set their own rates, fees and conditions, and cedi and dollar loans differ a lot. Ask your bank for a real offer.</p>
      </div>

      <div className="rounded-xl bg-brand-50/60 p-5" aria-live="polite">
        <p className="flex items-center gap-2 text-sm font-medium text-brand-900"><Calculator className="h-4 w-4" aria-hidden="true" />Estimated monthly repayment</p>
        {estimate ? (
          <>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 tabular-nums">{cedis(estimate.monthly)}<span className="text-base font-medium text-gray-500"> /month</span></p>
            <dl className="mt-4 space-y-1.5 text-sm text-gray-600">
              <div className="flex justify-between gap-3"><dt>Loan amount</dt><dd className="font-medium text-gray-900 tabular-nums">{cedis(estimate.loan)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Total interest</dt><dd className="font-medium text-gray-900 tabular-nums">{cedis(estimate.totalInterest)}</dd></div>
              <div className="flex justify-between gap-3 border-t border-brand-100 pt-1.5"><dt>Total cost of the home</dt><dd className="font-semibold text-gray-900 tabular-nums">{cedis(estimate.totalCost)}</dd></div>
            </dl>
            {estimate.monthly > 0 && <p className="mt-4 text-xs leading-5 text-gray-600">Banks often lend when repayments are at most a third of take-home pay: about <span className="font-semibold text-gray-900">{cedis(incomeNeeded(estimate.monthly))}</span> a month here.</p>}
          </>
        ) : (
          <p className="mt-2 text-sm text-gray-600">Enter a rate between 0% and 60% to see an estimate.</p>
        )}
      </div>
    </div>
  );
};

export default AffordabilityCalculator;
