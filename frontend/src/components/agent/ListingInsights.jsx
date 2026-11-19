import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Panel } from "../dashboard/Page";
import { BarChart } from "../ui/Charts";
import FilterTabs from "../ui/FilterTabs";
import { propertyApi } from "../../frontApi";
import { useApiQuery } from "../../hooks/useApiQuery";

const PERIODS = [{ id: 14, label: "14 days" }, { id: 30, label: "30 days" }, { id: 90, label: "90 days" }];
const DAY_LABEL = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const LEADS = [["inquiries", "Inquiries"], ["offers", "Offers"], ["viewings", "Viewings"], ["rentals", "Rental requests"], ["sales", "Purchase requests"]];

// Weekly bars for long periods keep the chart readable
const bucket = (days, size) => {
  const out = [];
  for (let i = 0; i < days.length; i += size) {
    const slice = days.slice(i, i + size);
    out.push({ label: size === 1 ? DAY_LABEL.format(new Date(slice[0].date)) : `${DAY_LABEL.format(new Date(slice[0].date))}+`, values: { views: slice.reduce((sum, d) => sum + d.views, 0) } });
  }
  return out;
};

/** How a listing is doing: counted views per day, people who saved it and the leads it brought. */
const ListingInsights = ({ propertyId }) => {
  const [days, setDays] = useState(14);
  const query = useApiQuery(`insights:${propertyId}:${days}`, (signal) => propertyApi.getListingInsights(propertyId, days, { signal }));
  const data = query.data;

  return (
    <Panel title="Performance">
      <FilterTabs tabs={PERIODS} value={days} onChange={setDays} label="Period" />
      {query.error ? (
        <p role="alert" className="mt-4 text-sm text-red-700">{query.error}</p>
      ) : !data ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading performance...</p>
      ) : (
        <div className="mt-4 space-y-5">
          <dl className="grid grid-cols-3 gap-3 text-center">
            {[["Views", data.views.period, `${data.views.allTime.toLocaleString()} all time`], ["Saves", data.saves, "people saved it"], ["Leads", data.totalLeads, data.leadRate != null ? `${data.leadRate} per 100 views` : "in this period"]].map(([label, value, note]) => (
              <div key={label} className="rounded-xl bg-gray-50 px-2 py-3">
                <dt className="text-xs font-medium text-gray-500">{label}</dt>
                <dd className="mt-0.5 text-xl font-semibold text-gray-900 tabular-nums">{value.toLocaleString()}</dd>
                <dd className="text-[11px] text-gray-500">{note}</dd>
              </div>
            ))}
          </dl>
          {data.views.period > 0 ? (
            <BarChart title={`Views over the last ${days} days`} data={bucket(data.days, days > 30 ? 7 : days > 14 ? 3 : 1)} series={[{ key: "views", label: "Views" }]} integer height={150} />
          ) : (
            <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">No views counted in this period yet. Views are counted once per person per day, never your own team's.</p>
          )}
          {data.totalLeads > 0 && (
            <ul className="space-y-1.5 text-sm">
              {LEADS.filter(([key]) => data.leads[key]).map(([key, label]) => (
                <li key={key} className="flex justify-between gap-3 text-gray-600"><span>{label}</span><span className="font-medium text-gray-900 tabular-nums">{data.leads[key]}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
};

export default ListingInsights;
