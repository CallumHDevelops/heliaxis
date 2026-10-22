import 'server-only';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sha256 } from '@/lib/subcontractors/server';
import { assignmentRow, siteReady, SITE_NOT_READY, type AssignmentRow, type ContactRow, type Db } from './server';
import { bearerOf, DEVICE_DAYS } from './tokens';

/**
 * The site app's own sign-in: a phone's device token (Authorization: Bearer), made when the person
 * opened their link. It belongs to the person (site_contacts), so every one of their Heliaxis jobs
 * shows on that phone. Site links never open the onboarding portal's session, which holds ID and
 * bank details.
 */

const H = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' };
export const siteJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: H });

/** Problems the phone shows as their own screens (P17), with what to do. */
export const PROBLEM = {
  device: { error: 'device', message: 'Open the link in your message again.' },
  cancelled: { error: 'cancelled', message: 'This job was cancelled. Call the office on 01633 965205.' },
  gone: { error: 'gone', message: 'This job isn’t on your list any more. Call the office on 01633 965205.' },
  link: { error: 'link', message: 'That link has been replaced or has run out. Open the newest message from Heliaxis, or call the office on 01633 965205.' },
};

export type DeviceRow = { id: string; contact_id: string; token_hash: string; standalone: boolean; last_seen_at: string | null; expires_at: string; revoked_at: string | null };
export type Session = { db: Db; device: DeviceRow; contact: ContactRow };

/** The phone asking, or the response to send back (503 before the SQL, 401 for a missing or dead device). */
export async function deviceSession(req: Request): Promise<Session | NextResponse> {
  if (!(await siteReady())) return siteJson({ error: 'not_ready', message: SITE_NOT_READY }, 503);
  const token = bearerOf(req);
  if (!token) return siteJson(PROBLEM.device, 401);
  const db = createAdminClient();
  const { data: d } = await db.from('site_devices').select('*').eq('token_hash', sha256(token)).maybeSingle();
  const device = d as DeviceRow | null;
  if (!device || device.revoked_at || Date.parse(device.expires_at) < Date.now()) return siteJson(PROBLEM.device, 401);
  const { data: c } = await db.from('site_contacts').select('*').eq('id', device.contact_id).maybeSingle();
  const contact = c as ContactRow | null;
  if (!contact || contact.archived_at) return siteJson(PROBLEM.device, 401);
  // Keep it alive (90 days after last use), at most once an hour.
  if (!device.last_seen_at || Date.now() - Date.parse(device.last_seen_at) > 3_600_000) {
    const at = new Date();
    await db
      .from('site_devices')
      .update({ last_seen_at: at.toISOString(), expires_at: new Date(at.getTime() + DEVICE_DAYS * 86_400_000).toISOString() })
      .eq('id', device.id);
  }
  return { db, device, contact };
}

/** One of this person's assignments, or the problem (404 when it isn't theirs, 410 when cancelled). */
export async function theirAssignment(s: Session, id: string): Promise<AssignmentRow | NextResponse> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return siteJson(PROBLEM.gone, 404);
  const { data } = await s.db.from('site_assignments').select('*').eq('id', id).eq('contact_id', s.contact.id).maybeSingle();
  if (!data) return siteJson(PROBLEM.gone, 404);
  const a = assignmentRow(data);
  if (a.status === 'cancelled') return siteJson(PROBLEM.cancelled, 410);
  return a;
}

export const isResponse = (x: unknown): x is NextResponse => x instanceof NextResponse;
