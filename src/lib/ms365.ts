import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Microsoft 365 (Graph, app-only): send email from the shared mailbox (e.g. hello@heliaxis.co.uk),
 * pick up replies and emails sent from Outlook, and add calendar events. Off until the MS_* env vars
 * are set — see CRM_GUIDE.md.
 */

const GRAPH = 'https://graph.microsoft.com/v1.0';

export function msConfigured() {
  return !!(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.MS_MAILBOX);
}
export const mailbox = () => process.env.MS_MAILBOX || '';

let cached: { token: string; exp: number } | null = null;
async function token() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const r = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
    cache: 'no-store',
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error(d.error_description || 'Microsoft sign-in failed — check MS_CLIENT_SECRET');
  cached = { token: d.access_token, exp: Date.now() + (Number(d.expires_in) || 3000) * 1000 };
  return cached.token;
}

async function graph<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await token()}`,
      'Content-Type': 'application/json',
      Prefer: 'outlook.body-content-type="text"',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  if (r.status === 202 || r.status === 204) return {} as T;
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || `Microsoft returned ${r.status}`);
  return d as T;
}

export type MailAttachment = { name: string; contentType: string; bytes: Uint8Array };

/** Send from the shared mailbox. Returns the message's internetMessageId (to match it in Sent Items). */
export async function sendMail(opts: { to: string; subject: string; text: string; attachments?: MailAttachment[]; replyTo?: string }) {
  const box = encodeURIComponent(mailbox());
  const draft = await graph<{ id: string; internetMessageId: string }>(`/users/${box}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      subject: opts.subject,
      body: { contentType: 'Text', content: opts.text },
      toRecipients: [{ emailAddress: { address: opts.to } }],
      ...(opts.replyTo ? { replyTo: [{ emailAddress: { address: opts.replyTo } }] } : {}),
      attachments: (opts.attachments ?? []).map((a) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.name,
        contentType: a.contentType,
        contentBytes: Buffer.from(a.bytes).toString('base64'),
      })),
    }),
  });
  await graph(`/users/${box}/messages/${draft.id}/send`, { method: 'POST' });
  return draft.internetMessageId;
}

/** A calendar event in the shared mailbox's calendar (survey / install bookings). */
export async function createEvent(opts: { subject: string; start: Date; minutes: number; location?: string; body?: string }) {
  const box = encodeURIComponent(mailbox());
  const end = new Date(opts.start.getTime() + opts.minutes * 60_000);
  const iso = (d: Date) => d.toISOString().replace('Z', '');
  await graph(`/users/${box}/events`, {
    method: 'POST',
    body: JSON.stringify({
      subject: opts.subject,
      start: { dateTime: iso(opts.start), timeZone: 'UTC' },
      end: { dateTime: iso(end), timeZone: 'UTC' },
      ...(opts.location ? { location: { displayName: opts.location } } : {}),
      ...(opts.body ? { body: { contentType: 'Text', content: opts.body } } : {}),
    }),
  });
}

type GraphMessage = {
  internetMessageId: string;
  subject: string | null;
  body?: { content?: string };
  bodyPreview?: string;
  from?: { emailAddress?: { address?: string } };
  toRecipients?: { emailAddress?: { address?: string } }[];
  receivedDateTime?: string;
  sentDateTime?: string;
  hasAttachments?: boolean;
};

const POLL_KEY = 'ms365-poll';

/**
 * Every minute: new emails in the inbox (customer replies) and in Sent Items (sent from Outlook),
 * matched to customers by email address and saved to their timeline. Returns how many were added.
 */
export async function pollMailbox(onInbound: (enquiryId: string, name: string, subject: string) => Promise<void>) {
  if (!msConfigured()) return 0;
  const db = createAdminClient();
  const { data: kv } = await db.from('cms_kv').select('value').eq('key', POLL_KEY).maybeSingle();
  const since = kv?.value || new Date(Date.now() - 15 * 60_000).toISOString();
  const startedAt = new Date().toISOString();
  const box = encodeURIComponent(mailbox());
  const sel = 'internetMessageId,subject,body,bodyPreview,from,toRecipients,receivedDateTime,sentDateTime,hasAttachments';
  const [inbox, sent] = await Promise.all([
    graph<{ value: GraphMessage[] }>(
      `/users/${box}/mailFolders/inbox/messages?$select=${sel}&$top=50&$orderby=receivedDateTime&$filter=receivedDateTime ge ${since}`
    ),
    graph<{ value: GraphMessage[] }>(
      `/users/${box}/mailFolders/sentitems/messages?$select=${sel}&$top=50&$orderby=sentDateTime&$filter=sentDateTime ge ${since}`
    ),
  ]);

  const me = mailbox().toLowerCase();
  let added = 0;
  const handle = async (m: GraphMessage, direction: 'in' | 'out') => {
    const other =
      direction === 'in'
        ? m.from?.emailAddress?.address
        : m.toRecipients?.map((r) => r.emailAddress?.address).find((a) => a && a.toLowerCase() !== me);
    if (!other) return;
    const { data: enq } = await db
      .from('enquiries')
      .select('id, name')
      .ilike('email', other.trim())
      .order('created_at', { ascending: false })
      .limit(1);
    const e = enq?.[0];
    if (!e) return;
    const { data: proj } = await db.from('crm_projects').select('id').eq('enquiry_id', e.id).order('created_at', { ascending: false }).limit(1);
    const { error } = await db.from('crm_emails').insert({
      enquiry_id: e.id,
      project_id: proj?.[0]?.id ?? null,
      graph_id: m.internetMessageId,
      direction,
      subject: m.subject,
      body: (m.body?.content || m.bodyPreview || '').trim().slice(0, 4000),
      from_address: direction === 'in' ? other : mailbox(),
      to_address: direction === 'in' ? mailbox() : other,
      at: (direction === 'in' ? m.receivedDateTime : m.sentDateTime) || new Date().toISOString(),
    });
    if (error) return; // duplicate (already recorded when sent from the CRM)
    added++;
    if (direction === 'in') {
      await db.from('crm_projects').update({ sequence_stopped_at: new Date().toISOString() }).eq('enquiry_id', e.id).is('sequence_stopped_at', null);
      await onInbound(e.id, e.name, m.subject || '(no subject)');
    } else {
      await db.from('crm_projects').update({ first_contact_at: new Date().toISOString() }).eq('enquiry_id', e.id).is('first_contact_at', null);
    }
  };
  for (const m of inbox.value ?? []) await handle(m, 'in');
  for (const m of sent.value ?? []) await handle(m, 'out');
  await db.from('cms_kv').upsert({ key: POLL_KEY, value: startedAt, updated_at: startedAt });
  return added;
}
