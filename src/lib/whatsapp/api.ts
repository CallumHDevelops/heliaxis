import 'server-only';
import crypto from 'node:crypto';

/**
 * Meta Graph API: WhatsApp Cloud API (send, read receipts, typing, templates) and
 * Lead Ads (fetch a lead). Everything is off until the env vars in WHATSAPP_SETUP.md are set.
 */

const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}`;

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

type GraphResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function graph<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<GraphResult<T>> {
  const token = init.token || process.env.WHATSAPP_TOKEN;
  if (!token) return { ok: false, error: 'WhatsApp is not connected yet (WHATSAPP_TOKEN missing).' };
  try {
    const r = await fetch(`${GRAPH()}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
      cache: 'no-store',
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = (d as { error?: { message?: string; error_user_msg?: string } }).error;
      return { ok: false, error: e?.error_user_msg || e?.message || `Meta returned ${r.status}` };
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

/** A pre-approved template. `params` fill the body's {{1}}, {{2}}… in order. */
export async function sendTemplate(to: string, name: string, lang: string, params: string[] = []): Promise<SendResult> {
  return graph(messagesPath(), {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name,
        language: { code: lang },
        ...(params.length
          ? { components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] }
          : {}),
      },
    }),
  });
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

export type TemplateInfo = { name: string; language: string; category: string; body: string; params: number };

/** Approved templates (needs WHATSAPP_BUSINESS_ACCOUNT_ID); falls back to the default one. */
export async function listTemplates(): Promise<TemplateInfo[]> {
  const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const def = defaultTemplate();
  const fallback = def.name ? [{ name: def.name, language: def.lang, category: '', body: '', params: 1 }] : [];
  if (!waba) return fallback;
  const r = await graph<{
    data: { name: string; language: string; category: string; status: string; components?: { type: string; text?: string }[] }[];
  }>(`/${waba}/message_templates?fields=name,language,category,status,components&status=APPROVED&limit=100`);
  if (!r.ok) return fallback;
  return r.data.data
    .filter((t) => t.status === 'APPROVED')
    .map((t) => {
      const body = t.components?.find((c) => c.type === 'BODY')?.text || '';
      return {
        name: t.name,
        language: t.language,
        category: t.category,
        body,
        params: new Set(body.match(/\{\{\d+\}\}/g) || []).size,
      };
    });
}

export type LeadField = { name: string; values: string[] };

/** A Lead Ads submission's answers. Needs a Page token with leads_retrieval. */
export async function fetchLead(leadgenId: string) {
  return graph<{ id: string; created_time?: string; field_data?: LeadField[]; ad_name?: string; form_id?: string }>(
    `/${encodeURIComponent(leadgenId)}?fields=id,created_time,field_data,ad_name,form_id`,
    { token: process.env.META_PAGE_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN }
  );
}
