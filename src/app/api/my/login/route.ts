import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensurePortalToken } from '@/lib/crm/server';
import { LOGIN_FAILED, looksLikePostcode, looksLikeSerialEnd, postcodeKey, serialEndMatches, serialsFrom } from '@/lib/crm/portal-login';
import { portalMode } from '@/lib/crm/stages';
import { logSiteEvent } from '@/lib/site/server';
import { valuesOf } from '@/lib/site/values';
import { clientIp } from '@/lib/subcontractors/server';

export const dynamic = 'force-dynamic';

/** Wrong tries from one address in 15 minutes before it has to wait. */
const MAX_FAILED = 8;
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * { serial, postcode } → the customer's portal link: a job at that postcode, at a stage with a portal,
 * whose inverter serial (Job details, or scanned on site: the inverter or the battery's own inverter)
 * ends in the 6 characters typed. Several: the newest. Wrong tries are logged by address and limited.
 */
export async function POST(req: Request) {
  const db = createAdminClient();
  const ip = clientIp(req.headers);
  if (ip) {
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count } = await db.from('site_events').select('id', { count: 'exact', head: true }).eq('type', 'portal_login_failed').eq('ip', ip).gte('at', since);
    if ((count ?? 0) >= MAX_FAILED) return json({ error: 'Too many tries. Wait 15 minutes, or use the link we sent you.' }, 429);
  }
  const b = (await req.json().catch(() => ({}))) as { serial?: unknown; postcode?: unknown };
  const serial = String(b.serial ?? '').slice(0, 20);
  const postcode = String(b.postcode ?? '').slice(0, 12);
  const fail = async () => {
    await logSiteEvent(db, null, 'customer', 'portal_login_failed', null, ip);
    return json({ error: LOGIN_FAILED }, 404);
  };
  if (!looksLikeSerialEnd(serial) || !looksLikePostcode(postcode)) return fail();

  // The postcode is on the job, or on the enquiry it came from: both are looked at, then compared without spaces.
  const pc = postcodeKey(postcode);
  const spaced = `${pc.slice(0, -3)} ${pc.slice(-3)}`;
  const variants = [pc, spaced, spaced.toLowerCase(), pc.toLowerCase()];
  const { data: enquiries } = await db.from('enquiries').select('id').in('postcode', variants).limit(50);
  const enqIds = (enquiries ?? []).map((e) => String(e.id));
  const [{ data: byPostcode }, { data: byEnquiry }] = await Promise.all([
    db.from('crm_projects').select('id, stage, postcode, system, updated_at').in('postcode', variants).limit(50),
    enqIds.length ? db.from('crm_projects').select('id, stage, postcode, system, updated_at').in('enquiry_id', enqIds).limit(50) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const seen = new Set<string>();
  const jobs = [...((byPostcode ?? []) as Record<string, unknown>[]), ...((byEnquiry ?? []) as Record<string, unknown>[])]
    .filter((j) => !seen.has(String(j.id)) && !!seen.add(String(j.id)))
    .filter((j) => !!portalMode(j.stage as string) && (!j.postcode || postcodeKey(j.postcode as string) === pc))
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  if (!jobs.length) return fail();

  const { data: site } = await db.from('site_assignments').select('project_id, answers').in('project_id', jobs.map((j) => String(j.id))).neq('status', 'cancelled');
  const serialsFor = (id: string, system: Record<string, unknown> | null) => [
    ...serialsFrom(system?.inverter_serial),
    ...(site ?? [])
      .filter((a) => String(a.project_id) === id)
      .flatMap((a) => {
        const v = valuesOf(a.answers as never);
        return [...serialsFrom(v.SN_INV), ...serialsFrom(v.SN_BINV)];
      }),
  ];
  const job = jobs.find((j) => serialEndMatches(serialsFor(String(j.id), j.system as Record<string, unknown> | null), serial));
  if (!job) return fail();
  const token = await ensurePortalToken(String(job.id));
  if (!token) return fail();
  await logSiteEvent(db, null, 'customer', 'portal_login', { project_id: job.id }, ip);
  return json({ url: `/my/${token}` });
}
