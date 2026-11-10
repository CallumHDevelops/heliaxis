/**
 * Team notification for new bookings (spec 7.4).
 *
 * [TBC] The spec says "email, or the existing CRM/leads feed in the admin".
 * Until that's wired in, set PROSPECTPV_LEADS_WEBHOOK_URL to any endpoint that
 * accepts JSON (e.g. the admin's leads API, a Slack workflow or an email
 * service). Notification failures are logged and never fail the booking: the
 * booking is already stored in pv_responses.
 */
import 'server-only';

export type BookingNotification = {
  responseId: string;
  letterCode: string;
  address: string;
  name: string;
  phone: string;
  email: string;
  bestTime: string;
  packageName: string;
  quotedTotal: number;
  extras: string[];
  batteryKwh: number;
};

export async function notifyTeam(n: BookingNotification): Promise<void> {
  const url = process.env.PROSPECTPV_LEADS_WEBHOOK_URL;
  if (!url) {
    console.info('[prospectpv] booking received (no PROSPECTPV_LEADS_WEBHOOK_URL set)', n.responseId);
    return;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'prospectpv.booking', ...n }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error('[prospectpv] leads webhook returned', res.status);
  } catch (e) {
    console.error('[prospectpv] leads webhook failed', e);
  }
}
