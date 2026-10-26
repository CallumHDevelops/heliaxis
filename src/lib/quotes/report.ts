import { cleanContent, profitOf, totalsOf, type Profit } from './types';

/** The margin report: pure maths over quote rows, so it can be tested and used on the server. Internal: costs and profit. */

export type ReportInput = { id: string; number: string; title: string; status: string; sent_at: string | null; accepted_at: string | null; created_at: string; customer: string; project_id: string; content: unknown };
export type ReportRow = { id: string; number: string; title: string; customer: string; project_id: string; status: string; at: string; month: string; gross: number; profit: Profit; belowTarget: boolean };
export type Bucket = { sell: number; cost: number; profit: number; count: number; marginPct: number | null };
export type Report = { rows: ReportRow[]; sent: Bucket; won: Bucket; months: { month: string; sent: Bucket; won: Bucket }[]; target: number };

const empty = (): Bucket => ({ sell: 0, cost: 0, profit: 0, count: 0, marginPct: null });
function add(b: Bucket, p: Profit) {
  b.sell += p.sell;
  b.cost += p.cost;
  b.profit += p.profit;
  b.count++;
  b.marginPct = b.sell > 0 ? (b.profit / b.sell) * 100 : null;
}

export const PERIODS = [
  { key: '3m', label: 'Last 3 months', months: 3 },
  { key: '6m', label: 'Last 6 months', months: 6 },
  { key: '12m', label: 'Last 12 months', months: 12 },
  { key: 'all', label: 'All time', months: 0 },
] as const;

/** First day (YYYY-MM-DD) of the period, or null for all time. `now` is a UTC ISO day. */
export function periodStart(key: string, now: string): string | null {
  const p = PERIODS.find((x) => x.key === key) ?? PERIODS[0];
  if (!p.months) return null;
  const d = new Date(`${now.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - (p.months - 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Sent quotes count by the day they were sent; won ones (signed) by the day they were signed. `targetPct` is the minimum
 * margin wanted (0 = no target): a row under it is flagged.
 */
export function buildReport(inputs: ReportInput[], o: { from: string | null; targetPct: number }): Report {
  const rows: ReportRow[] = [];
  const sent = empty();
  const won = empty();
  const byMonth = new Map<string, { sent: Bucket; won: Bucket }>();
  const slot = (m: string) => byMonth.get(m) ?? byMonth.set(m, { sent: empty(), won: empty() }).get(m)!;
  for (const q of inputs) {
    const content = cleanContent(q.content);
    const profit = profitOf(content);
    const gross = totalsOf(content).gross;
    const isWon = q.status === 'accepted';
    const at = (isWon ? q.accepted_at : q.sent_at) ?? q.sent_at ?? q.created_at;
    if (q.status !== 'sent' && !isWon) continue;
    if (o.from && at.slice(0, 10) < o.from) continue;
    const month = at.slice(0, 7);
    const belowTarget = o.targetPct > 0 && profit.marginPct !== null && profit.marginPct < o.targetPct;
    rows.push({ id: q.id, number: q.number, title: q.title, customer: q.customer, project_id: q.project_id, status: q.status, at, month, gross, profit, belowTarget });
    // A signed quote was also sent, so it counts in both.
    add(sent, profit);
    add(slot(month).sent, profit);
    if (isWon) {
      add(won, profit);
      add(slot(month).won, profit);
    }
  }
  rows.sort((a, b) => b.at.localeCompare(a.at));
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, v]) => ({ month, ...v }));
  return { rows, sent, won, months, target: o.targetPct };
}
