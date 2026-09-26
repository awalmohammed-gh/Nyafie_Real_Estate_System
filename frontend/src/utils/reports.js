// Buckets records into the last N calendar months for charts
export const lastMonths = (count = 6) => {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return { start, end, label: start.toLocaleDateString("en-GB", { month: "short" }) };
  });
};

// series: { [key]: { items, date: (item) => date, value?: (item) => number } }
export const monthlySeries = (series, count = 6) =>
  lastMonths(count).map(({ start, end, label }) => ({
    label,
    values: Object.fromEntries(
      Object.entries(series).map(([key, { items, date, value = () => 1 }]) => [
        key,
        items.filter((item) => {
          const d = new Date(date(item));
          return d >= start && d < end;
        }).reduce((sum, item) => sum + value(item), 0),
      ])
    ),
  }));

export const formatCedis = (value) => `₵${Math.round(value).toLocaleString()}`;
