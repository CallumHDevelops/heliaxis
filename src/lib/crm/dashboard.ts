import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { schemaReady } from '@/lib/schema-ready';
import { ukDay } from '@/lib/bank-holidays';
import { dashStats, type Dash, type DashJob, type DashQuote } from './dashboard-stats';

const COLS = 'id, enquiry_id, stage, value, created_at, first_contact_at, accepted_at, stage_changed_at, project_ref, title';
const COLS_OLD = 'id, enquiry_id, stage, value, created_at, accepted_at, stage_changed_at, title';

/** The numbers for the CRM dashboard over the last `days` days (and the same length before, for comparison). */
export async function loadDashboard(days: number, now = Date.now()): Promise<Dash> {
  const db = createAdminClient();
  const prevFrom = new Date(now - 2 * days * 86_400_000).toISOString();
  const pick = (cols: string) =>
    db
      .from('crm_projects')
      .select(cols)
      .or(`created_at.gte.${prevFrom},stage_changed_at.gte.${prevFrom},accepted_at.gte.${prevFrom}`)
      .order('updated_at', { ascending: false })
      .limit(5000);
  // The first-contact and reference columns come with crm-v2/v3.sql: older databases have the rest.
  let r = await pick(COLS);
  if (r.error) r = await pick(COLS_OLD);
  const jobs = ((r.error ? [] : (r.data ?? [])) as unknown as Partial<DashJob>[]).map((j) => ({ first_contact_at: null, project_ref: null, ...j }) as DashJob);

  let quotes: DashQuote[] = [];
  if ((await schemaReady()).quotes) {
    const q = await db.from('crm_quotes').select('id, number, project_id, enquiry_id, status, sent_at, valid_until, content').in('status', ['sent', 'accepted']).order('sent_at', { ascending: false }).limit(1000);
    quotes = (q.data ?? []) as DashQuote[];
  }
  const ids = [...new Set([...jobs.map((j) => j.enquiry_id), ...quotes.map((x) => x.enquiry_id)])];
  const names = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from('enquiries').select('id, name').in('id', ids.slice(i, i + 200));
    for (const e of data ?? []) names.set(e.id as string, (e.name as string) || 'Customer');
  }
  return dashStats({ jobs, quotes, names, now, days, today: ukDay(now) });
}
