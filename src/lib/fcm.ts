import 'server-only';
import { createSign } from 'crypto';

/**
 * Firebase Cloud Messaging (HTTP v1) for the Android app's native notifications.
 * FIREBASE_SERVICE_ACCOUNT holds the service-account JSON from Firebase → Project settings →
 * Service accounts → Generate new private key (pasted as-is, or base64). We sign a JWT with it,
 * swap that for an hour-long access token, and send data-only messages so the app builds the
 * notification itself (channels, buttons, where a tap goes).
 */

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

let account: ServiceAccount | null | undefined;
function serviceAccount(): ServiceAccount | null {
  if (account !== undefined) return account;
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  account = null;
  if (!raw) return account;
  try {
    const json = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    if (json.project_id && json.client_email && json.private_key) {
      account = { project_id: json.project_id, client_email: json.client_email, private_key: json.private_key };
    }
  } catch {
    console.error('[fcm] FIREBASE_SERVICE_ACCOUNT is not valid JSON');
  }
  return account;
}

export const fcmConfigured = () => !!serviceAccount();

let cached: { token: string; expires: number } | null = null;

async function accessToken(sa: ServiceAccount) {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !body.access_token) throw new Error(`Google token: ${body.error || res.status}`);
  cached = { token: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

/**
 * Send a data message to one device. 'gone' means the token is dead (app uninstalled or
 * data cleared), so the caller should forget it.
 */
export async function sendFcm(token: string, data: Record<string, string>): Promise<'ok' | 'gone' | 'error'> {
  const sa = serviceAccount();
  if (!sa) return 'error';
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await accessToken(sa)}` },
      body: JSON.stringify({ message: { token, data, android: { priority: 'HIGH', ttl: '86400s' } } }),
    });
    if (res.ok) return 'ok';
    const body = (await res.json().catch(() => ({}))) as {
      error?: { status?: string; message?: string; details?: { errorCode?: string }[] };
    };
    const code = body.error?.details?.find((d) => d.errorCode)?.errorCode || body.error?.status;
    if (res.status === 401) cached = null;
    if (code === 'UNREGISTERED' || res.status === 404) return 'gone';
    if (code === 'INVALID_ARGUMENT' && /registration token/i.test(body.error?.message || '')) return 'gone';
    console.error('[fcm] send failed', res.status, code, body.error?.message);
    return 'error';
  } catch (e) {
    console.error('[fcm] send failed', e);
    return 'error';
  }
}
