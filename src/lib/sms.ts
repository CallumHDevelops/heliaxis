import 'server-only';

/**
 * Text messages (SMS) for customers we have a mobile number for but no email, through The SMS Works (UK, pay as you go,
 * about 4p a text). Needs SMSWORKS_CUSTOMER_ID, SMSWORKS_KEY and SMSWORKS_SECRET; the name it comes from is SMS_SENDER_ID
 * (up to 11 letters or numbers, default "Heliaxis"). Never throws: it says why it could not send.
 */
const BASE = 'https://api.thesmsworks.co.uk/v1';

export const smsConfigured = () => !!(process.env.SMSWORKS_CUSTOMER_ID && process.env.SMSWORKS_KEY && process.env.SMSWORKS_SECRET);

/** A UK mobile as the number a text service wants: "447700900123" (no plus or spaces). Null if it isn't one. */
export function toMsisdn(phone: string | null | undefined): string | null {
  const d = String(phone ?? '').replace(/[^\d+]/g, '');
  const n = d.startsWith('+44') ? d.slice(1) : d.startsWith('0044') ? d.slice(2) : d.startsWith('44') ? d : d.startsWith('0') ? `44${d.slice(1)}` : '';
  return /^447\d{9}$/.test(n) ? n : null;
}

let cached: { token: string; at: number } | null = null;

async function token(): Promise<string> {
  if (cached && Date.now() - cached.at < 50 * 60_000) return cached.token;
  const r = await fetch(`${BASE}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerid: process.env.SMSWORKS_CUSTOMER_ID, key: process.env.SMSWORKS_KEY, secret: process.env.SMSWORKS_SECRET }),
    signal: AbortSignal.timeout(10_000),
  });
  const d = (await r.json().catch(() => ({}))) as { token?: string; message?: string };
  if (!r.ok || !d.token) throw new Error(`The SMS Works refused the sign-in (${r.status}${d.message ? `: ${d.message}` : ''}). Check the three SMSWORKS keys.`);
  cached = { token: d.token, at: Date.now() };
  return d.token;
}

const senderId = () => (process.env.SMS_SENDER_ID || 'Heliaxis').replace(/[^A-Za-z0-9 ]/g, '').slice(0, 11) || 'Heliaxis';

export async function sendSms(to: string, content: string, tag = 'heliaxis'): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  if (!smsConfigured()) return { ok: false, error: 'Text messages aren’t set up yet.' };
  const destination = toMsisdn(to);
  if (!destination) return { ok: false, error: 'That isn’t a UK mobile number.' };
  try {
    const t = await token();
    // The token goes in the Authorization header; the service has been seen to want it bare or with a "JWT" prefix.
    let last = '';
    for (const auth of [t, `JWT ${t}`]) {
      const r = await fetch(`${BASE}/message/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ sender: senderId(), destination, content, tag }),
        signal: AbortSignal.timeout(15_000),
      });
      const d = (await r.json().catch(() => ({}))) as { messageid?: string; message?: string; status?: string };
      if (r.ok) return { ok: true, id: d.messageid ?? null };
      last = `${r.status}${d.message ? `: ${d.message}` : ''}`;
      if (r.status !== 401 && r.status !== 403) break;
    }
    return { ok: false, error: `The SMS Works said ${last}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Text not sent' };
  }
}
