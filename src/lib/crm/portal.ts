import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { ukBankHolidays } from '@/lib/bank-holidays';
import { CRM_BUCKET, thumbPath } from './server';
import { buildTracker } from './tracker';
import { portalMode } from './stages';
import { stripeConfigured } from '@/lib/stripe';
import { portalHandover } from '@/lib/handover/portal';

const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

/** Document types a customer can be asked to sign in the portal. */
export const SIGNABLE_CATEGORIES = ['quote', 'contract'];

type DocRow = {
  id: string;
  category: string;
  name: string;
  mime?: string | null;
  created_at: string;
  visible: boolean;
  needs_signature: boolean;
  /** crm-v3.sql: ticked as signed on paper or with another e-sign service. */
  signed_outside_at?: string | null;
};

/** Signed in the portal, or a quote or contract ticked as signed outside it. */
const isSigned = (p: { accepted_at?: unknown }, docs: DocRow[]) =>
  !!p.accepted_at || docs.some((d) => d.signed_outside_at && SIGNABLE_CATEGORIES.includes(d.category));

/**
 * Everything a customer sees at /my/<token>. Two modes (portalMode):
 * - 'quote' (Quote sent): only their first name, the job title, who's looking after them, the quote
 *   to sign (even if it isn't marked visible), the deposit once signed, and how to get in touch.
 *   No tracker, dates, photos or other documents.
 * - 'full' (Won onwards): progress, dates, documents marked visible (handover pack first, as its own
 *   section once handover.sql has run) and photos.
 */
export async function loadPortal(token: string) {
  if (!TOKEN.test(token)) return null;
  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('*').eq('portal_token', token).maybeSingle();
  const mode = portalMode(p?.stage as string | undefined);
  if (!p || !mode) return null;
  const full = mode === 'full';
  const multiDayInstall = !!p.install_at && Number(p.install_days ?? 1) > 1;
  const [{ data: c }, { data: docRows }, { data: photos }, { data: owner }, hols] = await Promise.all([
    db.from('enquiries').select('id, name, postcode').eq('id', p.enquiry_id).maybeSingle(),
    db.from('crm_documents').select('*').eq('project_id', p.id).order('created_at', { ascending: false }),
    full
      ? db
          .from('crm_photos')
          .select('id, category, storage_path, caption, created_at')
          .eq('project_id', p.id)
          .in('category', ['progress', 'completion'])
          .order('created_at', { ascending: false })
          .limit(40)
      : Promise.resolve({ data: [] as { id: string; category: string; storage_path: string; caption: string | null }[] }),
    p.owner_id ? db.from('profiles').select('full_name').eq('id', p.owner_id).maybeSingle() : Promise.resolve({ data: null }),
    full && multiDayInstall ? ukBankHolidays() : Promise.resolve(new Set<string>()),
  ]);
  const paths = (photos ?? []).flatMap((ph) => [ph.storage_path, thumbPath(ph.storage_path)]);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await db.storage.from(CRM_BUCKET).createSignedUrls(paths, 3600);
    for (const x of data ?? []) if (x.path && x.signedUrl) signed.set(x.path, x.signedUrl);
  }
  const docs = (docRows ?? []) as DocRow[];
  // The newest quote or contract marked "needs signing" (Send quote for signing marks only one). Only the
  // quote-only page shows one that isn't in their portal; the full portal keeps to visible documents.
  const toSign = docs.find((d) => d.needs_signature && (!full || d.visible) && SIGNABLE_CATEGORIES.includes(d.category));
  const acceptedDoc = p.accepted_document_id ? docs.find((d) => d.id === p.accepted_document_id) : undefined;
  // An archived version (a generated document replaced since) is never shown, whatever its flag says.
  const visible = full ? docs.filter((d) => d.visible && !(d as { archived_at?: string | null }).archived_at) : [];
  // Once handover.sql has run, the handover pack is its own section, grouped and in pack order
  // (src/lib/handover/portal.ts); the documents in it aren't listed again below.
  const handover = full ? await portalHandover(p.id).catch(() => null) : null;
  const inPack = new Set(handover?.ids ?? []);
  const ordered = handover
    ? visible.filter((d) => !inPack.has(d.id) && !(d as { handover_slot?: string | null }).handover_slot && d.category !== 'handover')
    : [...visible.filter((d) => d.category === 'handover'), ...visible.filter((d) => d.category !== 'handover')];
  const amount = Number(p.deposit_amount) || 0;
  const hasSigned = isSigned(p, docs);
  return {
    token,
    mode,
    projectId: p.id as string,
    title: p.title as string,
    stage: p.stage as string,
    first: ((c?.name as string) || '').split(/\s+/)[0] || 'there',
    postcode: full ? ((p.postcode || c?.postcode || '') as string) : '',
    owner: (owner as { full_name?: string } | null)?.full_name?.split(/\s+/)[0] || null,
    surveyAt: full ? (p.survey_at as string | null) : null,
    installAt: full ? (p.install_at as string | null) : null,
    tracker: full ? buildTracker({ ...p, products: p.products ?? [] }, hols) : [],
    documents: ordered.map((d) => ({ id: d.id, category: d.category, name: d.name, at: d.created_at })),
    handover,
    photos: (photos ?? []).map((ph) => ({
      id: ph.id as string,
      thumb: signed.get(thumbPath(ph.storage_path)) ?? signed.get(ph.storage_path) ?? null,
      url: signed.get(ph.storage_path) ?? null,
      caption: ph.caption as string | null,
      category: ph.category as string,
    })),
    quote: toSign && !p.accepted_at ? { id: toSign.id, name: toSign.name, category: toSign.category, pdf: toSign.mime === 'application/pdf' } : null,
    accepted: p.accepted_at
      ? {
          at: p.accepted_at as string,
          name: p.accepted_name as string,
          document: acceptedDoc ? { id: acceptedDoc.id, name: acceptedDoc.name } : null,
        }
      : null,
    // In quote mode the deposit only appears once they've signed. Card payment needs a signature in every mode.
    deposit:
      amount > 0 && (full || p.accepted_at)
        ? { amount, paidAt: p.deposit_paid_at as string | null, canPay: stripeConfigured() && hasSigned }
        : null,
    whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || null,
    email: process.env.MS_MAILBOX || 'hello@heliaxis.co.uk',
  };
}
export type PortalData = NonNullable<Awaited<ReturnType<typeof loadPortal>>>;

/** Portal token → project (id, enquiry, owner, stage) and its mode ('quote' or 'full'). */
export async function projectByToken(token: string) {
  if (!TOKEN.test(token)) return null;
  const { data } = await createAdminClient()
    .from('crm_projects')
    .select('id, enquiry_id, owner_id, stage, title, survey_at, deposit_amount, deposit_paid_at, accepted_at, accepted_document_id, postcode')
    .eq('portal_token', token)
    .maybeSingle();
  const mode = portalMode(data?.stage);
  return data && mode ? { ...data, mode } : null;
}

/** What staff send with the quote-only link (WhatsApp it / Email it). */
export function quoteMessages(o: { first: string; url: string; category: string; from: string }) {
  const hi = o.first ? `Hi ${o.first}` : 'Hi';
  const what = o.category === 'contract' ? 'contract' : 'quote';
  const cancel = 'You can change your mind and cancel within 14 days of signing, free of charge.';
  return {
    whatsappText: `${hi}, your Heliaxis ${what} is ready. You can read it and sign it on your phone here: ${o.url}\n\n${cancel} Any questions, just reply here.`,
    emailSubject: `Your Heliaxis ${what}`,
    emailText: `${hi},\n\nYour ${what} from Heliaxis is ready. You can read it and sign it online here:\n${o.url}\n\n${cancel}\n\nAny questions, just reply to this email.\n\nThanks,\n${o.from || 'The Heliaxis team'}\nHeliaxis`,
  };
}

/** Signed in the portal, or a quote or contract on the job ticked as signed outside it. */
export async function projectSigned(p: { id: string; accepted_at?: string | null }): Promise<boolean> {
  if (p.accepted_at) return true;
  const { data } = await createAdminClient().from('crm_documents').select('*').eq('project_id', p.id);
  return isSigned(p, (data ?? []) as DocRow[]);
}
