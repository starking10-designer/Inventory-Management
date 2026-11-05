const ymd = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parseDate = (value) => new Date(`${value}T12:00:00`);
const advance = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12);

export function productTrendRange(mode, from, to, now = new Date()) {
  const today = ymd(now);
  if (mode === "custom") return { start: from, end: to, today };
  if (mode === "weekly") {
    const start = advance(now, -((now.getDay() + 6) % 7));
    return { start: ymd(start), end: ymd(advance(start, 6)), today };
  }
  return {
    start: ymd(new Date(now.getFullYear(), now.getMonth(), 1, 12)),
    end: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0, 12)),
    today,
  };
}

export function buildProductTrend(rows = [], mode, range) {
  const { start, end, today } = range;
  if (!start || !end || start > end) return { products: [], points: [] };
  const selected = rows.filter((row) => row.date >= start && row.date <= end && row.date <= today);
  const totals = new Map();
  selected.forEach((row) => totals.set(row.style, (totals.get(row.style) || 0) + Number(row.qty || 0)));
  const products = [...totals].filter(([, qty]) => qty > 0)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .slice(0, 5).map(([name, total], i) => ({ name, total, key: `product${i}` }));
  const points = [];
  const weeklyBuckets = mode === "monthly";
  let cursor = parseDate(start);
  while (ymd(cursor) <= end) {
    const first = ymd(cursor);
    const lastDate = weeklyBuckets ? advance(cursor, 6 - ((cursor.getDay() + 6) % 7)) : cursor;
    const last = ymd(lastDate) < end ? ymd(lastDate) : end;
    const label = weeklyBuckets
      ? `${cursor.getDate()}–${parseDate(last).getDate()}`
      : cursor.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
    const point = { label, dateRange: first === last ? first : `${first} – ${last}` };
    products.forEach(({ name, key }) => {
      point[key] = first > today ? null : selected
        .filter((row) => row.style === name && row.date >= first && row.date <= last)
        .reduce((sum, row) => sum + Number(row.qty || 0), 0);
    });
    points.push(point);
    cursor = advance(parseDate(last), 1);
  }
  return { products, points };
}
