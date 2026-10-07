import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  bad,
  checkRamsKey,
  noStore,
  RAMS_CATEGORIES,
  s,
  toPortalAssignment,
  toPortalDoc,
} from '@/lib/subcontractors/rams-api';
import { clientIp, DOCS_BUCKET, logEvent } from '@/lib/subcontractors/server';
import type { AssignmentRow, DocumentRow, OperativeRow } from '@/lib/subcontractors/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * RAMS: pull documents for a confirmed assignment. Each file is hashed here
 * (SHA-256 of its bytes) and every hand-over is written to the append-only pull
 * ledger — which file, which fingerprint, which project and RAMS document, who
 * asked. RAMS must check the hash of what it downloads against `sha256`.
 *
 * Default set (no documentIds): the firm's approved company-level cover and
 * registrations, plus approved cards/qualifications of the chosen crew only.
 */
export async function POST(req: Request) {
  const denied = checkRamsKey(req);
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad('Invalid JSON');
  }
  const assignmentId = s(body.assignmentId, 40);
  const pulledBy = (body.pulledBy || {}) as Record<string, unknown>;
  if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) return bad('assignmentId is required');
  const requested = Array.isArray(body.documentIds) ? body.documentIds.map((x) => s(x, 40)).filter(Boolean) : null;
  if (requested && requested.length > 100) return bad('Too many documents');

  const admin = createAdminClient();
  const { data: aData } = await admin.from('subcontractor_assignments').select('*').eq('id', assignmentId).maybeSingle();
  const a = aData as AssignmentRow | null;
  if (!a) return bad('Assignment not found', 404);
  if (a.status !== 'crew_confirmed') return bad(`Assignment is ${a.status.replace('_', ' ')} — crew not confirmed`, 409);

  const { data: sub } = await admin.from('subcontractors').select('id, status').eq('id', a.subcontractor_id).maybeSingle();
  if (!sub || sub.status !== 'active') return bad('Subcontractor not active', 404);

  const [{ data: docData }, { data: opData }] = await Promise.all([
    admin.from('subcontractor_documents').select('*').eq('subcontractor_id', a.subcontractor_id).eq('status', 'approved'),
    admin.from('subcontractor_operatives').select('*').eq('subcontractor_id', a.subcontractor_id),
  ]);
  const approved = ((docData ?? []) as DocumentRow[]).filter((d) => RAMS_CATEGORIES[d.category]);
  const ops = new Map(((opData ?? []) as OperativeRow[]).map((o) => [o.id, o]));

  let chosen: DocumentRow[];
  if (requested) {
    const byId = new Map(approved.map((d) => [d.id, d]));
    const missing = requested.filter((id) => !byId.has(id));
    if (missing.length) return bad(`Not approved or not this firm's: ${missing.join(', ')}`, 409);
    chosen = requested.map((id) => byId.get(id)!);
  } else {
    const crew = new Set(a.crew);
    chosen = approved.filter((d) => RAMS_CATEGORIES[d.category].company || (d.operative_id && crew.has(d.operative_id)));
  }

  const ip = clientIp(req.headers);
  const pulledAt = new Date().toISOString();
  const documents = [];
  for (const doc of chosen) {
    const { data: blob, error } = await admin.storage.from(DOCS_BUCKET).download(doc.storage_path);
    if (error || !blob) return bad(`File unavailable for ${doc.file_name}`, 500);
    const sha256 = createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
    const { data: signed } = await admin.storage.from(DOCS_BUCKET).createSignedUrl(doc.storage_path, 300);
    if (!signed?.signedUrl) return bad(`Could not sign ${doc.file_name}`, 500);

    const portalDoc = toPortalDoc(doc, ops);
    await admin.from('subcontractor_document_pulls').insert({
      subcontractor_id: a.subcontractor_id,
      document_id: doc.id,
      assignment_id: a.id,
      category: doc.category,
      title: portalDoc.title,
      file_name: doc.file_name,
      sha256,
      rams_project_id: a.rams_project_id,
      rams_project_ref: a.rams_project_ref,
      rams_project_name: a.rams_project_name,
      rams_document_id: a.rams_document_id,
      rams_document_title: a.rams_document_title,
      pulled_by_name: s(pulledBy.name, 120) || null,
      pulled_by_email: s(pulledBy.email, 160) || null,
      ip,
      pulled_at: pulledAt,
    });
    documents.push({ ...portalDoc, sha256, url: signed.signedUrl });
  }

  await logEvent(a.subcontractor_id, `rams:${s(pulledBy.email, 160) || 'webhook'}`, 'documents_pulled', {
    project: a.rams_project_name,
    count: documents.length,
  });
  return NextResponse.json(
    { pulledAt, assignment: await toPortalAssignment(a), documents },
    { headers: noStore }
  );
}
