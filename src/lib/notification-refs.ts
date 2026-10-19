/**
 * What a notification is about (notifications.ref), so it can go by itself once that's dealt with:
 * - chatRef: a customer's WhatsApp messages (and "New WhatsApp lead"), read when anyone reads the chat;
 * - replyRef: "… is waiting for a reply", read when anyone replies;
 * - leadRef: a new lead or "… hasn't been contacted", read when anyone first contacts them.
 * The ref also rides on the push, so the Android app and the browser can take the notification
 * down. Shared by the server (src/lib/notify.ts) and the browser (no server-only imports here).
 */
export const chatRef = (enquiryId: string) => `wa:${enquiryId}`;
export const replyRef = (enquiryId: string) => `wa-reply:${enquiryId}`;
export const leadRef = (enquiryId: string) => `lead:${enquiryId}`;

/** A chat's page, and its push tag (a new message replaces the notification before it). */
export const chatHref = (enquiryId: string) => `/admin/enquiries/inbox/${enquiryId}`;
export const chatTag = (enquiryId: string) => `wa-${enquiryId}`;

/** Fired on window when this tab changes notifications (e.g. it read a chat), so the bell reloads. */
export const NOTIFICATIONS_CHANGED = 'hx-notifications-changed';

/** Titles of notifications saved before the ref column existed (src/lib/whatsapp/inbox.ts). */
export const LEGACY_CHAT_TITLE = /^(WhatsApp from |New WhatsApp lead: )/;
export const LEGACY_REPLY_TITLE = / is waiting for a reply$/;
const CHAT_HREF = /^\/admin\/enquiries\/inbox\/[0-9a-f-]{36}$/i;

/** About a WhatsApp chat: noise once read, so read ones drop out of the bell. */
export function isChatNotification(n: { kind: string; title: string; href: string | null; ref?: string | null }) {
  if (n.ref) return n.ref.startsWith('wa:') || n.ref.startsWith('wa-reply:');
  return n.kind === 'whatsapp' && CHAT_HREF.test(n.href || '') && (LEGACY_CHAT_TITLE.test(n.title) || LEGACY_REPLY_TITLE.test(n.title));
}
