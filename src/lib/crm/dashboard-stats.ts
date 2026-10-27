import { isWonStage } from './stages';
import { totalsOf, cleanContent } from '@/lib/quotes/types';

/** The CRM dashboard's numbers: pure maths over rows, so they can be tested. Money is pounds (quotes are kept in pence and converted). */
const pounds = (content: unknown) => totalsOf(cleanContent(content)).gross / 100;

export type DashJob = {
  id: string;
  enquiry_id: string;
  stage: string;
  value: number | null;
  created_at: string;
  first_contact_at: string | null;
  accepted_at: string | null;
  stage_changed_at: string | null;
  project_ref: string | null;
  title: string | null;
};
export type DashQuote = { id: string; number: string; project_id: string; enquiry_id: string; status: string; sent_at: string | null; valid_until: string | null; content: unknown };

export type Dash = {
  days: number;
  sales: { value: number; count: number; prevValue: number; prevCount: number; change: number | null; average: number | null };
  quotes: { liveCount: number; liveValue: number; quotedCount: number; quotedValue: number; rows: { id: string; number: string; projectId: string; customer: string; value: number; sentAt: string | null; validUntil: string | null; pastValid: boolean; ageDays: number }[] };
  response: { n: number; meanMins: number | null; medianMins: number | null; within15: number | null; waiting: number; oldestWaitingMins: number | null };
  enquiries: { count: number };
  wins: { id: string; ref: string | null; customer: string; value: number; at: string }[];
};

const DAY = 86_400_000;
const soldAt = (j: DashJob) => j.accepted_at ?? j.stage_changed_at ?? j.created_at;

export function dashStats(o: { jobs: DashJob[]; quotes: DashQuote[]; names: Map<string, string>; now: number; days: number; today: string }): Dash {
  const { jobs, now, days } = o;
  const from = now - days * DAY;
  const prevFrom = now - 2 * DAY * days;

  // Sales: jobs that are won (from Won onwards), by the day they were sold.
  const sold = jobs.filter((j) => isWonStage(j.stage));
  const inRange = (j: DashJob, a: number, b: number) => {
    const t = Date.parse(soldAt(j));
    return t >= a && t < b;
  };
  const cur = sold.filter((j) => inRange(j, from, now + 1));
  const prev = sold.filter((j) => inRange(j, prevFrom, from));
  const sum = (a: DashJob[]) => a.reduce((n, j) => n + (Number(j.value) || 0), 0);
  const value = sum(cur);
  const prevValue = sum(prev);

  // How long until we first got in touch with each new job.
  const fresh = jobs.filter((j) => Date.parse(j.created_at) >= from);
  const resp = fresh
    .filter((j) => j.first_contact_at)
    .map((j) => Math.max(0, (Date.parse(j.first_contact_at as string) - Date.parse(j.created_at)) / 60_000))
    .sort((a, b) => a - b);
  const waitingJobs = jobs.filter((j) => !j.first_contact_at && j.stage !== 'lost' && !isWonStage(j.stage) && now - Date.parse(j.created_at) < 30 * DAY);
  const oldest = waitingJobs.length ? Math.max(...waitingJobs.map((j) => (now - Date.parse(j.created_at)) / 60_000)) : null;

  // Quotes: live = sent and not past its valid date; quoted = sent in the period.
  const nameOf = (id: string) => o.names.get(id) ?? 'Customer';
  const rows = o.quotes
    .filter((q) => q.status === 'sent')
    .map((q) => ({
      id: q.id,
      number: q.number,
      projectId: q.project_id,
      customer: nameOf(q.enquiry_id),
      value: pounds(q.content),
      sentAt: q.sent_at,
      validUntil: q.valid_until,
      pastValid: !!q.valid_until && q.valid_until < o.today,
      ageDays: q.sent_at ? Math.max(0, Math.floor((now - Date.parse(q.sent_at)) / DAY)) : 0,
    }))
    .sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''));
  const live = rows.filter((r) => !r.pastValid);
  const quotedInPeriod = o.quotes.filter((q) => (q.status === 'sent' || q.status === 'accepted') && q.sent_at && Date.parse(q.sent_at) >= from);

  const wins = [...cur]
    .sort((a, b) => soldAt(b).localeCompare(soldAt(a)))
    .slice(0, 6)
    .map((j) => ({ id: j.id, ref: j.project_ref, customer: nameOf(j.enquiry_id), value: Number(j.value) || 0, at: soldAt(j) }));

  return {
    days,
    sales: { value, count: cur.length, prevValue, prevCount: prev.length, change: prevValue > 0 ? (value - prevValue) / prevValue : null, average: cur.length ? value / cur.length : null },
    quotes: {
      liveCount: live.length,
      liveValue: live.reduce((n, r) => n + r.value, 0),
      quotedCount: quotedInPeriod.length,
      quotedValue: quotedInPeriod.reduce((n, q) => n + pounds(q.content), 0),
      rows,
    },
    response: {
      n: resp.length,
      meanMins: resp.length ? resp.reduce((a, b) => a + b, 0) / resp.length : null,
      medianMins: resp.length ? resp[Math.floor(resp.length / 2)] : null,
      within15: resp.length ? resp.filter((m) => m <= 15).length / resp.length : null,
      waiting: waitingJobs.length,
      oldestWaitingMins: oldest,
    },
    enquiries: { count: fresh.length },
    wins,
  };
}
