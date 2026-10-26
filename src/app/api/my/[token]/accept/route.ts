import { after, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { projectByToken, SIGNABLE_CATEGORIES } from '@/lib/crm/portal';
import { DOCS_BUCKET, ensureDocsBucket, fingerprintDocument, isUuid, logActivity } from '@/lib/crm/server';
import { applyStageEvent } from '@/lib/crm/move-stage';
import { notify } from '@/lib/notify';
import { saveSignedQuote } from '@/lib/quotes/server';
import { canAccess } from '@/lib/portals';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * The customer signs their quote (on the quote-only page or in the full portal): typed name + drawn
 * signature, recorded with time and IP. Only the first signature counts, so two quick taps record
 * one. Signing moves the job to Won, which opens the full portal on the same link.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await projectByToken(token);
  if (!p) return fail('Not found', 404);
  if (p.accepted_at) return fail('This quote has already been accepted.', 409);
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || '').trim().slice(0, 120);
  const docId = String(b.documentId || '');
  const sig = String(b.signature || '');
  if (name.length < 3) return fail('Type your full name.', 400);
  if (!b.agree) return fail('Please tick to confirm you accept the quote.', 400);
  if (!sig.startsWith('data:image/png;base64,') || sig.length > 600_000) return fail('Please sign in the box.', 400);
  const db = createAdminClient();
  if (!isUuid(docId)) return fail('Quote not found', 400);
  let lookup = db
    .from('crm_documents')
    .select('*')
    .eq('id', docId)
    .eq('project_id', p.id)
    .eq('needs_signature', true)
    .in('category', SIGNABLE_CATEGORIES);
  // The full portal only offers documents marked visible; the quote-only page offers the quote that was sent.
  if (p.mode === 'full') lookup = lookup.eq('visible', true);
  const { data: doc } = await lookup.maybeSingle();
  if (!doc) return fail('Quote not found', 400);

  await ensureDocsBucket();
  const path = `signatures/${p.id}/${Date.now()}.png`;
  const bytes = Buffer.from(sig.split(',')[1], 'base64');
  const up = await db.storage.from(DOCS_BUCKET).upload(path, bytes, { contentType: 'image/png', upsert: false });
  if (up.error) return fail('Could not save your signature. Please try again.', 500);
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;
  const now = new Date().toISOString();
  // Only if nobody has signed in the meantime (a second tap, or another phone).
  const { data: signed } = await db
    .from('crm_projects')
    .update({ accepted_at: now, accepted_name: name, accepted_ip: ip, accepted_document_id: doc.id, accepted_signature: path, updated_at: now })
    .eq('id', p.id)
    .is('accepted_at', null)
    .select('id');
  if (!signed?.length) {
    await db.storage.from(DOCS_BUCKET).remove([path]);
    return fail('This quote has already been accepted.', 409);
  }
  // crm-v3.sql columns go in their own update, so signing still works before it's been run.
  const startEarly = b.startEarly === true;
  const hash = (doc.sha256 as string | null | undefined) || null;
  await db
    .from('crm_projects')
    .update({ accepted_start_early: startEarly, ...(hash ? { accepted_hash: hash } : {}) })
    .eq('id', p.id);
  await logActivity({
    enquiryId: p.enquiry_id,
    projectId: p.id,
    kind: 'stage',
    body: `✍️ Quote “${doc.name}” accepted and signed online by ${name}${startEarly ? '. They asked us to start within the 14 days' : ''}`,
  });
  await applyStageEvent(p.id, 'accepted', { note: 'signed online' });
  // A quote made in the builder: now accepted (no table yet, or an uploaded quote: nothing to update).
  await db.from('crm_quotes').update({ status: 'accepted', updated_at: now }).eq('document_id', doc.id).then(() => null, () => null);

  after(async () => {
    await saveSignedQuote(doc.id as string, { name, at: now, signaturePath: path }).catch(() => null);
    if (!hash) {
      const h = await fingerprintDocument(doc.id as string);
      if (h) await db.from('crm_projects').update({ accepted_hash: h }).eq('id', p.id);
    }
    const { data: people } = await db.from('profiles').select('*').eq('status', 'approved');
    const team = (people ?? []).filter((x) => canAccess(x, 'crm')).map((x) => x.id as string);
    await Promise.all(
      team.map((userId) =>
        notify({ userId, kind: 'crm_accepted', title: `🎉 Quote accepted: ${p.title}`, body: `Signed by ${name}`, href: `/admin/crm/${p.id}`, tag: `crm-${p.id}` })
      )
    );
  });
  return NextResponse.json({ ok: true, deposit: Number(p.deposit_amount) > 0 && !p.deposit_paid_at }, { headers: { 'Cache-Control': 'no-store' } });
}
