import 'server-only';
import { createSign } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { addDays, ukClock } from './schedule';

/**
 * Google Search Console (spec §4.2): our real clicks, impressions, CTR and position by query, page, device and country,
 * imported daily into gsc_daily so history outlives Google's 16 months. Set up: a Google Cloud service account with the
 * Search Console API on, added as a user on the heliaxis.co.uk property, its key in GSC_SERVICE_ACCOUNT (the JSON, as-is or
 * base64) and the property in GSC_SITE ("sc-domain:heliaxis.co.uk"). Until then the import does nothing.
 */

type Db = ReturnType<typeof createAdminClient>;
type ServiceAccount = { client_email: string; private_key: string };

function serviceAccount(): ServiceAccount | null {
  const raw = String(process.env.GSC_SERVICE_ACCOUNT ?? '').trim();
  if (!raw) return null;
  try {
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const sa = JSON.parse(json) as ServiceAccount;
    return sa.client_email && sa.private_key ? { ...sa, private_key: sa.private_key.replace(/\\n/g, '\n') } : null;
  } catch {
    return null;
  }
}

export const gscSite = () => String(process.env.GSC_SITE ?? 'sc-domain:heliaxis.co.uk').trim();
export const gscConfigured = () => !!serviceAccount();
export const gscAccount = () => serviceAccount()?.client_email ?? null;

let cached: { token: string; expires: number } | null = null;
async function token(): Promise<string> {
  const sa = serviceAccount();
  if (!sa) throw new Error('Search Console is not connected (GSC_SERVICE_ACCOUNT).');
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!r.ok || !j.access_token) throw new Error(`Google sign-in: ${j.error_description || j.error || r.status}`);
  cached = { token: j.access_token, expires: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function gsc<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`https://searchconsole.googleapis.com${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
    cache: 'no-store',
  });
  const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok) throw new Error(`Search Console: ${j.error?.message || r.status}`);
  return j;
}

/** Can HAP read the property? (For the setup checklist.) */
export async function gscStatus(): Promise<{ ok: boolean; message: string }> {
  if (!gscConfigured()) return { ok: false, message: 'Not connected: add the service account key.' };
  try {
    const j = await gsc<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>('/webmasters/v3/sites');
    const site = j.siteEntry?.find((s) => s.siteUrl === gscSite());
    if (!site) return { ok: false, message: `The service account can’t see ${gscSite()} yet: add ${gscAccount()} as a user on the property.` };
    return { ok: true, message: `Connected (${site.permissionLevel}).` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Could not reach Search Console' };
  }
}

type Row = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

/** Import the last `days` days (Google's data lags 2 to 3 days, so recent days are re-pulled and replaced). */
export async function importSearchConsole(opts: { days?: number; end?: string } = {}, db: Db = createAdminClient()): Promise<{ rows: number; skipped?: string }> {
  if (!gscConfigured()) return { rows: 0, skipped: 'not connected' };
  const end = opts.end ?? addDays(ukClock().date, -1);
  const start = addDays(end, -((opts.days ?? 4) - 1));
  let total = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const rows: Row[] = [];
    for (let startRow = 0; startRow < 50_000; startRow += 25_000) {
      const j = await gsc<{ rows?: Row[] }>(`/webmasters/v3/sites/${encodeURIComponent(gscSite())}/searchAnalytics/query`, {
        startDate: d,
        endDate: d,
        dimensions: ['query', 'page', 'device', 'country'],
        rowLimit: 25_000,
        startRow,
        dataState: 'all',
      });
      rows.push(...(j.rows ?? []));
      if ((j.rows ?? []).length < 25_000) break;
    }
    await db.from('gsc_daily').delete().eq('date', d);
    for (let i = 0; i < rows.length; i += 1000) {
      await db.from('gsc_daily').insert(
        rows.slice(i, i + 1000).map((r) => ({
          date: d,
          query: r.keys[0] ?? '',
          page: r.keys[1] ?? '',
          device: (r.keys[2] ?? '').toLowerCase(),
          country: (r.keys[3] ?? '').toLowerCase(),
          clicks: r.clicks,
          impressions: r.impressions,
          ctr: r.ctr,
          position: r.position,
        })),
      );
    }
    total += rows.length;
  }
  return { rows: total };
}
