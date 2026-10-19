import 'server-only';
import webpush from 'web-push';
import { fcmConfigured, sendFcm } from '@/lib/fcm';
import { PUSH_ACTIONS, signPushAction, type PushAction } from '@/lib/push-actions';
import { createAdminClient } from '@/lib/supabase/admin';
import { chatHref, chatRef, chatTag, LEGACY_CHAT_TITLE, LEGACY_REPLY_TITLE, leadRef, replyRef } from '@/lib/notification-refs';

/**
 * Notify a user: a row for the header bell, plus a Web Push to every browser they've turned
 * notifications on for, and a native notification to each Android app (Firebase). Best-effort:
 * a failed push never fails the action that caused it. Web Push is skipped until the VAPID keys
 * are set, native until FIREBASE_SERVICE_ACCOUNT is.
 */
export type NotificationInput = {
  userId: string;
  kind: string;
  title: string;
  body?: string | null;
  href?: string | null;
  /** Same tag = replaces the earlier notification (e.g. one per WhatsApp chat) and buzzes again. */
  tag?: string;
  /** Buttons on the notification (Android). Handled in the service worker's notificationclick. */
  actions?: { action: string; title: string }[];
  /** Extra data for those buttons, e.g. { outboxId }. */
  data?: Record<string, string>;
  /** What it's about (chatRef, replyRef, leadRef), so it can go by itself once that's dealt with. */
  ref?: string;
};

let vapidReady: boolean | null = null;
function vapid() {
  if (vapidReady !== null) return vapidReady;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  vapidReady = !!(pub && priv);
  if (vapidReady) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hello@heliaxis.co.uk', pub!, priv!);
  return vapidReady;
}

export async function notify(n: NotificationInput) {
  const admin = createAdminClient();
  try {
    const base = { user_id: n.userId, kind: n.kind, title: n.title, body: n.body ?? null, href: n.href ?? null };
    const save = (values: typeof base & { ref?: string }) => admin.from('notifications').insert(values).select('id').single();
    let saved = await save(n.ref ? { ...base, ref: n.ref } : base);
    // No ref column until notifications-ref.sql has been run: save it without.
    if (saved.error && n.ref) saved = await save(base);
    const row = saved.data;

    const web = vapid();
    const native = fcmConfigured();
    if (!web && !native) return;
    const { count } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', n.userId)
      .is('read_at', null);
    const unread = count ?? undefined;
    await Promise.all([web && webPush(admin, n, row?.id, unread), native && nativePush(admin, n, row?.id, unread)]);
  } catch {
    // Tables not migrated yet, or push service down — never block the caller.
  }
}

type Admin = ReturnType<typeof createAdminClient>;

async function webPush(admin: Admin, n: NotificationInput, id: string | undefined, unread: number | undefined) {
  const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', n.userId);
  const payload = JSON.stringify({
    id,
    // For the count on the app icon (iPhone Home Screen app).
    unread,
    title: n.title,
    body: n.body ?? '',
    href: n.href ?? '/admin',
    tag: n.tag,
    ref: n.ref,
    actions: n.actions,
    data: n.data,
  });
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60 * 24 }
        );
        await admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', s.id);
      } catch (e) {
        // 404/410: the device unsubscribed or the app was removed — forget it.
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', s.id);
      }
    })
  );
}

/** Which Android notification channel (sound/importance the person can set per type). */
function channelFor(kind: string) {
  if (kind === 'whatsapp') return 'whatsapp';
  if (kind === 'crm_new_lead' || kind === 'crm_first_response') return 'leads';
  if (kind.startsWith('task')) return 'tasks';
  if (kind.startsWith('crm_')) return 'jobs';
  return 'general';
}

/** The Android app (Firebase). Data-only, so the app builds the notification itself. */
async function nativePush(admin: Admin, n: NotificationInput, id: string | undefined, unread: number | undefined) {
  const { data: tokens, error } = await admin.from('native_push_tokens').select('id, token').eq('user_id', n.userId);
  if (error || !tokens?.length) return;
  const outboxId = n.data?.outboxId;
  const buttons = outboxId
    ? (n.actions ?? []).flatMap((a) => {
        const token = PUSH_ACTIONS.includes(a.action as PushAction) ? signPushAction(a.action as PushAction, outboxId) : null;
        return token ? [{ title: a.title, token }] : [];
      })
    : [];
  // FCM data values are strings, and the whole message must stay under 4 KB.
  const data: Record<string, string> = {
    id: id ?? '',
    title: n.title.slice(0, 200),
    body: (n.body ?? '').slice(0, 1000),
    href: n.href ?? '/admin',
    tag: n.tag ?? '',
    channel: channelFor(n.kind),
    unread: unread === undefined ? '' : String(unread),
    actions: buttons.length ? JSON.stringify(buttons.slice(0, 2)) : '',
  };
  await Promise.all(
    tokens.map(async (t) => {
      const r = await sendFcm(t.token, data);
      if (r === 'ok') await admin.from('native_push_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', t.id);
      if (r === 'gone') await admin.from('native_push_tokens').delete().eq('id', t.id);
    })
  );
}

/* ── Notifications that go by themselves ─────────────────────────────────────────── */

/**
 * First Android app build that understands { type: 'dismiss' } (the release after versionCode 2 in
 * android/release.json). Older builds would show it as an empty notification, so they never get one.
 */
const DISMISS_FROM_APP_VERSION = 3;

/** Notifications saved before the ref column, recognised by where they link to, their kind and title. */
type Legacy = { href: string; kinds: string[]; title?: RegExp };

/**
 * Mark everyone's unread notifications about `ref` read, and take them off their Android phones.
 * `legacy` finds the same ones from before notifications.ref (or while its SQL hasn't been run).
 * Best-effort, like notify(): never fails the caller.
 *
 * Web Push can't do the same: browsers must show a notification for every push (Chrome shows its
 * own "updated in the background" one, Safari drops the subscription), so a browser closes them
 * itself when the chat is opened there or the bell next loads (HeaderUser, ChatThread).
 */
async function clearRef(ref: string, legacy: Legacy[], tag?: string) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  try {
    const cleared: Cleared[] = [];
    const byRef = await admin
      .from('notifications')
      .update({ read_at: now })
      .eq('ref', ref)
      .is('read_at', null)
      .select('id, user_id, created_at');
    cleared.push(...((byRef.data ?? []) as Cleared[]));

    let q = admin
      .from('notifications')
      .select('id, kind, title, href')
      .is('read_at', null)
      .in('href', [...new Set(legacy.map((l) => l.href))]);
    if (!byRef.error) q = q.is('ref', null);
    const { data: old } = await q.limit(500);
    const ids = (old ?? [])
      .filter((r) => legacy.some((l) => l.href === r.href && l.kinds.includes(r.kind) && (!l.title || l.title.test(r.title))))
      .map((r) => r.id);
    if (ids.length) {
      const { data } = await admin
        .from('notifications')
        .update({ read_at: now })
        .in('id', ids)
        .is('read_at', null)
        .select('id, user_id, created_at');
      cleared.push(...((data ?? []) as Cleared[]));
    }

    if (cleared.length && fcmConfigured()) await dismissNative(admin, cleared, tag);
  } catch {
    // Tables not migrated yet — never block the caller.
  }
}

type Cleared = { id: string; user_id: string; created_at: string };

/**
 * A data message the app turns into "take these down" (Notifications.dismiss). By notification id,
 * so a newer one on the same tag that arrives first (this one can wait for a dozing phone) stays.
 */
async function dismissNative(admin: Admin, cleared: Cleared[], tag?: string) {
  const byUser = new Map<string, string[]>();
  for (const r of [...cleared].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.id]);
  }
  const { data: tokens } = await admin
    .from('native_push_tokens')
    .select('id, token, user_id')
    .in('user_id', [...byUser.keys()])
    .gte('app_version', DISMISS_FROM_APP_VERSION);
  await Promise.all(
    (tokens ?? []).map(async (t) => {
      // Newest first: what's showing is the latest on its tag. FCM data must stay under 4 KB.
      const ids = (byUser.get(t.user_id) ?? []).slice(0, 60).join(',');
      // Normal priority: nothing shows, so it mustn't count against the app's high-priority messages.
      const r = await sendFcm(t.token, { type: 'dismiss', ids, tag: tag ?? '' }, 'NORMAL');
      if (r === 'gone') await admin.from('native_push_tokens').delete().eq('id', t.id);
    })
  );
}

/** Anyone read the chat: its message notifications go, for everyone. */
export function clearChatNotifications(enquiryId: string) {
  return clearRef(chatRef(enquiryId), [{ href: chatHref(enquiryId), kinds: ['whatsapp'], title: LEGACY_CHAT_TITLE }], chatTag(enquiryId));
}

/** Anyone replied on WhatsApp: "… is waiting for a reply" goes. */
export function clearReplyNotifications(enquiryId: string) {
  return clearRef(replyRef(enquiryId), [{ href: chatHref(enquiryId), kinds: ['whatsapp'], title: LEGACY_REPLY_TITLE }]);
}

/** The lead was contacted for the first time: "New lead …" and "… hasn't been contacted" go. */
export function clearLeadNotifications(enquiryId: string, projectIds: string[]) {
  return clearRef(leadRef(enquiryId), [
    ...projectIds.map((id) => ({ href: `/admin/crm/${id}`, kinds: ['crm_new_lead', 'crm_first_response'] })),
    { href: chatHref(enquiryId), kinds: ['whatsapp'], title: /^New Meta lead: / },
  ]);
}
