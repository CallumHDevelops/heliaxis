import 'server-only';
import { graph } from './api';

/**
 * Live WhatsApp connection check for admins (/admin/setup/env): what Meta says about the
 * number and account in Vercel, which numbers the token can see, and the two one-off fixes
 * (register the number on the Cloud API, subscribe the account to our app for webhooks).
 */

export type PhoneInfo = {
  id: string;
  display: string | null;
  name: string | null;
  /** CONNECTED, OFFLINE, PENDING, … (Meta's own words). */
  status: string | null;
  /** APPROVED, PENDING_REVIEW, DECLINED, … for the display name. */
  nameStatus: string | null;
  /** CLOUD_API once registered; NOT_APPLICABLE before. */
  platform: string | null;
  quality: string | null;
};

export type FoundAccount = { id: string; name: string | null; numbers: PhoneInfo[] };

export type ConnectionReport = {
  env: { token: boolean; phoneId: string | null; wabaId: string | null };
  phone: PhoneInfo | null;
  phoneError: string | null;
  /** True if our app is subscribed to the account's webhooks. */
  subscribed: boolean | null;
  subscribedError: string | null;
  /** Accounts and numbers this token can see (to copy the right IDs). */
  found: FoundAccount[];
  foundError: string | null;
};

type RawPhone = {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  status?: string;
  name_status?: string;
  platform_type?: string;
  quality_rating?: string;
};

const PHONE_FIELDS = 'id,display_phone_number,verified_name,status,name_status,platform_type,quality_rating';
// Fewer fields, for when Meta rejects one of the above on this API version.
const PHONE_FIELDS_MIN = 'id,display_phone_number,verified_name,quality_rating';

function toPhone(p: RawPhone): PhoneInfo {
  return {
    id: p.id,
    display: p.display_phone_number ?? null,
    name: p.verified_name ?? null,
    status: p.status ?? null,
    nameStatus: p.name_status ?? null,
    platform: p.platform_type ?? null,
    quality: p.quality_rating ?? null,
  };
}

async function phone(id: string) {
  const full = await graph<RawPhone>(`/${encodeURIComponent(id)}?fields=${PHONE_FIELDS}`);
  if (full.ok) return full;
  return graph<RawPhone>(`/${encodeURIComponent(id)}?fields=${PHONE_FIELDS_MIN}`);
}

async function numbersOf(wabaId: string) {
  const full = await graph<{ data: RawPhone[] }>(`/${encodeURIComponent(wabaId)}/phone_numbers?fields=${PHONE_FIELDS}`);
  if (full.ok) return full;
  return graph<{ data: RawPhone[] }>(`/${encodeURIComponent(wabaId)}/phone_numbers?fields=${PHONE_FIELDS_MIN}`);
}

/** WhatsApp accounts the token can see: the businesses it belongs to → their accounts → numbers. */
async function discover(): Promise<{ found: FoundAccount[]; error: string | null }> {
  const biz = await graph<{ data: { id: string; name?: string }[] }>(`/me/businesses?fields=id,name&limit=10`);
  if (!biz.ok) return { found: [], error: biz.error };
  const found: FoundAccount[] = [];
  let error: string | null = null;
  for (const b of biz.data.data ?? []) {
    for (const edge of ['owned_whatsapp_business_accounts', 'client_whatsapp_business_accounts']) {
      const w = await graph<{ data: { id: string; name?: string }[] }>(`/${encodeURIComponent(b.id)}/${edge}?fields=id,name&limit=25`);
      if (!w.ok) {
        error ??= w.error;
        continue;
      }
      for (const a of w.data.data ?? []) {
        if (found.some((f) => f.id === a.id)) continue;
        const n = await numbersOf(a.id);
        found.push({ id: a.id, name: a.name ?? null, numbers: n.ok ? (n.data.data ?? []).map(toPhone) : [] });
      }
    }
  }
  return { found, error: found.length ? null : error };
}

export async function connectionReport(): Promise<ConnectionReport> {
  const token = !!process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || null;
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() || null;
  const report: ConnectionReport = {
    env: { token, phoneId, wabaId },
    phone: null,
    phoneError: null,
    subscribed: null,
    subscribedError: null,
    found: [],
    foundError: null,
  };
  if (!token) return report;

  const [p, subs, disc] = await Promise.all([
    phoneId ? phone(phoneId) : Promise.resolve(null),
    wabaId ? graph<{ data: unknown[] }>(`/${encodeURIComponent(wabaId)}/subscribed_apps`) : Promise.resolve(null),
    discover(),
  ]);
  if (p) {
    if (p.ok) report.phone = toPhone(p.data);
    else report.phoneError = p.error;
  }
  if (subs) {
    // Lists the apps subscribed to this account's webhooks; a system-user token sees its own app.
    if (subs.ok) report.subscribed = (subs.data.data ?? []).length > 0;
    else report.subscribedError = subs.error;
  }
  report.found = disc.found;
  report.foundError = disc.error;
  return report;
}

/** Register the number on the Cloud API. The PIN becomes its two-step verification PIN. */
export async function registerNumber(pin: string) {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!phoneId) return { ok: false as const, error: 'Add WHATSAPP_PHONE_NUMBER_ID in Vercel first.' };
  if (!/^\d{6}$/.test(pin)) return { ok: false as const, error: 'The PIN must be 6 digits.' };
  return graph<{ success?: boolean }>(`/${encodeURIComponent(phoneId)}/register`, {
    method: 'POST',
    body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
  });
}

/** Subscribe our app to the account's webhooks, so incoming messages reach /api/meta/webhook. */
export async function subscribeApp() {
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  if (!wabaId) return { ok: false as const, error: 'Add WHATSAPP_BUSINESS_ACCOUNT_ID in Vercel first.' };
  return graph<{ success?: boolean }>(`/${encodeURIComponent(wabaId)}/subscribed_apps`, { method: 'POST' });
}
