import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * "Send later" on the server: whether the outbox can hold a message a person scheduled yet
 * (whatsapp-scheduled.sql), the send times it accepts, and who may change one. The sending itself is
 * scheduleManual and processOutbox in inbox.ts; the times are worked out in schedule.ts.
 */

/** What a scheduled message adds to an outbox read, once whatsapp-scheduled.sql has been run. */
export const LATER_COLS = 'sent_by, template_params, chase_hours';

/** Said wherever Send later is used before the SQL has been run. */
export const LATER_SETUP =
  'Send later needs one setup step first: run whatsapp-scheduled.sql in Supabase (it’s on the to-do list). Until then, use Send now.';

/** The furthest ahead a message can be scheduled. */
export const LATER_MAX_DAYS = 28;

let ready: boolean | null = null;
let checkedAt = 0;
const missingColumn = (e: { code?: string; message?: string }) => e.code === '42703' || /column .* does not exist/i.test(e.message ?? '');

/** The outbox has the Send later columns. Asked again every few minutes until it has. */
export async function sendLaterReady(): Promise<boolean> {
  if (ready) return true;
  if (ready === false && Date.now() - checkedAt < 5 * 60_000) return false;
  try {
    const { error } = await createAdminClient().from('whatsapp_outbox').select('reply_noted_at').limit(1);
    if (error && !missingColumn(error)) return false; // a blip: ask again next time
    ready = !error;
    checkedAt = Date.now();
    return ready;
  } catch {
    return false;
  }
}

/**
 * A send time from the browser (an ISO time): from a minute ago (a page a little behind) to four
 * weeks ahead. Anything else says why, in words for the chat.
 */
export function parseSendAt(v: unknown, now = Date.now()): { at: Date } | { error: string } {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  if (!Number.isFinite(t)) return { error: 'That isn’t a date and time.' };
  if (t < now - 60_000) return { error: 'That time has already gone. Pick a later one, or send it now.' };
  if (t > now + LATER_MAX_DAYS * 86_400_000) return { error: `Messages can be scheduled up to ${LATER_MAX_DAYS / 7} weeks ahead.` };
  return { at: new Date(Math.max(t, now)) };
}

/** Only the person who wrote a scheduled message, or an admin, can change, send or cancel it. Everything else in the outbox: anyone in the chat. */
export function mayChangeQueued(item: { kind: string; sent_by?: string | null }, user: { id: string; role?: string | null }): boolean {
  return item.kind !== 'scheduled' || !item.sent_by || item.sent_by === user.id || user.role === 'admin';
}
