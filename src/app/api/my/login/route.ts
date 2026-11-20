import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensurePortalToken } from '@/lib/crm/server';
import { LOGIN_FAILED, looksLikePostcode, postcodeKey, surnameMatches } from '@/lib/crm/portal-login';
import { portalMode } from '@/lib/crm/stages';
import { logSiteEvent } from '@/lib/site/server';
import { clientIp } from '@/lib/subcontractors/server';

export const dynamic = 'force-dynamic';

/** Wrong tries from one address in 15 minutes before it has to wait. */
const MAX_FAILED = 8;
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * { surname, postcode } → the customer's portal link, when one job matches both and is at a stage with
 * a portal (a quote sent for signing, or Won onwards). Several jobs: the newest. Wrong tries are logged
 * by address and limited, so the pair can't be guessed at speed.
 */
export async function POST(req: Request) {
  const db = createAdminClient();
  const ip = clientIp(req.headers);
  if (ip) {
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count } = await db.from('site_events').select('id', { count: 'exact', head: true }).eq('type', 'portal_login_failed').eq('ip', ip).gte('at', since);
    if ((count ?? 0) >= MAX_FAILED) return json({ error: 'Too many tries. Wait 15 minutes, or use the link we sent you.' }, 429);
  }
  const b = (await req.json().catch(() => ({}))) as { surname?: unknown; postcode?: unknown };
  const surname = String(b.surname ?? '').slice(0, 80);
  const postcode = String(b.postcode ?? '').slice(0, 12);
  const fail = async () => {
    await logSiteEvent(db, null, 'customer', 'portal_login_failed', null, ip);
    return json({ error: LOGIN_FAILED }, 404);
  };
  if (!surname.trim() || !looksLikePostcode(postcode)) return fail();

  const pc = postcodeKey(postcode);
  // The postcode is on the job, or on the enquiry it came from: both are looked at, then compared without spaces.
  const spaced = `${pc.slice(0, -3)} ${pc.slice(-3)}`;
  const variants = [pc, spaced, spaced.toLowerCase(), pc.toLowerCase()];
  const [{ data: byJob }, { data: enquiries }] = await Promise.all([
    db.from('crm_projects').select('id, stage, enquiry_id, postcode, updated_at').in('postcode', variants).limit(50),
    db.from('enquiries').select('id, name, postcode').in('postcode', variants).limit(50),
  ]);
  const enqIds = [...new Set([...(byJob ?? []).map((p) => String(p.enquiry_id)), ...(enquiries ?? []).map((e) => String(e.id))])];
  if (!enqIds.length) return fail();
  const [{ data: people }, { data: jobs }] = await Promise.all([
    db.from('enquiries').select('id, name').in('id', enqIds),
    db.from('crm_projects').select('id, stage, enquiry_id, postcode, updated_at').in('enquiry_id', enqIds).order('updated_at', { ascending: false }),
  ]);
  const named = new Set((people ?? []).filter((e) => surnameMatches(e.name as string, surname)).map((e) => String(e.id)));
  const job = (jobs ?? []).find((j) => named.has(String(j.enquiry_id)) && !!portalMode(j.stage as string) && (!j.postcode || postcodeKey(j.postcode as string) === pc));
  if (!job) return fail();
  const token = await ensurePortalToken(String(job.id));
  if (!token) return fail();
  await logSiteEvent(db, null, 'customer', 'portal_login', { project_id: job.id }, ip);
  return json({ url: `/my/${token}` });
}
