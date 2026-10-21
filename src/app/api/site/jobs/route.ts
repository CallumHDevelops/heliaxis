import { deviceSession, isResponse, siteJson } from '@/lib/site/device';
import { siteShort } from '@/lib/site/messages';
import type { SiteJobRow } from '@/lib/site/pack-shared';
import { assignmentRow } from '@/lib/site/server';
import { STATUS_LABEL, TRADE_LABEL } from '@/lib/site/types';

export const dynamic = 'force-dynamic';

/**
 * Home (P3): every Heliaxis job for the person this phone belongs to, newest first, with the PO
 * and what they'll be paid on signed ones (and when it was paid, once the office records it).
 * Cancelled jobs from the last 30 days are included so a phone that has one sees it was cancelled.
 */
export async function GET(req: Request) {
  const s = await deviceSession(req);
  if (isResponse(s)) return s;
  const { data: rows } = await s.db.from('site_assignments').select('*').eq('contact_id', s.contact.id).order('created_at', { ascending: false }).limit(100);
  const recent = Date.now() - 30 * 86_400_000;
  const list = (rows ?? []).map(assignmentRow).filter((a) => a.status !== 'cancelled' || Date.parse(a.cancelled_at ?? a.updated_at) > recent);
  const projectIds = [...new Set(list.map((a) => a.project_id))];
  const ids = list.map((a) => a.id);
  const [{ data: projects }, { data: orders }, { data: returns }] = await Promise.all([
    projectIds.length ? s.db.from('crm_projects').select('id, address, postcode, project_ref').in('id', projectIds) : Promise.resolve({ data: [] }),
    ids.length ? s.db.from('purchase_orders').select('*').in('assignment_id', ids).neq('status', 'cancelled') : Promise.resolve({ data: [] }),
    ids.length ? s.db.from('site_returns').select('assignment_id, n, fix_by').in('assignment_id', ids).eq('status', 'open') : Promise.resolve({ data: [] }),
  ]);
  // A return to site waiting for their put right (the newest, if there are two).
  const putRight = new Map<string, { n: number; fix_by: string }>();
  for (const r of (returns ?? []) as { assignment_id: string; n: number; fix_by: string }[]) {
    const was = putRight.get(r.assignment_id);
    if (!was || Number(r.n) > was.n) putRight.set(r.assignment_id, { n: Number(r.n), fix_by: String(r.fix_by).slice(0, 10) });
  }
  const job = new Map(((projects ?? []) as { id: string; address: string | null; postcode: string | null; project_ref: string | null }[]).map((p) => [p.id, p]));
  const poOf = new Map(((orders ?? []) as Record<string, unknown>[]).map((o) => [String(o.assignment_id), o]));
  const jobs: SiteJobRow[] = list.map((a) => {
    const p = job.get(a.project_id);
    const o = poOf.get(a.id);
    return {
      id: a.id,
      trade: a.trade,
      title: a.trade === 'other' ? a.trade_label || TRADE_LABEL.other : TRADE_LABEL[a.trade],
      status: a.status,
      status_label: STATUS_LABEL[a.status] ?? a.status,
      starts_on: a.starts_on,
      site: siteShort(p?.address, p?.postcode),
      ref: p?.project_ref ?? null,
      rev: a.rev,
      signed_at: a.signed_at,
      done_at: a.done_at,
      po: o
        ? {
            po_number: String(o.po_number),
            status: String(o.status),
            payable_pence: o.payable_pence == null ? null : Number(o.payable_pence),
            sent_at: (o.sent_at as string | null) ?? null,
            paid_on: (o.paid_on as string | null) ?? null,
            review_status: o.review_status === 'waiting' || o.review_status === 'hold' || o.review_status === 'green' ? o.review_status : null,
          }
        : null,
      put_right: putRight.get(a.id) ?? null,
    };
  });
  return siteJson({ contact: { name: s.contact.name, first: s.contact.name.split(/\s+/)[0] }, jobs });
}
