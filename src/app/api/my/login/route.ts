import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { channelsFor, CODE_COOKIE, CODE_MINUTES, contactFor, sendCode, tooMany } from '@/lib/crm/portal-codes';
import { identifierMatches, LOGIN_FAILED, looksLikeIdentifier, looksLikePostcode, postcodeKey, serialsFrom } from '@/lib/crm/portal-login';
import { portalMode } from '@/lib/crm/stages';
import { logSiteEvent } from '@/lib/site/server';
import { valuesOf } from '@/lib/site/values';
import { clientIp } from '@/lib/subcontractors/server';

export const dynamic = 'force-dynamic';

/** Wrong tries from one address in 15 minutes before it has to wait. */
const MAX_FAILED = 8;
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * { id, postcode } → the customer's portal link: a job at that postcode, at a stage with a portal,
 * whose project number, customer surname or inverter serial (last 6: Job details, or scanned on site)
 * matches what they typed. Several: the newest. Wrong tries are logged by address and limited. A match doesn't open
 * the portal: it sends a 6-digit code to the mobile or email on the job, and api/my/login/code opens it.
 * (`serial` is accepted for `id`, as the first version of the page sent it.)
 */
export async function POST(req: Request) {
  const db = createAdminClient();
  const ip = clientIp(req.headers);
  if (ip) {
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count } = await db.from('site_events').select('id', { count: 'exact', head: true }).eq('type', 'portal_login_failed').eq('ip', ip).gte('at', since);
    if ((count ?? 0) >= MAX_FAILED) return json({ error: 'Too many tries. Wait 15 minutes, or use the link we sent you.' }, 429);
  }
  const b = (await req.json().catch(() => ({}))) as { id?: unknown; serial?: unknown; postcode?: unknown; channel?: unknown };
  const typed = String(b.id ?? b.serial ?? '').trim().slice(0, 80);
  const postcode = String(b.postcode ?? '').slice(0, 12);
  const fail = async () => {
    await logSiteEvent(db, null, 'customer', 'portal_login_failed', null, ip);
    return json({ error: LOGIN_FAILED }, 404);
  };
  if (!looksLikeIdentifier(typed) || !looksLikePostcode(postcode)) return fail();

  // The postcode is on the job, or on the enquiry it came from: both are looked at, then compared without spaces.
  const pc = postcodeKey(postcode);
  const spaced = `${pc.slice(0, -3)} ${pc.slice(-3)}`;
  const variants = [pc, spaced, spaced.toLowerCase(), pc.toLowerCase()];
  const { data: enquiries } = await db.from('enquiries').select('id').in('postcode', variants).limit(50);
  const enqIds = (enquiries ?? []).map((e) => String(e.id));
  const cols = 'id, stage, postcode, system, updated_at, project_ref, enquiry_id, contact_id';
  const [{ data: byPostcode }, { data: byEnquiry }] = await Promise.all([
    db.from('crm_projects').select(cols).in('postcode', variants).limit(50),
    enqIds.length ? db.from('crm_projects').select(cols).in('enquiry_id', enqIds).limit(50) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const seen = new Set<string>();
  const jobs = [...((byPostcode ?? []) as Record<string, unknown>[]), ...((byEnquiry ?? []) as Record<string, unknown>[])]
    .filter((j) => !seen.has(String(j.id)) && !!seen.add(String(j.id)))
    .filter((j) => !!portalMode(j.stage as string) && (!j.postcode || postcodeKey(j.postcode as string) === pc))
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  if (!jobs.length) return fail();

  const ids = jobs.map((j) => String(j.id));
  const [{ data: site }, { data: people }] = await Promise.all([
    db.from('site_assignments').select('project_id, answers').in('project_id', ids).neq('status', 'cancelled'),
    db.from('enquiries').select('id, name').in('id', [...new Set(jobs.map((j) => String(j.enquiry_id)))]),
  ]);
  const nameOf = new Map((people ?? []).map((p) => [String(p.id), String(p.name ?? '')]));
  const serialsFor = (id: string, system: Record<string, unknown> | null) => [
    ...serialsFrom(system?.inverter_serial),
    ...(site ?? [])
      .filter((a) => String(a.project_id) === id)
      .flatMap((a) => {
        const v = valuesOf(a.answers as never);
        return [...serialsFrom(v.SN_INV), ...serialsFrom(v.SN_BINV)];
      }),
  ];
  const job = jobs.find((j) =>
    identifierMatches({ ref: (j.project_ref as string | null) ?? null, name: nameOf.get(String(j.enquiry_id)) ?? null, serials: serialsFor(String(j.id), j.system as Record<string, unknown> | null) }, typed)
  );
  if (!job) return fail();

  // Second step (src/lib/crm/portal-codes.ts): a code to the mobile or email already on the job. Nothing about the
  // project is shown until it's typed in (api/my/login/code).
  const projectId = String(job.id);
  const contact = await contactFor(db, { enquiry_id: job.enquiry_id, contact_id: job.contact_id });
  const channels = channelsFor(contact);
  if (!channels.length) return json({ error: 'We can’t send you a sign-in code: we don’t have a mobile number or email for you. Please call us, or use the link we sent you.' }, 409);
  if (await tooMany(db, projectId, ip)) return json({ error: 'We’ve sent several codes already. Wait 15 minutes, or use the link we sent you.' }, 429);
  const want = b.channel === 'email' || b.channel === 'sms' ? b.channel : channels[0].kind;
  const channel = channels.some((c) => c.kind === want) ? want : channels[0].kind;
  const sent = await sendCode(db, { projectId, contact, channel, ip });
  if (!sent.ok) return json({ error: sent.error, channels }, 502);
  await logSiteEvent(db, null, 'customer', 'portal_code_sent', { project_id: projectId, channel }, ip);
  const res = json({ step: 'code', channel, to: sent.to, channels, minutes: CODE_MINUTES });
  res.cookies.set(CODE_COOKIE, sent.id, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/my/login', maxAge: CODE_MINUTES * 60 });
  return res;
}
