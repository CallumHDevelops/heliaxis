import 'server-only';
import crypto from 'node:crypto';

/**
 * Meta Graph API: WhatsApp Cloud API (send, read receipts, typing, templates) and
 * Lead Ads (fetch a lead). Everything is off until the env vars in WHATSAPP_SETUP.md are set.
 */

const GRAPH = (version?: string) => `https://graph.facebook.com/${version || process.env.META_GRAPH_VERSION || 'v23.0'}`;

export function whatsappConfigured() {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export function leadAdsConfigured() {
  return !!(process.env.META_PAGE_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN);
}

/** The template sent to open a conversation (first message to a new lead). */
export function defaultTemplate() {
  return {
    name: process.env.WHATSAPP_DEFAULT_TEMPLATE || '',
    lang: process.env.WHATSAPP_TEMPLATE_LANG || 'en_GB',
  };
}

/** Checks Meta's X-Hub-Signature-256 header against the raw body. */
export function validSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  if (!header?.startsWith('sha256=')) return false;
  const want = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const got = header.slice(7);
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/** `code` is Meta's error code when it sent one (190 bad token, 10/200 permissions, 4/17/32 rate limits…). */
export type GraphResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: number; subcode?: number };

/** `version` overrides META_GRAPH_VERSION (the ad figures pin their own: src/lib/meta-ads.ts). */
export async function graph<T>(path: string, init: RequestInit & { token?: string; version?: string } = {}): Promise<GraphResult<T>> {
  const token = init.token || process.env.WHATSAPP_TOKEN;
  if (!token) return { ok: false, error: 'WhatsApp is not connected yet (WHATSAPP_TOKEN missing).' };
  try {
    const r = await fetch(`${GRAPH(init.version)}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
      cache: 'no-store',
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = (d as { error?: { message?: string; error_user_msg?: string; code?: number; error_subcode?: number } }).error;
      return { ok: false, error: e?.error_user_msg || e?.message || `Meta returned ${r.status}`, code: e?.code, subcode: e?.error_subcode };
    }
    return { ok: true, data: d as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

function messagesPath() {
  return `/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

type SendResult = GraphResult<{ messages?: { id: string }[] }>;

export async function sendText(to: string, body: string): Promise<SendResult> {
  return graph(messagesPath(), {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body, preview_url: false },
    }),
  });
}

/** A document (PDF etc.) by link — Meta fetches it straight away, so a short-lived signed URL is fine. */
export async function sendDocument(to: string, link: string, filename: string, caption?: string): Promise<SendResult> {
  return graph(messagesPath(), {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: { link, filename, ...(caption ? { caption } : {}) },
    }),
  });
}

/** Meta's template send errors, in plain words. */
const TEMPLATE_ERRORS: Record<number, string> = {
  132000: 'The number of blanks filled in doesn’t match the template.',
  132001: 'That template isn’t approved in this language (or it was deleted). Check WhatsApp templates.',
  132005: 'With the blanks filled in, the message is too long.',
  132007: 'Meta blocked this message under its content rules.',
  132012: 'One of the blanks isn’t in the format the template expects.',
  132015: 'Meta has paused this template because people blocked or reported it. Try another one.',
  132016: 'Meta has turned this template off. Try another one.',
};

/** A pre-approved template. `params` fill the body's {{1}}, {{2}}… in order. */
export async function sendTemplate(to: string, name: string, lang: string, params: string[] = []): Promise<SendResult> {
  // Meta refuses a blank with line breaks, tabs or 4+ spaces in a row.
  const values = params.map((p) => p.replace(/\s*[\r\n\t]+\s*/g, ' ').replace(/ {4,}/g, '   ').trim());
  const r: SendResult = await graph(messagesPath(), {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name,
        language: { code: lang },
        ...(values.length
          ? { components: [{ type: 'body', parameters: values.map((text) => ({ type: 'text', text })) }] }
          : {}),
      },
    }),
  });
  return !r.ok && r.code && TEMPLATE_ERRORS[r.code] ? { ...r, error: TEMPLATE_ERRORS[r.code] } : r;
}

/** Blue ticks on the customer's message; with `typing`, also "typing…" (up to 25s or until we send). */
export async function markRead(waMessageId: string, typing = false) {
  return graph(messagesPath(), {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: waMessageId,
      ...(typing ? { typing_indicator: { type: 'text' } } : {}),
    }),
  });
}

export type LeadField = { name: string; values: string[] };

/** The ad a lead came from (the ids need the same ads access as the name). Organic: not from an ad. */
type LeadAd = { ad_name?: string; ad_id?: string; adset_id?: string; campaign_id?: string; is_organic?: boolean };

/** A Lead Ads submission's answers. Needs a Page token with leads_retrieval. */
export async function fetchLead(leadgenId: string) {
  return graph<{ id: string; created_time?: string; field_data?: LeadField[]; form_id?: string } & LeadAd>(
    `/${encodeURIComponent(leadgenId)}?fields=id,created_time,field_data,ad_name,form_id,ad_id,adset_id,campaign_id,is_organic`,
    { token: process.env.META_PAGE_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN }
  );
}
