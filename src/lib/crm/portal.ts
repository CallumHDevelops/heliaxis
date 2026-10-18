import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { CRM_BUCKET, thumbPath } from './server';
import { buildTracker } from './tracker';
import { portalOpen } from './stages';
import { stripeConfigured } from '@/lib/stripe';

/** Everything a customer sees in their portal (/my/<token>). Only what's marked visible. */
export async function loadPortal(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('*').eq('portal_token', token).maybeSingle();
  if (!p || !portalOpen(p.stage)) return null;
  const [{ data: c }, { data: docs }, { data: photos }, { data: owner }] = await Promise.all([
    db.from('enquiries').select('id, name, email, phone, postcode').eq('id', p.enquiry_id).maybeSingle(),
    db.from('crm_documents').select('id, category, name, created_at, needs_signature').eq('project_id', p.id).eq('visible', true).order('created_at', { ascending: false }),
    db
      .from('crm_photos')
      .select('id, category, storage_path, caption, created_at')
      .eq('project_id', p.id)
      .in('category', ['progress', 'completion'])
      .order('created_at', { ascending: false })
      .limit(40),
    p.owner_id ? db.from('profiles').select('full_name').eq('id', p.owner_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const paths = (photos ?? []).flatMap((ph) => [ph.storage_path, thumbPath(ph.storage_path)]);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await db.storage.from(CRM_BUCKET).createSignedUrls(paths, 3600);
    for (const x of data ?? []) if (x.path && x.signedUrl) signed.set(x.path, x.signedUrl);
  }
  const quote = (docs ?? []).find((d) => d.needs_signature);
  return {
    token,
    projectId: p.id as string,
    title: p.title as string,
    stage: p.stage as string,
    first: ((c?.name as string) || '').split(/\s+/)[0] || 'there',
    postcode: (p.postcode || c?.postcode || '') as string,
    owner: (owner as { full_name?: string } | null)?.full_name?.split(/\s+/)[0] || null,
    surveyAt: p.survey_at as string | null,
    installAt: p.install_at as string | null,
    tracker: buildTracker({ ...p, products: p.products ?? [] }),
    documents: (docs ?? []).map((d) => ({ id: d.id as string, category: d.category as string, name: d.name as string, at: d.created_at as string })),
    photos: (photos ?? []).map((ph) => ({
      id: ph.id as string,
      thumb: signed.get(thumbPath(ph.storage_path)) ?? signed.get(ph.storage_path) ?? null,
      url: signed.get(ph.storage_path) ?? null,
      caption: ph.caption as string | null,
      category: ph.category as string,
    })),
    quote: quote && !p.accepted_at ? { id: quote.id as string, name: quote.name as string } : null,
    accepted: p.accepted_at ? { at: p.accepted_at as string, name: p.accepted_name as string } : null,
    deposit:
      p.deposit_amount && Number(p.deposit_amount) > 0
        ? { amount: Number(p.deposit_amount), paidAt: p.deposit_paid_at as string | null, canPay: stripeConfigured() }
        : null,
    canBook: false, // surveys happen before the job starts, so before there's a portal
    whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || null,
    email: process.env.MS_MAILBOX || 'hello@heliaxis.co.uk',
  };
}
export type PortalData = NonNullable<Awaited<ReturnType<typeof loadPortal>>>;

/** Portal token → project (id, enquiry, owner, stage). */
export async function projectByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const { data } = await createAdminClient()
    .from('crm_projects')
    .select('id, enquiry_id, owner_id, stage, title, survey_at, deposit_amount, deposit_paid_at, accepted_at, postcode')
    .eq('portal_token', token)
    .maybeSingle();
  return data && portalOpen(data.stage) ? data : null;
}
