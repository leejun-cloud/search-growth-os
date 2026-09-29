import type { SearchMetric } from './types';

const DAY = 86_400_000;
export function parsePeriod(label: string): { start: string; end: string; days: number } | null {
  const match = label.match(/^(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})(?:\s|$)/);
  if (!match) return null;
  const [, start, end] = match;
  const a = Date.parse(start + 'T00:00:00Z'), b = Date.parse(end + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  if (new Date(a).toISOString().slice(0, 10) !== start || new Date(b).toISOString().slice(0, 10) !== end) return null;
  return { start, end, days: Math.round((b - a) / DAY) + 1 };
}

/** A single provider/period, never the sum of overlapping imports. Unknown dates remain unknown. */
export function selectMetricWindow(metrics: SearchMetric[], now = new Date()) {
  const groups = new Map<string, SearchMetric[]>();
  for (const metric of metrics) {
    const key = JSON.stringify([metric.source, metric.periodLabel]);
    const group = groups.get(key) ?? [];
    group.push(metric); groups.set(key, group);
  }
  const windows = [...groups.values()].map(rows => ({ rows, period: parsePeriod(rows[0].periodLabel),
    imported: Math.max(...rows.map(row => Date.parse(row.importedAt) || 0)) }));
  const dated = windows.filter(w => w.period && Date.parse(w.period.end + 'T00:00:00Z') <= now.getTime());
  dated.sort((a, b) => b.period!.end.localeCompare(a.period!.end) || b.imported - a.imported);
  const current = dated[0] ?? windows.sort((a, b) => b.imported - a.imported)[0];
  if (!current) return { rows: [] as SearchMetric[], period: null, periodLabel: null, source: null, status: 'missing' as const, previous: [] as SearchMetric[] };
  const unique = (rows: SearchMetric[]) => {
    const result = new Map<string, SearchMetric>();
    for (const row of [...rows].sort((a, b) => a.importedAt.localeCompare(b.importedAt))) {
      result.set(JSON.stringify([row.dimension, row.metricKey]), row);
    }
    return [...result.values()];
  };
  const age = current.period ? (now.getTime() - Date.parse(current.period.end + 'T23:59:59Z')) / DAY : Infinity;
  const previous = dated.find(w => current.period && w.period && w.period.days === current.period.days &&
    w.rows[0].source === current.rows[0].source &&
    Date.parse(w.period.end) + DAY === Date.parse(current.period.start));
  return { rows: unique(current.rows), period: current.period, periodLabel: current.rows[0].periodLabel,
    source: current.rows[0].source, status: !current.period ? 'undated' as const : age > 7 ? 'stale' as const : 'fresh' as const,
    previous: previous ? unique(previous.rows) : [] };
}

export function parseCtr(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const n = Number(trimmed.replace(/[%\s,]/g, ''));
  if (!Number.isFinite(n) || n < 0) throw new Error('CTR must be a non-negative number');
  const ratio = trimmed.includes('%') ? n / 100 : n;
  if (ratio > 1) throw new Error('CTR must be a ratio or have an explicit % sign');
  return ratio;
}

/** GSC dates are Pacific calendar dates; both inclusive windows have exactly `days` days. */
export function comparisonWindows(now = new Date(), days = 28) {
  if (!Number.isInteger(days) || days < 7 || days > 90) throw new Error('days must be 7..90');
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const end = Date.parse(today + 'T00:00:00Z') - 3 * DAY;
  const iso = (value: number) => new Date(value).toISOString().slice(0, 10);
  return { current: { startDate: iso(end - (days - 1) * DAY), endDate: iso(end) },
    previous: { startDate: iso(end - (2 * days - 1) * DAY), endDate: iso(end - days * DAY) } };
}
