/**
 * An inbound WhatsApp message as text for the chat, the inbox list and the team's notification.
 * The types are Meta's Cloud API messages webhook (developers.facebook.com → WhatsApp → Webhooks →
 * Reference → messages).
 *
 * The number has no WhatsApp app attached, so nothing here may say "open WhatsApp": anything Meta
 * doesn't pass on is gone. Only real text (typed, or a button or list option they tapped) is kind
 * 'text', so only that can trigger a smart reply. The messages we write ourselves stay within 140
 * characters, the length of a notification.
 *
 * No imports: scripts/test-wa-describe.mjs loads this file straight into node. Safe for client code.
 */

type SharedContact = {
  name?: { formatted_name?: string; first_name?: string; last_name?: string };
  org?: { company?: string };
  phones?: { phone?: string; wa_id?: string }[];
  emails?: { email?: string }[];
};

type FormReply = { name?: string; body?: string; response_json?: string };

export type InboundMessage = {
  id: string;
  from: string;
  timestamp?: string;
  type: string;
  text?: { body?: string };
  /** A quick-reply button on a template. */
  button?: { text?: string; payload?: string };
  interactive?: {
    type?: string;
    button_reply?: { title?: string };
    list_reply?: { title?: string };
    /** A WhatsApp Flow (form) or address message sent back. */
    nfm_reply?: FormReply;
    call_permission_reply?: { response?: string };
  };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { filename?: string; caption?: string };
  audio?: { voice?: boolean };
  sticker?: { animated?: boolean };
  location?: { latitude?: number; longitude?: number; name?: string };
  reaction?: { emoji?: string };
  /** Contact cards they shared (not the webhook's own `contacts`, which say who sent it). */
  contacts?: SharedContact[];
  order?: { product_items?: { quantity?: number; item_price?: number; currency?: string }[]; text?: string };
  /** Their account changed, e.g. a new number: `body` is Meta's own wording. */
  system?: { body?: string; type?: string; wa_id?: string; new_wa_id?: string | number };
  /** What they really sent when type is 'unsupported': poll_creation, edit, gif… */
  unsupported?: { type?: string };
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
  referral?: { headline?: string; source_url?: string };
};

const RESEND = 'Ask them to send it again as a normal message or photo.';

/** Meta's unsupported.type values we can put a name to. */
const NOT_PASSED_ON = new Map([
  ['poll_creation', 'They sent a poll'],
  ['poll_update', 'They voted in a poll'],
  ['edit', 'They edited a message'],
  ['gif', 'They sent a GIF'],
  ['group_invite', 'They sent a group invite'],
  ['product', 'They sent a product from a shop'],
  ['view_once', 'They sent a view-once photo or video'],
]);
/** Template, button and list messages: only a business's own WhatsApp system sends these (a login code, an alert). */
const AUTOMATED = new Set(['hsm', 'template', 'interactive', 'button', 'list']);
/** …and the ones that need nothing from us. */
const JUST_SO_YOU_KNOW = new Map([
  ['pin', '📌 They pinned a message in the chat.'],
  ['keep_in_chat', '📌 They kept a disappearing message in the chat.'],
]);

export function describeMessage(m: InboundMessage): { kind: string; body: string } {
  switch (m.type) {
    case 'text':
      return { kind: 'text', body: m.text?.body || '' };
    case 'button':
      return { kind: 'text', body: m.button?.text || '' };
    case 'interactive':
      return interactive(m.interactive);
    case 'image':
      return { kind: 'image', body: `📷 Photo${m.image?.caption ? `: ${m.image.caption}` : ''}` };
    case 'sticker':
      return { kind: 'other', body: '🙂 Sticker' };
    case 'video':
      return { kind: 'video', body: `🎥 Video${m.video?.caption ? `: ${m.video.caption}` : ''}` };
    case 'document':
      return { kind: 'document', body: `📄 ${m.document?.filename || 'Document'}${m.document?.caption ? ` — ${m.document.caption}` : ''}` };
    case 'audio':
      return { kind: 'audio', body: m.audio?.voice === false ? '🎵 Audio file' : '🎤 Voice note' };
    case 'location':
      return {
        kind: 'location',
        body: `📍 ${m.location?.name || 'Location'} (${m.location?.latitude}, ${m.location?.longitude})`,
      };
    case 'reaction':
      return { kind: 'other', body: m.reaction?.emoji ? `Reacted ${m.reaction.emoji}` : 'Removed a reaction' };
    case 'contacts':
      return { kind: 'other', body: sharedContacts(m.contacts ?? []) };
    case 'order':
      return { kind: 'other', body: order(m.order) };
    case 'system':
      return { kind: 'other', body: system(m) };
    case 'request_welcome':
      return { kind: 'other', body: '👋 They opened a WhatsApp chat with you but haven’t written anything yet.' };
    // The Cloud API sends a deleted message as 'unsupported' (see notPassedOn), not as these.
    case 'revoked':
    case 'deleted':
      return { kind: 'other', body: '🗑️ They deleted a message.' };
    case 'unsupported':
    case 'unknown':
      return { kind: 'other', body: notPassedOn(m) };
    default:
      return { kind: 'other', body: `⚠️ They sent a “${m.type}” message, which this inbox can’t show yet. ${RESEND}` };
  }
}

/**
 * A message saved before describeMessage() knew its type ("[sticker message — open WhatsApp to see
 * it]"), in today's wording. Anything else is shown as it is.
 */
export function shownBody(body: string | null): string | null {
  const old = body?.match(/^\[(\w+) message — open WhatsApp to see it\]$/);
  return old ? describeMessage({ id: '', from: '', type: old[1] }).body : body;
}

function interactive(i: InboundMessage['interactive']): { kind: string; body: string } {
  const tapped = i?.button_reply?.title || i?.list_reply?.title;
  if (tapped) return { kind: 'text', body: tapped };
  if (i?.nfm_reply) return { kind: 'other', body: formReply(i.nfm_reply) };
  if (i?.call_permission_reply) {
    const yes = i.call_permission_reply.response === 'accept';
    return { kind: 'other', body: `📞 They said ${yes ? 'yes' : 'no'} to WhatsApp calls from you.` };
  }
  return { kind: 'other', body: `⚠️ They answered in a way this inbox can’t show. ${RESEND}` };
}

/**
 * Polls, edits, view-once photos…: Meta tells us one came, but not what was in it. A message they
 * deleted, or one sent from another business's API number (an automated sender), comes the same way
 * with no unsupported.type, so then we can't tell what it was or whether to ask for it again.
 */
function notPassedOn(m: InboundMessage) {
  const type = m.unsupported?.type || '';
  const info = JUST_SO_YOU_KNOW.get(type);
  if (info) return info;
  if (AUTOMATED.has(type)) return '⚠️ An automated message from another business’s WhatsApp system (a code or an alert, say). WhatsApp doesn’t pass these on.';
  const e = m.errors?.[0];
  // 131051 is the plain "message type not supported", which says nothing the wording below doesn't.
  const why = e && e.code !== 131051 ? e.error_data?.details || e.message || e.title : '';
  if (why) return `⚠️ WhatsApp didn’t pass this message on (“${why.replace(/\.$/, '')}”). ${RESEND}`;
  const did = NOT_PASSED_ON.get(type);
  if (did) return `⚠️ ${did}, which WhatsApp doesn’t pass on. ${RESEND}`;
  // Meta named it, but it's nothing we have words for: don't guess at polls.
  if (type) return '⚠️ WhatsApp didn’t pass this message on. If it matters, ask them to send it again.';
  return '⚠️ WhatsApp didn’t pass this on. It may have been deleted, or be a poll, a view-once photo or another business’s automated message.';
}

function sharedContacts(list: SharedContact[]) {
  const lines = list.map((c) => {
    const name = c.name?.formatted_name || [c.name?.first_name, c.name?.last_name].filter(Boolean).join(' ') || 'No name';
    const who = c.org?.company ? `${name} (${c.org.company})` : name;
    const reach = [
      ...(c.phones ?? []).map((p) => p.phone || (p.wa_id ? `+${p.wa_id}` : '')),
      ...(c.emails ?? []).map((e) => e.email || ''),
    ].filter(Boolean);
    return reach.length ? `${who}: ${reach.join(', ')}` : `${who} (no number)`;
  });
  if (lines.length === 0) return '👤 Shared a contact';
  if (lines.length === 1) return `👤 Shared contact: ${lines[0]}`;
  return `👤 Shared ${lines.length} contacts:\n${lines.join('\n')}`;
}

function order(o: InboundMessage['order']) {
  const items = o?.product_items ?? [];
  const count = items.reduce((n, i) => n + (i.quantity || 1), 0);
  const total = items.reduce((t, i) => t + (i.item_price || 0) * (i.quantity || 1), 0);
  let money = '';
  try {
    if (total && items[0]?.currency) {
      money = `, ${new Intl.NumberFormat('en-GB', { style: 'currency', currency: items[0].currency }).format(total)}`;
    }
  } catch {
    // An unknown currency code: leave the total out.
  }
  const what = count ? `: ${count} item${count === 1 ? '' : 's'}${money}` : '';
  return `🛒 Order from your WhatsApp catalogue${what}${o?.text ? ` — ${o.text}` : ''}`;
}

function system(m: InboundMessage) {
  const s = m.system;
  const newNumber = s?.wa_id || (s?.new_wa_id ? String(s.new_wa_id) : '');
  const changedNumber = /changed_number$/.test(s?.type || '') && newNumber && newNumber !== m.from;
  // Meta's body has no full stop, and can end in invisible direction marks.
  const said = s?.body?.replace(/[\s\u200e\u200f]+$/, '') || (changedNumber ? 'They changed their WhatsApp number' : 'Their WhatsApp account changed');
  const stop = /[.!?]$/.test(said) ? '' : '.';
  // Messages from the new number won't find this lead (it's matched on number), so say so.
  return `ℹ️ ${said}${stop}${changedNumber ? ` New messages from +${newNumber} will start a new chat.` : ''}`;
}

/** A form's answers, one per line, with labels from its field names (screen_0_First_name_0 → First name). */
function formReply(r: FormReply) {
  const title = r.name === 'address_message' ? '🏠 Sent their address' : '📋 Filled in a form';
  let answers: string[] = [];
  try {
    const json: unknown = JSON.parse(r.response_json || '{}');
    answers = flatten(json);
  } catch {
    // Not JSON: just say a form came back.
  }
  return answers.length ? `${title}:\n${answers.join('\n')}` : title;
}

function flatten(value: unknown, depth = 0): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 1) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, v]) => {
    if (key === 'flow_token' || key.endsWith('_id') || v === '' || v === null || v === undefined) return [];
    if (typeof v === 'object' && !Array.isArray(v)) return flatten(v, depth + 1);
    const label = key.replace(/^screen_\d+_/, '').replace(/_\d+$/, '').replace(/_/g, ' ').trim();
    const text = Array.isArray(v) ? v.filter((x) => typeof x !== 'object').join(', ') : v === true ? 'Yes' : v === false ? 'No' : String(v);
    return text ? [`${label.charAt(0).toUpperCase()}${label.slice(1)}: ${text}`] : [];
  });
}
