import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { logEvent } from './server';

export type WebhookType = 'assignment.crew_confirmed' | 'assignment.crew_changed' | 'assignment.declined';

export function ramsAppUrl() {
  return (process.env.RAMS_APP_URL || 'https://rams.heliaxis.co.uk').replace(/\/$/, '');
}

/**
 * Tell RAMS something changed on an assignment so it can pull the crew's
 * documents straight away. The body carries only ids — RAMS fetches the detail
 * back through the authenticated API. Outcome is stored on the assignment and
 * shown in admin; RAMS can also re-pull by hand if a delivery is missed.
 */
export async function notifyRams(assignmentId: string, subId: string, type: WebhookType) {
  const key = process.env.PORTAL_API_KEY || '';
  const admin = createAdminClient();
  let status: string;
  if (key.length < 32) {
    status = 'not sent: PORTAL_API_KEY missing';
  } else {
    try {
      const res = await fetch(`${ramsAppUrl()}/api/portal/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ type, assignmentId, sentAt: new Date().toISOString() }),
        signal: AbortSignal.timeout(25_000),
        cache: 'no-store',
      });
      status = res.ok ? `delivered ${type}` : `failed ${res.status}`;
    } catch (e) {
      status = `failed: ${e instanceof Error ? e.message : 'network error'}`;
    }
  }
  await admin
    .from('subcontractor_assignments')
    .update({ webhook_status: `${status} @ ${new Date().toISOString()}`.slice(0, 200) })
    .eq('id', assignmentId);
  await logEvent(subId, 'system', 'rams_webhook', { type, status, assignmentId });
  return status;
}
