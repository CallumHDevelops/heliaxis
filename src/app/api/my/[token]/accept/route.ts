import { after, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { projectByToken } from '@/lib/crm/portal';
import { DOCS_BUCKET, ensureDocsBucket, isUuid, logActivity } from '@/lib/crm/server';
import { notify } from '@/lib/notify';
import { canAccess } from '@/lib/portals';
import { sendStageToMeta } from '@/lib/meta-capi';

export const dynamic = 'force-dynamic';

/** The customer accepts their quote: typed name + drawn signature, recorded with time and IP. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await projectByToken(token);
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (p.accepted_at) return NextResponse.json({ error: 'This quote has already been accepted.' }, { status: 409 });
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || '').trim().slice(0, 120);
  const docId = String(b.documentId || '');
  const sig = String(b.signature || '');
  if (name.length < 3) return NextResponse.json({ error: 'Type your full name.' }, { status: 400 });
  if (!b.agree) return NextResponse.json({ error: 'Please tick to confirm you accept the quote.' }, { status: 400 });
  if (!sig.startsWith('data:image/png;base64,') || sig.length > 600_000) return NextResponse.json({ error: 'Please sign in the box.' }, { status: 400 });
  const db = createAdminClient();
  if (!isUuid(docId)) return NextResponse.json({ error: 'Quote not found' }, { status: 400 });
  const { data: doc } = await db.from('crm_documents').select('id, name').eq('id', docId).eq('project_id', p.id).eq('needs_signature', true).maybeSingle();
  if (!doc) return NextResponse.json({ error: 'Quote not found' }, { status: 400 });

  await ensureDocsBucket();
  const path = `signatures/${p.id}/${Date.now()}.png`;
  const bytes = Buffer.from(sig.split(',')[1], 'base64');
  const up = await db.storage.from(DOCS_BUCKET).upload(path, bytes, { contentType: 'image/png', upsert: false });
  if (up.error) return NextResponse.json({ error: 'Could not save your signature — please try again.' }, { status: 500 });
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;
  const now = new Date().toISOString();
  const won = ['lead', 'contacted', 'survey_booked', 'surveyed', 'quote_sent'].includes(p.stage);
  await db
    .from('crm_projects')
    .update({
      accepted_at: now,
      accepted_name: name,
      accepted_ip: ip,
      accepted_document_id: doc.id,
      accepted_signature: path,
      ...(won ? { stage: 'won', stage_changed_at: now } : {}),
      updated_at: now,
    })
    .eq('id', p.id);
  if (won) await db.from('enquiries').update({ status: 'won' }).eq('id', p.enquiry_id);
  await logActivity({ enquiryId: p.enquiry_id, projectId: p.id, kind: 'stage', body: `✍️ Quote “${doc.name}” accepted and signed online by ${name}` });

  after(async () => {
    const { data: people } = await db.from('profiles').select('*').eq('status', 'approved');
    const team = (people ?? []).filter((x) => canAccess(x, 'crm')).map((x) => x.id as string);
    await Promise.all(
      team.map((userId) =>
        notify({ userId, kind: 'crm_accepted', title: `🎉 Quote accepted: ${p.title}`, body: `Signed by ${name}`, href: `/admin/crm/${p.id}`, tag: `crm-${p.id}` })
      )
    );
    if (won) await sendStageToMeta(p.id, 'won').catch(() => null);
  });
  return NextResponse.json({ ok: true, deposit: !!(p.deposit_amount && !p.deposit_paid_at) });
}
