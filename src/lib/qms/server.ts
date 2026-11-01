import 'server-only';
import { requirePortal } from '@/lib/auth';
import { ukDay } from '@/lib/bank-holidays';
import { createAdminClient } from '@/lib/supabase/admin';
import { canApprove, failCount, runChecks, warnCount, type Check } from './checks';
import {
  DOC_COLUMNS, RECORD_COLUMNS,
  type QmsComment, type QmsDoc, type QmsRecord, type QmsReview, type QmsRevision,
} from './types';

export const ukToday = () => ukDay(Date.now());

/** Everyone with the CRM portal can read the QMS and comment; only admins approve, import and write with Claude. */
export async function qmsSession() {
  const s = await requirePortal('crm');
  if (!s) return null;
  const name = s.profile.full_name || s.profile.email || 'Someone';
  return { name, admin: s.profile.role === 'admin' };
}

/** A register row: the document without its text, plus what the checker found. */
export type QmsRow = Omit<QmsDoc, 'body_md'> & { hasBody: boolean; fails: number; warns: number; openComments: number; addressed: number };

export type QmsOverview = { rows: QmsRow[]; records: QmsRecord[]; today: string };

export async function loadOverview(): Promise<QmsOverview> {
  const db = createAdminClient();
  const today = ukToday();
  const [{ data: docs }, { data: comments }, { data: records }] = await Promise.all([
    db.from('qms_documents').select(DOC_COLUMNS).order('ref'),
    db.from('qms_comments').select('document_id, status').neq('status', 'resolved'),
    db.from('qms_records').select(RECORD_COLUMNS).order('created_at', { ascending: false }).limit(1000),
  ]);
  const all = (docs ?? []) as QmsDoc[];
  const by = new Map<string, { status: QmsComment['status'] }[]>();
  for (const c of (comments ?? []) as { document_id: string; status: QmsComment['status'] }[]) by.set(c.document_id, [...(by.get(c.document_id) ?? []), c]);
  const rows = all.map((d) => {
    const cs = by.get(d.id) ?? [];
    const checks = runChecks(d, { docs: all, comments: cs, today });
    const { body_md, ...rest } = d;
    return { ...rest, hasBody: !!body_md?.trim(), fails: failCount(checks), warns: warnCount(checks), openComments: cs.filter((c) => c.status === 'open').length, addressed: cs.filter((c) => c.status === 'addressed').length };
  });
  return { rows, records: (records ?? []) as QmsRecord[], today };
}

export type QmsDetail = { doc: QmsDoc; comments: QmsComment[]; revisions: QmsRevision[]; reviews: QmsReview[]; checks: Check[]; canApprove: boolean };

export async function loadDetail(id: string): Promise<QmsDetail | null> {
  const db = createAdminClient();
  const [{ data: doc }, { data: docs }, { data: comments }, { data: revisions }, { data: reviews }] = await Promise.all([
    db.from('qms_documents').select(DOC_COLUMNS).eq('id', id).maybeSingle(),
    db.from('qms_documents').select('id, kind, ref, status'),
    db.from('qms_comments').select('*').eq('document_id', id).order('created_at'),
    db.from('qms_revisions').select('id, document_id, revision, revision_date, title, note, created_by, created_at').eq('document_id', id).order('created_at', { ascending: false }),
    db.from('qms_reviews').select('*').eq('document_id', id).order('created_at', { ascending: false }),
  ]);
  if (!doc) return null;
  const cs = (comments ?? []) as QmsComment[];
  const checks = runChecks(doc as QmsDoc, { docs: (docs ?? []) as QmsDoc[], comments: cs, today: ukToday() });
  return { doc: doc as QmsDoc, comments: cs, revisions: (revisions ?? []) as QmsRevision[], reviews: (reviews ?? []) as QmsReview[], checks, canApprove: canApprove(checks) };
}
