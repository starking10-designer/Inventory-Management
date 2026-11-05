export const PACKING_SERIES = [
  { type: "shipping_label", title: "Shipping Label", color: "#166534" },
  { type: "shipping_cover", title: "Shipping Cover", color: "#172554" },
  { type: "packing_cover", title: "Packing Cover", color: "#f97316" },
  { type: "packing_board", title: "Packing Board", color: "#ef4444" },
];

export function buildPackingTrend(history = {}) {
  const dates = new Map();
  for (const { type } of PACKING_SERIES) {
    for (const entry of history[type] || []) {
      if (!entry.date) continue;
      if (!dates.has(entry.date)) {
        dates.set(entry.date, {
          date: entry.date,
          ...Object.fromEntries(PACKING_SERIES.map(series => [series.type, 0])),
        });
      }
      dates.get(entry.date)[type] += Number(entry.qty) || 0;
    }
  }
  return [...dates.values()].sort((a, b) => a.date.localeCompare(b.date));
}
