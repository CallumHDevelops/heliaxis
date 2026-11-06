import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { summarise, type RamsStatus, type RamsSummary, type Trade, type TradeRequest } from '../rams/workflow';
import { contextFrom, type InhouseRaw } from './context';
import { headline, slotStates, type SlotView } from './slots';

/** Has supabase/inhouse-docs.sql been run? Without it nothing can be filed to an item, and the pack says so. */
export async function inhouseUploadsReady(db: SupabaseClient): Promise<boolean> {
  const { error } = await db.from('crm_documents').select('inhouse_slot').limit(1);
  return !error;
}

/** The project's RAMS as the pack reads it (the tables may not be there, or may be empty: then there is none). */
async function ramsFacts(db: SupabaseClient, projectId: string): Promise<RamsSummary> {
  const { data: docs, error } = await db.from('rams_documents').select('id, reference, title, status, version, reviewer_id').eq('project_id', projectId).neq('status', 'archived');
  if (error || !docs?.length) return { documents: [], trades: [] };
  const ids = docs.map((d) => String(d.id));
  const reviewerIds = [...new Set(docs.map((d) => d.reviewer_id).filter(Boolean))] as string[];
  const [people, tradeRows, requestRows] = await Promise.all([
    reviewerIds.length ? db.from('profiles').select('id, full_name, email').in('id', reviewerIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
    db.from('rams_trades').select('rams_id, subcontractor_id').in('rams_id', ids),
    db.from('rams_trade_requests').select('rams_id, subcontractor_id, sent_at, signed_at, revoked_at').in('rams_id', ids),
  ]);
  const name = new Map((people.data ?? []).map((p) => [p.id, p.full_name || p.email || null]));
  const subIds = [...new Set((tradeRows.data ?? []).map((t) => String(t.subcontractor_id)))];
  const { data: subs } = subIds.length ? await db.from('subcontractors').select('id, company_name').in('id', subIds) : { data: [] as { id: string; company_name: string }[] };
  const subName = new Map((subs ?? []).map((s) => [String(s.id), String(s.company_name)]));
  const trades: Trade[] = subIds.map((sid) => ({ id: sid, name: subName.get(sid) ?? 'A trade', docIds: (tradeRows.data ?? []).filter((t) => String(t.subcontractor_id) === sid).map((t) => String(t.rams_id)) }));
  const requests: TradeRequest[] = (requestRows.data ?? []).map((r) => ({ tradeId: String(r.subcontractor_id), docId: String(r.rams_id), sentAt: r.sent_at, signedAt: r.signed_at, revokedAt: r.revoked_at }));
  return summarise(
    docs.map((d) => ({ id: String(d.id), reference: String(d.reference), title: String(d.title), status: d.status as RamsStatus, version: Number(d.version), reviewer: d.reviewer_id ? (name.get(String(d.reviewer_id)) ?? null) : null })),
    trades,
    requests
  );
}

/** The In-House pack on a project: every item's state, and the headline. Null when there is no such project. */
export async function inhouseView(db: SupabaseClient, projectId: string): Promise<{ views: SlotView[]; headline: ReturnType<typeof headline>; uploads: boolean } | null> {
  const { data: p } = await db.from('crm_projects').select('products, postcode, stage').eq('id', projectId).maybeSingle();
  if (!p) return null;
  const uploads = await inhouseUploadsReady(db);
  const [docs, orders, photos, rams] = await Promise.all([
    uploads ? db.from('crm_documents').select('id, name, created_at, mime, size, inhouse_slot').eq('project_id', projectId).is('archived_at', null).not('inhouse_slot', 'is', null) : Promise.resolve({ data: [] }),
    db.from('purchase_orders').select('id', { count: 'exact', head: true }).eq('project_id', projectId).neq('status', 'cancelled'),
    db.from('crm_photos').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    ramsFacts(db, projectId),
  ]);
  const raw: InhouseRaw = {
    products: ((p.products as string[] | null) ?? []).map(String),
    postcode: (p.postcode as string | null) ?? null,
    stage: String(p.stage ?? ''),
    docs: (docs.data ?? []) as InhouseRaw['docs'],
    orders: orders.count ?? 0,
    photos: photos.count ?? 0,
    rams,
  };
  const views = slotStates(contextFrom(raw));
  return { views, headline: headline(views), uploads };
}
