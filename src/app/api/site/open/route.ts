import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp, sha256 } from '@/lib/subcontractors/server';
import { PROBLEM, siteJson } from '@/lib/site/device';
import { assignmentRow, logSiteEvent, siteReady, SITE_NOT_READY } from '@/lib/site/server';
import { siteShort } from '@/lib/site/messages';
import { DEVICE_DAYS, looksLikeToken, newDeviceToken } from '@/lib/site/tokens';
import { firstNameOf, TRADE_LABEL } from '@/lib/site/types';

export const dynamic = 'force-dynamic';

/** Wrong links from one address in 10 minutes before it has to wait. */
const MAX_FAILED = 10;
/** How long a job's link keeps opening after it's done (for the strike photos, a put right, the PO). */
const LINK_DAYS_AFTER_DONE = 30;

/**
 * The link in a trade's message → a session on this phone: { token, device?, standalone? }. Called
 * by the page's script (a POST), never by the page itself, so WhatsApp's link preview changes
 * nothing. A phone that already has a session for the same person keeps it (the Home Screen app
 * reopening its link); otherwise a new device token is made (only its hash is kept) and handed back
 * once. Sets opened_at, and the assignment counts as opened.
 */
export async function POST(req: Request) {
  if (!(await siteReady())) return siteJson({ error: 'not_ready', message: SITE_NOT_READY }, 503);
  const db = createAdminClient();
  const ip = clientIp(req.headers);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (ip) {
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await db.from('site_events').select('id', { count: 'exact', head: true }).eq('type', 'open_failed').eq('ip', ip).gte('at', since);
    if ((count ?? 0) >= MAX_FAILED) return siteJson({ error: 'slow_down', message: 'Too many tries. Wait 10 minutes, or call the office on 01633 965205.' }, 429);
  }
  const fail = async (status: number, body: { error: string; message: string }, assignmentId: string | null = null) => {
    await logSiteEvent(db, assignmentId, 'trade', 'open_failed', { reason: body.error }, ip);
    return siteJson(body, status);
  };
  if (!looksLikeToken(b.token)) return fail(404, PROBLEM.link);
  const { data } = await db.from('site_assignments').select('*').eq('link_hash', sha256(b.token)).maybeSingle();
  if (!data) return fail(404, PROBLEM.link);
  const a = assignmentRow(data);
  if (a.status === 'cancelled') return fail(410, PROBLEM.cancelled, a.id);
  // A link is good while the job is open and for 30 days after it's done (ARCH 4.3), not for ever;
  // longer only while a return to site is with them (their put right is done from it).
  if (a.status === 'done' && a.done_at && Date.now() - Date.parse(a.done_at) > LINK_DAYS_AFTER_DONE * 86_400_000) {
    const { data: open } = await db.from('site_returns').select('id').eq('assignment_id', a.id).eq('status', 'open').limit(1);
    if (!open?.length) return fail(410, PROBLEM.link, a.id);
  }
  const { data: c } = await db.from('site_contacts').select('*').eq('id', a.contact_id).maybeSingle();
  if (!c || c.archived_at) return fail(404, PROBLEM.gone, a.id);

  // A phone already signed in for this person keeps its session.
  const now = new Date();
  const expires = new Date(now.getTime() + DEVICE_DAYS * 86_400_000).toISOString();
  let deviceId: string | null = null;
  let deviceToken: string | null = null;
  if (typeof b.device === 'string' && looksLikeToken(b.device)) {
    const { data: d } = await db.from('site_devices').select('*').eq('token_hash', sha256(b.device)).maybeSingle();
    if (d && d.contact_id === a.contact_id && !d.revoked_at && Date.parse(d.expires_at) > Date.now()) {
      deviceId = d.id as string;
      await db.from('site_devices').update({ last_seen_at: now.toISOString(), expires_at: expires, ...(b.standalone === true ? { standalone: true } : {}) }).eq('id', deviceId);
    }
  }
  if (!deviceId) {
    const t = newDeviceToken();
    const { data: d, error } = await db
      .from('site_devices')
      .insert({ contact_id: a.contact_id, token_hash: t.hash, standalone: b.standalone === true, user_agent: (req.headers.get('user-agent') || '').slice(0, 300), ip, last_seen_at: now.toISOString(), expires_at: expires })
      .select('id')
      .single();
    if (error || !d) return siteJson({ error: 'busy', message: 'That didn’t work. Try again in a moment.' }, 500);
    deviceId = d.id as string;
    deviceToken = t.token;
  }
  if (!a.opened_at || a.status === 'sent' || a.status === 'draft') {
    await db
      .from('site_assignments')
      .update({ opened_at: a.opened_at ?? now.toISOString(), ...(a.status === 'sent' || a.status === 'draft' ? { status: 'opened' } : {}), updated_at: now.toISOString() })
      .eq('id', a.id);
  }
  await logSiteEvent(db, a.id, 'trade', 'opened', { device: deviceId, generation: a.link_generation, standalone: b.standalone === true }, ip);
  const { data: p } = await db.from('crm_projects').select('address, postcode').eq('id', a.project_id).maybeSingle();
  return siteJson({
    ...(deviceToken ? { deviceToken } : {}),
    contact: { id: c.id as string, name: c.name as string, first: firstNameOf(c.name as string) },
    assignment: { id: a.id, trade: a.trade, title: a.trade === 'other' ? a.trade_label || TRADE_LABEL.other : TRADE_LABEL[a.trade], site: siteShort(p?.address, p?.postcode) },
  });
}
