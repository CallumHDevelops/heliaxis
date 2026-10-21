import { DOCS_BUCKET, ensureDocsBucket } from '@/lib/crm/server';
import { clientIp, validSignature } from '@/lib/subcontractors/server';
import { deviceSession, isResponse, siteJson, theirAssignment } from '@/lib/site/device';
import { CUSTOMER_SIGN_TITLE, type CustomerSignKind } from '@/lib/site/electrician-shared';
import { logJob, logSiteEvent } from '@/lib/site/server';

export const dynamic = 'force-dynamic';

const KINDS: CustomerSignKind[] = ['completion', 'g98'];
/** A phone's clock more than this far out is replaced by the server's (as at sign-off). */
const CLOCK_SLACK_MS = 72 * 3_600_000;

/**
 * The customer's signature taken on the electrician's phone after their sign-off (P15, D15): one per
 * document, the completion sign-off (HX-HO-08) and on G98 jobs Form B, never the same image twice. Kept
 * with the electrician's sign-off (site_signoffs.extra.customer), the image in crm-docs beside theirs.
 * A retry returns what's there. Before the sign-off has reached the server: try again later.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await deviceSession(req);
  if (isResponse(s)) return s;
  const a = await theirAssignment(s, (await params).id);
  if (isResponse(a)) return a;
  if (a.trade !== 'electrician') return siteJson({ error: 'bad', message: 'Only the electrician’s pack asks the customer to sign.' }, 400);
  const raw = await req.text().catch(() => '');
  if (raw.length > 400_000) return siteJson({ error: 'too_big', message: 'That signature is too big to send.' }, 413);
  let b: Record<string, unknown> = {};
  try {
    b = JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    return siteJson({ error: 'bad', message: 'That signature didn’t arrive whole. Ask them to sign again.' }, 400);
  }
  // A phone still running the earlier app sends the completion sign-off under its old kind (f16e).
  const kind = KINDS.find((k) => k === (b.kind === 'f16e' ? 'completion' : b.kind));
  if (!kind) return siteJson({ error: 'bad', message: 'That signature didn’t make sense.' }, 400);
  const { data: so } = await s.db.from('site_signoffs').select('id, extra').eq('assignment_id', a.id).eq('stage', 'main').maybeSingle();
  // The electrician's sign-off goes first on the phone; until it's here, this waits.
  if (!so) return siteJson({ error: 'busy', message: 'Waiting for your sign-off to send first.' }, 503);
  const extra = (so.extra ?? {}) as Record<string, unknown>;
  const customer = (extra.customer ?? {}) as Record<string, { name: string; signed_at: string }>;
  const had = customer[kind] ?? (kind === 'completion' ? customer.f16e : undefined);
  if (had) return siteJson({ kind, name: had.name, signed_at: had.signed_at, again: true });

  const name = typeof b.name === 'string' ? b.name.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  if (!name) return siteJson({ error: 'bad', message: 'Their name is needed with the signature.' }, 400);
  if (!validSignature(b.signature)) return siteJson({ error: 'bad', message: 'The signature didn’t come through. Ask them to sign again.' }, 400);
  const phoneAt = typeof b.signed_at === 'string' ? Date.parse(b.signed_at) : NaN;
  const signedAt = Number.isFinite(phoneAt) && Math.abs(phoneAt - Date.now()) <= CLOCK_SLACK_MS ? new Date(phoneAt).toISOString() : new Date().toISOString();

  await ensureDocsBucket();
  const path = `signatures/${a.project_id}/site-${so.id}-cust-${kind}.png`;
  const up = await s.db.storage.from(DOCS_BUCKET).upload(path, Buffer.from(String(b.signature).split(',')[1] ?? '', 'base64'), { contentType: 'image/png', upsert: true });
  if (up.error) return siteJson({ error: 'busy', message: 'The signature didn’t save. It will try again.' }, 503);
  const ip = clientIp(req.headers);
  const entry = {
    name,
    signed_at: signedAt,
    received_at: new Date().toISOString(),
    path,
    declaration: typeof b.declaration === 'string' ? b.declaration.trim().slice(0, 2000) : null,
    device: s.device.id,
    ip,
  };
  const { error } = await s.db
    .from('site_signoffs')
    .update({ extra: { ...extra, customer: { ...customer, [kind]: entry } } })
    .eq('id', so.id);
  if (error) return siteJson({ error: 'busy', message: 'The signature didn’t save. It will try again.' }, 503);
  await logSiteEvent(s.db, a.id, 'customer', 'customer_signed', { kind, name, signoff: so.id }, ip);
  await logJob(s.db, a.project_id, `${name} signed on the electrician’s phone: ${CUSTOMER_SIGN_TITLE[kind]}`, { assignment: a.id, kind }, null);
  return siteJson({ kind, name, signed_at: signedAt });
}
