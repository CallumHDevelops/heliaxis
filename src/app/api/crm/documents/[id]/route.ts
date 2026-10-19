import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, DOC_CATEGORIES, DOCS_BUCKET, isUuid, json, logActivity, signedDoc } from '@/lib/crm/server';
import { SIGNABLE_CATEGORIES } from '@/lib/crm/portal';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

const SIGNED_QUOTE = 'This is the signed quote. It’s the evidence of the contract, so it can’t be deleted or changed.';

/** The document and its job (null for library files or a missing row). select('*'): crm-v3.sql columns may not exist yet. */
async function docAndJob(id: string) {
  const db = createAdminClient();
  const { data: d } = await db.from('crm_documents').select('*').eq('id', id).maybeSingle();
  if (!d) return null;
  const { data: p } = d.project_id
    ? await db.from('crm_projects').select('id, enquiry_id, accepted_document_id').eq('id', d.project_id).maybeSingle()
    : { data: null };
  return { d, p, signedQuote: !!p && p.accepted_document_id === id };
}

/** Open the file (short-lived signed link). */
export async function GET(req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const { data } = await createAdminClient().from('crm_documents').select('storage_path, name').eq('id', id).maybeSingle();
  if (!data) return json({ error: 'Not found' }, 404);
  const dl = new URL(req.url).searchParams.has('download') ? data.name : undefined;
  const url = await signedDoc(data.storage_path, 300, dl);
  return url ? NextResponse.redirect(url) : json({ error: 'File missing' }, 404);
}

/**
 * Edit a document: visible, needs_signature, name, category. { signed_outside: true, note? } ticks a
 * quote or contract as signed on paper or with another e-sign service (anyone on the CRM; only an
 * admin can untick it). The quote the customer signed in the portal can only be shown or hidden.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const found = await docAndJob(id);
  if (!found) return json({ error: 'Not found' }, 404);
  const { d, p, signedQuote } = found;
  const b = await req.json().catch(() => ({}));
  const u: Record<string, unknown> = {};
  if ('visible' in b) u.visible = !!b.visible;
  if ('name' in b) u.name = String(b.name || '').trim().slice(0, 140) || 'Document';
  if ('category' in b && (DOC_CATEGORIES as readonly string[]).includes(b.category)) u.category = b.category;
  if ('needs_signature' in b) u.needs_signature = !!b.needs_signature && SIGNABLE_CATEGORIES.includes(String(u.category ?? d.category));
  if (signedQuote && Object.keys(u).some((k) => k !== 'visible')) return json({ error: SIGNED_QUOTE }, 409);
  const db = createAdminClient();
  if (Object.keys(u).length) {
    const { error } = await db.from('crm_documents').update(u).eq('id', id);
    if (error) return json({ error: error.message }, 500);
  }

  if ('signed_outside' in b) {
    if (!SIGNABLE_CATEGORIES.includes(String(u.category ?? d.category))) return json({ error: 'Only quotes and contracts can be marked as signed.' }, 400);
    if (signedQuote) return json({ error: 'The customer signed this one in their portal, so it’s already recorded.' }, 409);
    const on = b.signed_outside === true;
    if (!on && !d.signed_outside_at) return json({ ok: true });
    if (!on && s.profile.role !== 'admin') return json({ error: 'Only an admin can untick this: it’s the record that the customer signed.' }, 403);
    const note = String(b.note || '').trim().slice(0, 300) || null;
    // crm-v3.sql columns, in their own update.
    const { error } = await db
      .from('crm_documents')
      .update(
        on
          ? { signed_outside_at: new Date().toISOString(), signed_outside_by: s.user.id, signed_outside_note: note }
          : { signed_outside_at: null, signed_outside_by: null, signed_outside_note: null }
      )
      .eq('id', id);
    if (error) return json({ error: 'Run crm-v3.sql in Supabase first (it’s on your to-do list), then try again.' }, 400);
    if (p) {
      const who = (s.profile.full_name || s.profile.email || 'someone').split(/[\s@]/)[0];
      const what = String(u.category ?? d.category) === 'contract' ? 'Contract' : 'Quote';
      await logActivity({
        enquiryId: p.enquiry_id,
        projectId: p.id,
        kind: 'system',
        body: on
          ? `${what} “${d.name}” marked as signed by ${who}${note ? ` (${note})` : ''}`
          : `${what} “${d.name}” no longer marked as signed (by ${who})`,
        byId: s.user.id,
      });
    }
  }
  return json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const found = await docAndJob(id);
  if (!found) return json({ ok: true });
  if (found.signedQuote) return json({ error: SIGNED_QUOTE }, 409);
  if (found.d.signed_outside_at && s.profile.role !== 'admin') {
    return json({ error: 'This is marked as signed, so only an admin can delete it.' }, 403);
  }
  const db = createAdminClient();
  await db.storage.from(DOCS_BUCKET).remove([found.d.storage_path as string]);
  await db.from('crm_documents').delete().eq('id', id);
  return json({ ok: true });
}
