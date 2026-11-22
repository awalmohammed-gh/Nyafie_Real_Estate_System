import { useRef, useState } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, RotateCcw, Table2 } from "lucide-react";
import { useApiQuery } from "../../hooks/useApiQuery";
import { adminApi } from "../../frontApi";
const formatCedis = value => `GH₵${Number(value || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// What each metric counts. Revenue is defined on the server (adminDashboardController.js).
const METRICS = [
  {
    key: "revenue",
    label: "Revenue collected",
    short: "Revenue",
    currency: true,
    empty: "No payments were confirmed",
    explain: "Payments confirmed as received: Paystack rental payments, sale payments confirmed by the owner, and agent subscriptions. Failed, pending and duplicate payments, test payments and property asking prices are not included.",
  },
  { key: "listings", label: "New property listings", short: "Listings", empty: "No properties were added", explain: "Properties added by agents and your team. Drafts that were never submitted are not included." },
  { key: "inquiries", label: "Customer inquiries", short: "Inquiries", empty: "No inquiries were received", explain: "Inquiries customers sent about any listing on the platform." },
  { key: "agents", label: "Agent registrations", short: "Agents", empty: "No agents registered", explain: "Agent accounts created, whether or not they have finished onboarding." },
];
const PERIODS = [3, 6, 12];

const monthDate = (key) => {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1);
};
const monthShort = (key) => monthDate(key).toLocaleDateString("en-GB", { month: "short" });
const monthLong = (key) => monthDate(key).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const compact = (value) => (value >= 1e6 ? `${+(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${+(value / 1e3).toFixed(1)}K` : `${value}`);

// Clean axis: 0 to a round top in 3-5 even steps (whole numbers for counts)
const niceScale = (max, integer) => {
  if (max <= 0) return { top: integer ? 4 : 1000, step: integer ? 1 : 250 };
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const candidates = integer ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  let step = candidates.find((c) => raw <= c * pow) * pow;
  if (integer) step = Math.max(1, Math.round(step));
  return { top: Math.ceil(max / step) * step, step };
};

const Segmented = ({ label, options, value, onChange, className = "" }) => (
  <div role="group" aria-label={label} className={`inline-flex rounded-xl bg-gray-100 p-1 ${className}`}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        aria-pressed={value === option.value}
        onClick={() => onChange(option.value)}
        className={`min-h-9 flex-1 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors ${value === option.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const Comparison = ({ data, metric, months, format }) => {
  const span = `previous ${months} months`;
  if (!data.previousTotal) {
    return <p className="text-sm text-gray-500">{data.total ? `Nothing to compare with: none in the ${span}` : `None in the ${span} either`}</p>;
  }
  if (data.change === 0) return <p className="text-sm text-gray-500">Same as the {span} ({format(data.previousTotal)})</p>;
  const up = data.change > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-gray-500">
      <span className={`inline-flex items-center font-semibold ${up ? "text-emerald-700" : "text-red-700"}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{up ? "Up" : "Down"} </span>
        {Math.abs(data.change).toLocaleString()}%
      </span>
      <span>vs the {span} ({format(data.previousTotal)} {metric.currency ? "collected" : "in total"})</span>
    </p>
  );
};

/** Column chart for one metric: hover or arrow keys move between months; value-first tooltip. */
const Columns = ({ series, format, axisFormat, integer, currentMonth, title }) => {
  const [active, setActive] = useState(null);
  const [focusIndex, setFocusIndex] = useState(series.length - 1);
  const refs = useRef([]);
  const max = Math.max(...series.map((m) => m.value), 0);
  const { top, step } = niceScale(max, integer);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => top - i * step);
  const latest = series.length - 1;
  const dense = series.length > 6;

  const move = (event) => {
    const next = { ArrowRight: focusIndex + 1, ArrowLeft: focusIndex - 1, Home: 0, End: latest }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const index = Math.min(latest, Math.max(0, next));
    setFocusIndex(index);
    refs.current[index]?.focus();
  };

  return (
    <div className="relative">
      <div className="relative h-52 sm:h-64">
        {/* Gridlines and y-axis labels */}
        {ticks.map((tick, i) => (
          <div key={tick} className="absolute inset-x-0 flex items-center gap-2" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>
            <span className="w-11 shrink-0 -translate-y-1/2 text-right text-[11px] text-gray-500 tabular-nums sm:w-12">{axisFormat(tick)}</span>
            <span className={`flex-1 -translate-y-1/2 border-t ${tick === 0 ? "border-gray-300" : "border-gray-100"}`} />
          </div>
        ))}

        {/* One column per month; the column slot is the hit target, not just the painted bar */}
        <div role="list" aria-label={title} onKeyDown={move} className="absolute inset-y-0 right-0 left-13 flex items-end sm:left-14">
          {series.map((m, i) => {
            const height = top ? (m.value / top) * 100 : 0;
            const isActive = active === i;
            const partial = m.month === currentMonth;
            return (
              <div
                key={m.month}
                role="listitem"
                ref={(el) => (refs.current[i] = el)}
                tabIndex={i === focusIndex ? 0 : -1}
                aria-label={`${monthLong(m.month)}${partial ? " (to date)" : ""}: ${format(m.value)}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => { setActive(i); setFocusIndex(i); }}
                onBlur={() => setActive(null)}
                className="relative flex h-full flex-1 cursor-default items-end justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
              >
                {m.value > 0 && (
                  <span
                    className={`overview-chart-bar block w-[55%] max-w-6 rounded-t-[4px] transition-[height,background-color] duration-300 motion-reduce:transition-none ${partial ? "is-current" : ""} ${isActive ? "is-active bg-brand-700" : "bg-brand-500"}`}
                    style={{ height: `${Math.max(height, 1.5)}%` }}
                  />
                )}
                {/* Selective direct label: the latest month only, while nothing is hovered */}
                {i === latest && active === null && m.value > 0 && (
                  <span className="pointer-events-none absolute pb-1 text-[11px] font-semibold whitespace-nowrap text-gray-700" style={{ bottom: `${height}%` }}>
                    {axisFormat(m.value)}
                  </span>
                )}
                {isActive && (
                  <span
                    role="tooltip"
                    className={`pointer-events-none absolute z-10 mb-2 min-w-32 rounded-xl bg-gray-900 px-3 py-2 text-left text-xs shadow-lg ${i === 0 ? "left-0" : i === latest ? "right-0" : "left-1/2 -translate-x-1/2"}`}
                    style={{ bottom: `${Math.min(height, 70)}%` }}
                  >
                    <span className="block text-sm font-semibold text-white">{format(m.value)}</span>
                    <span className="block text-gray-300">{monthLong(m.month)}{partial ? " · to date" : ""}</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Month labels (every other one on narrow screens when there are 12) */}
      <div className="mt-2 ml-13 flex sm:ml-14" aria-hidden="true">
        {series.map((m, i) => (
          <span key={m.month} className={`flex-1 truncate text-center text-[11px] text-gray-500 ${dense && i % 2 === 1 ? "max-sm:invisible" : ""}`}>
            {monthShort(m.month)}
          </span>
        ))}
      </div>
    </div>
  );
};

const ChartSkeleton = () => (
  <div className="flex h-52 items-end gap-3 pl-14 sm:h-64" aria-hidden="true">
    {[40, 65, 30, 80, 55, 70].map((h, i) => (
      <span key={i} className="flex-1 animate-pulse rounded-t-md bg-gray-100 motion-reduce:animate-none" style={{ height: `${h}%` }} />
    ))}
  </div>
);

/**
 * Platform performance: one metric at a time over the last 3, 6 or 12 months, with the period
 * total and a comparison with the equal period before it. Data: GET /api/admin/performance.
 */
const PerformanceChart = ({ refreshKey = "", months = 6, onMonthsChange }) => {
  const [metricKey, setMetricKey] = useState("revenue");
  const [showTable, setShowTable] = useState(false);
  const query = useApiQuery(`performance:${months}:${refreshKey}`, () => adminApi.getPerformance(months));
  // A new period keeps the last chart on screen (dimmed) until its data arrives
  const result = query.data ?? query.previous;
  const refreshing = query.loading && Boolean(result);

  const metric = METRICS.find((m) => m.key === metricKey);
  const data = result?.metrics[metricKey];
  const format = metric.currency ? formatCedis : (v) => v.toLocaleString();
  const axisFormat = compact;
  const shownMonths = result?.months ?? months;
  const series = data?.series || [];
  const currentMonth = series.at(-1)?.month;
  const range = series.length ? `${monthShort(series[0].month)} – ${monthShort(currentMonth)} ${monthDate(currentMonth).getFullYear()}` : "";
  const empty = data && series.every((m) => m.value === 0);

  return (
    <section aria-labelledby="performance-title" className="admin-card overview-performance overflow-hidden">
      <header className="flex flex-col gap-4 border-b border-gray-100 px-4 py-4 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 id="performance-title" className="text-[0.9375rem] font-semibold text-gray-900">Platform performance</h2>
          <p className="mt-1 text-xs text-gray-500">{metric.currency ? "Revenue collected over time." : `${metric.label} over time.`}</p>
        </div>
        <Segmented label="Period" value={months} onChange={onMonthsChange} options={PERIODS.map((p) => ({ value: p, label: `${p} months` }))} className="overview-period w-full shrink-0 sm:w-auto" />
      </header>

      <div className="overview-metric-controls px-4 pt-4 sm:px-6">
        <Segmented
          label="Metric"
          value={metricKey}
          onChange={setMetricKey}
          options={METRICS.map((m) => ({ value: m.key, label: m.short }))}
          className="grid w-full grid-cols-2 xl:flex xl:w-auto"
        />
      </div>

      <div className="overview-chart-body px-4 py-5 sm:px-6" aria-busy={query.loading}>
        {!result && query.error ? (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50/60 p-4 sm:flex-row sm:items-center">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
            <p className="flex-1 text-sm text-red-900">Couldn’t load performance data. {query.error}</p>
            <button type="button" onClick={query.reload} className="btn btn-light px-3.5 py-2"><RotateCcw className="h-4 w-4" />Try again</button>
          </div>
        ) : !result ? (
          <>
            <div className="mb-5 space-y-2" aria-hidden="true"><span className="block h-8 w-32 animate-pulse rounded bg-gray-100" /><span className="block h-3 w-56 animate-pulse rounded bg-gray-100" /></div>
            <ChartSkeleton />
            <p className="sr-only" role="status">Loading performance data…</p>
          </>
        ) : (
          <div className={`overview-performance-content transition-opacity ${refreshing ? "opacity-60" : ""}`}>
            {/* Period summary */}
            <div className="overview-chart-summary mb-5 flex flex-col gap-1">
              <p className="text-xs font-medium text-gray-500">{metric.label} · last {shownMonths} months <span className="text-gray-400">({range}, this month to date)</span></p>
              <p className="text-3xl font-semibold tracking-tight text-gray-900">{format(data.total)}</p>
              <Comparison data={data} metric={metric} months={shownMonths} format={format} />
              {metric.key === "revenue" && data.total > 0 && (
                <p className="text-xs text-gray-500">
                  Rentals {formatCedis(data.breakdown.rental)} · Sales {formatCedis(data.breakdown.sale)} · Subscriptions {formatCedis(data.breakdown.subscription)}
                </p>
              )}
            </div>

            <div className="overview-chart-plot">{empty ? (
              <div className="grid h-52 place-items-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 text-center sm:h-64">
                <div>
                  <p className="text-sm font-medium text-gray-900">{metric.empty} in the last {shownMonths} months</p>
                  <p className="mt-1 text-xs text-gray-500">Try a longer period or another metric.</p>
                </div>
              </div>
            ) : (
              <Columns key={`${metricKey}:${shownMonths}`} series={series} format={format} axisFormat={axisFormat} integer={!metric.currency} currentMonth={currentMonth} title={`${metric.label} per month, ${range}`} />
            )}</div>

            <details className="overview-chart-options"><summary>Chart details &amp; table</summary><div className="overview-chart-footer mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-500">{metric.currency ? "Ghana cedis, by the date each payment was confirmed." : "Counted by the date each record was created."}</p>
              <button type="button" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 hover:text-brand-800">
                <Table2 className="h-4 w-4" aria-hidden="true" />
                {showTable ? "Hide table" : "View as table"}
              </button>
            </div>
            <details className="overview-chart-explanation"><summary>What’s included in {metric.short.toLowerCase()}?</summary><p>{metric.explain}</p></details>
            {showTable && (
              <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <caption className="sr-only">{metric.label} per month</caption>
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr><th scope="col" className="px-4 py-2 text-left font-medium">Month</th><th scope="col" className="px-4 py-2 text-right font-medium">{metric.short}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {series.map((m) => (
                      <tr key={m.month}><td className="px-4 py-2 text-gray-700">{monthLong(m.month)}{m.month === currentMonth ? " (to date)" : ""}</td><td className="px-4 py-2 text-right font-medium text-gray-900 tabular-nums">{format(m.value)}</td></tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-gray-200 bg-gray-50">
                    <tr><th scope="row" className="px-4 py-2 text-left font-semibold text-gray-900">Total</th><td className="px-4 py-2 text-right font-semibold text-gray-900 tabular-nums">{format(data.total)}</td></tr>
                  </tfoot>
                </table>
              </div>
            )}
            </details>
          </div>
        )}
      </div>
    </section>
  );
};

export default PerformanceChart;
