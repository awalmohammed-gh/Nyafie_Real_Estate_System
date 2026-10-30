import { useState } from "react";
import { motion } from "motion/react";

// Lightweight chart primitives (no chart library). Mark specs: bars ≤24px thick with
// a 4px rounded data-end and a square baseline, 2px surface gap between grouped bars,
// recessive gridlines, per-bar hover/focus tooltip, legend for 2+ series, and a
// visually hidden table so the data never depends on colour or sight alone.

// Categorical series colours (validated: brand purple + emerald). Text never uses them.
const SERIES = [
  { bar: "bg-brand-500", dot: "bg-brand-500" },
  { bar: "bg-emerald-500", dot: "bg-emerald-500" },
];

const niceCeil = (value) => {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  const n = value / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
};

const Legend = ({ series }) => (
  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
    {series.map((s, i) => (
      <li key={s.key} className="flex items-center gap-1.5">
        <span className={`h-2.5 w-2.5 rounded-sm ${SERIES[i].dot}`} />
        {s.label}
      </li>
    ))}
  </ul>
);

/**
 * Column chart. data: [{ label, values: { [seriesKey]: number } }]
 * series: [{ key, label }] (one or two series)
 */
export const BarChart = ({ title, data, series, format = (v) => v.toLocaleString(), axisFormat = format, integer = false, height = 180 }) => {
  const [active, setActive] = useState(null);
  const ceiling = niceCeil(Math.max(...data.flatMap((d) => series.map((s) => d.values[s.key] || 0)), 0));
  const max = integer ? Math.max(2, Math.ceil(ceiling / 2) * 2) : ceiling;
  const ticks = [max, max / 2, 0];
  const latest = data.length - 1;

  return (
    <figure>
      {series.length > 1 && (
        <div className="mb-3">
          <Legend series={series} />
        </div>
      )}
      <div className="relative" style={{ height }} role="img" aria-label={`${title}. ${data.map((d) => `${d.label}: ${series.map((s) => `${s.label} ${format(d.values[s.key] || 0)}`).join(", ")}`).join("; ")}`}>
        {/* Gridlines + y labels */}
        {ticks.map((tick, i) => (
          <div key={tick} className="absolute inset-x-0 flex items-center gap-2" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>
            <span className="w-10 -translate-y-1/2 text-right text-[11px] text-gray-400 tabular-nums">{axisFormat(tick)}</span>
            <span className={`-translate-y-1/2 flex-1 border-t ${tick === 0 ? "border-gray-300" : "border-dashed border-gray-100"}`} />
          </div>
        ))}

        {/* Bars */}
        <div className="absolute inset-y-0 right-0 left-12 flex items-end">
          {data.map((d, i) => (
            <div
              key={d.label}
              tabIndex={0}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="relative flex h-full flex-1 items-end justify-center gap-0.5 outline-none focus-visible:bg-brand-50/60"
            >
              {series.map((s, si) => {
                const value = d.values[s.key] || 0;
                return (
                  <motion.div
                    key={s.key}
                    initial={{ height: 0 }}
                    animate={{ height: `${(value / max) * 100}%` }}
                    transition={{ duration: 0.5, delay: i * 0.03, ease: "easeOut" }}
                    className={`w-full max-w-6 rounded-t-[4px] ${SERIES[si].bar} ${active != null && active !== i ? "opacity-40" : ""} transition-opacity`}
                  />
                );
              })}
              {/* Selective direct label on the latest period */}
              {i === latest && active == null && series.length === 1 && (
                <span
                  className="pointer-events-none absolute -translate-y-full pb-1 text-[11px] font-semibold text-gray-700 tabular-nums"
                  style={{ bottom: `${((d.values[series[0].key] || 0) / max) * 100}%` }}
                >
                  {format(d.values[series[0].key] || 0)}
                </span>
              )}
              {active === i && (
                <div className="pointer-events-none absolute bottom-full z-10 mb-2 min-w-28 rounded-xl bg-gray-900 px-3 py-2 text-xs text-white shadow-lg">
                  <p className="font-semibold">{d.label}</p>
                  {series.map((s, si) => (
                    <p key={s.key} className="mt-0.5 flex items-center justify-between gap-3 text-gray-300">
                      <span className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-sm ${SERIES[si].dot}`} />
                        {s.label}
                      </span>
                      <span className="font-semibold text-white tabular-nums">{format(d.values[s.key] || 0)}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {/* X labels */}
      <div className="mt-2 ml-12 flex">
        {data.map((d) => (
          <span key={d.label} className="flex-1 truncate text-center text-[11px] text-gray-500">{d.label}</span>
        ))}
      </div>

      <div className="sr-only">
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th>Period</th>
              {series.map((s) => <th key={s.key}>{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <td>{d.label}</td>
                {series.map((s) => <td key={s.key}>{format(d.values[s.key] || 0)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
};

/** Horizontal ranked bars with direct value labels. items: [{ label, value, sublabel }] */
export const BarList = ({ items, format = (v) => v.toLocaleString(), emptyText = "No data yet" }) => {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (items.length === 0) return <p className="py-6 text-center text-sm text-gray-400">{emptyText}</p>;
  return (
    <ul className="space-y-3">
      {items.map((item, index) => (
        <li key={item.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium text-gray-800">{item.label}</span>
            <span className="shrink-0 font-semibold text-gray-900 tabular-nums">{format(item.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(item.value / max) * 100}%` }}
              transition={{ duration: 0.5, delay: index * 0.04, ease: "easeOut" }}
              className="h-full rounded-full bg-brand-500"
            />
          </div>
          {item.sublabel && <p className="mt-1 text-xs text-gray-500">{item.sublabel}</p>}
        </li>
      ))}
    </ul>
  );
};

/** Part-to-whole bar for status breakdowns; every segment is labelled with text and count. */
export const ProportionBar = ({ segments }) => {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(", ")}>
        {segments.filter((s) => s.value > 0).map((s) => (
          <motion.div
            key={s.label}
            initial={{ width: 0 }}
            animate={{ width: `${(s.value / total) * 100}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className={`h-full first:rounded-l-full last:rounded-r-full ${s.className}`}
          />
        ))}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
        {segments.map((s) => (
          <li key={s.label} className="flex min-w-24 items-start gap-2">
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-sm ${s.className}`} />
            <span>
              <span className="block text-lg font-bold text-gray-900 tabular-nums">{s.value}</span>
              <span className="block text-xs whitespace-nowrap text-gray-500">{s.label} · {Math.round((s.value / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
