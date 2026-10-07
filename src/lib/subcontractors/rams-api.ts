import 'server-only';
import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CATEGORY_BY_KEY, expiryState } from './documents';
import { SUB_COLUMNS, type AssignmentRow, type DocumentRow, type OperativeRow, type SubcontractorRow } from './types';

/**
 * Server-to-server API the RAMS app (rams.heliaxis.co.uk) uses to read
 * subcontractors, book them onto jobs and PULL their approved documents.
 *
 * Auth: `Authorization: Bearer <PORTAL_API_KEY>` — a shared secret set on both
 * Vercel projects, compared in constant time. Nothing here is reachable from a
 * browser session. Only ever exposes countersigned (active) firms and APPROVED
 * documents of the kinds RAMS needs; photo ID, bank details and the agreement
 * are never returned.
 */

export const RAMS_CATEGORIES: Record<string, { kind: 'insurance' | 'competency'; insuranceKind: string | null; company: boolean }> = {
  insurance_pl: { kind: 'insurance', insuranceKind: 'public_liability', company: true },
  insurance_el: { kind: 'insurance', insuranceKind: 'employers_liability', company: true },
  insurance_pi: { kind: 'insurance', insuranceKind: 'professional_indemnity', company: true },
  insurance_tools: { kind: 'insurance', insuranceKind: 'other', company: true },
  registration: { kind: 'competency', insuranceKind: null, company: true },
  card: { kind: 'competency', insuranceKind: null, company: false },
  qualification: { kind: 'competency', insuranceKind: null, company: false },
};

const INSURANCE_TITLE: Record<string, string> = {
  insurance_pl: 'Public Liability',
  insurance_el: "Employers' Liability",
  insurance_pi: 'Professional Indemnity',
  insurance_tools: 'Tools & equipment insurance',
};

export function ramsApiConfigured() {
  return (process.env.PORTAL_API_KEY || '').length >= 32;
}

/** Returns an error response, or null when the bearer key is valid. */
export function checkRamsKey(req: Request): NextResponse | null {
  const key = process.env.PORTAL_API_KEY || '';
  if (key.length < 32) return NextResponse.json({ error: 'Portal API is not configured' }, { status: 503 });
  const header = req.headers.get('authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  // Hash both so lengths match and the comparison is constant-time.
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(key).digest();
  if (!given || !timingSafeEqual(a, b)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return null;
}

export const noStore = { 'Cache-Control': 'no-store' };

export function parseCover(raw: string | null | undefined): number | null {
  const s = (raw || '').toLowerCase().replace(/[£,\s]/g, '');
  const m = s.match(/^(\d+(?:\.\d+)?)(m|million|k|thousand)?/);
  if (!m) return null;
  const mult = m[2]?.startsWith('m') ? 1_000_000 : m[2] ? 1_000 : 1;
  return Math.round(parseFloat(m[1]) * mult);
}

function postcodeOf(address?: string) {
  return address?.match(/([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*$/i)?.[1]?.toUpperCase() ?? null;
}

export function toPortalOperative(o: OperativeRow) {
  return { id: o.id, fullName: o.full_name, role: o.role, phone: o.phone, email: o.email };
}

export function toPortalDoc(d: DocumentRow, ops: Map<string, OperativeRow>) {
  const meta = RAMS_CATEGORIES[d.category];
  const op = d.operative_id ? ops.get(d.operative_id) : undefined;
  return {
    id: d.id,
    category: d.category,
    kind: meta.kind,
    insuranceKind: meta.insuranceKind,
    title: INSURANCE_TITLE[d.category] || d.label || CATEGORY_BY_KEY[d.category]?.label || d.file_name,
    holderName: meta.company ? null : op?.full_name || d.operative_name || null,
    operativeId: meta.company ? null : d.operative_id ?? null,
    reference: d.reference,
    coverAmount: meta.kind === 'insurance' ? parseCover(d.cover_amount) : null,
    expiresOn: d.expires_on,
    expired: expiryState(d.expires_on) === 'expired',
    fileName: d.file_name,
    mime: d.mime,
    sizeBytes: d.size_bytes,
    uploadedAt: d.uploaded_at,
    approvedAt: d.reviewed_at,
  };
}

export function toPortalFirm(sub: SubcontractorRow, ops: OperativeRow[], docs: DocumentRow[]) {
  const d = sub.details || {};
  const opMap = new Map(ops.map((o) => [o.id, o]));
  return {
    id: sub.id,
    ref: sub.ref,
    companyName: sub.company_name,
    tradingName: d.legalName && d.legalName !== sub.company_name ? d.legalName : null,
    trade: sub.trade,
    contactName: d.primaryContact || sub.contact_name,
    email: sub.email,
    phone: d.phone || sub.phone,
    address: d.registeredAddress || null,
    postcode: postcodeOf(d.registeredAddress),
    companyNumber: d.companyNumber || null,
    vatNumber: d.vatNumber || null,
    operatives: ops.filter((o) => !o.archived_at).map(toPortalOperative),
    documents: docs
      .filter((x) => x.status === 'approved' && RAMS_CATEGORIES[x.category])
      .map((x) => toPortalDoc(x, opMap)),
  };
}

/** Active firms with their operatives + approved RAMS-relevant documents. */
export async function loadPortalFirms(onlyId?: string) {
  const admin = createAdminClient();
  let q = admin.from('subcontractors').select(SUB_COLUMNS).eq('status', 'active').order('company_name');
  if (onlyId) q = q.eq('id', onlyId);
  const { data: subs, error } = await q;
  if (error) throw new Error(error.message);
  const ids = ((subs ?? []) as SubcontractorRow[]).map((s) => s.id);
  if (!ids.length) return [];
  const [{ data: ops }, { data: docs }] = await Promise.all([
    admin.from('subcontractor_operatives').select('*').in('subcontractor_id', ids).order('full_name'),
    admin.from('subcontractor_documents').select('*').in('subcontractor_id', ids).eq('status', 'approved'),
  ]);
  return ((subs ?? []) as SubcontractorRow[]).map((s) =>
    toPortalFirm(
      s,
      ((ops ?? []) as OperativeRow[]).filter((o) => o.subcontractor_id === s.id),
      ((docs ?? []) as DocumentRow[]).filter((d) => d.subcontractor_id === s.id)
    )
  );
}

export async function toPortalAssignment(a: AssignmentRow) {
  const admin = createAdminClient();
  const [{ data: sub }, { data: crew }] = await Promise.all([
    admin.from('subcontractors').select('ref, company_name').eq('id', a.subcontractor_id).maybeSingle(),
    a.crew.length
      ? admin.from('subcontractor_operatives').select('*').in('id', a.crew)
      : Promise.resolve({ data: [] as OperativeRow[] }),
  ]);
  return {
    id: a.id,
    status: a.status,
    subcontractorId: a.subcontractor_id,
    subcontractorRef: sub?.ref ?? null,
    companyName: sub?.company_name ?? null,
    project: { id: a.rams_project_id, ref: a.rams_project_ref, name: a.rams_project_name, siteAddress: a.site_address },
    document: { id: a.rams_document_id, title: a.rams_document_title },
    scope: a.scope,
    startDate: a.start_date,
    crew: ((crew ?? []) as OperativeRow[]).map(toPortalOperative),
    declineReason: a.decline_reason,
    confirmedAt: a.confirmed_at,
    createdAt: a.created_at,
  };
}

export function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: noStore });
}

export function s(v: unknown, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
