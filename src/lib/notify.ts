import 'server-only';
import webpush from 'web-push';
import { fcmConfigured, sendFcm } from '@/lib/fcm';
import { PUSH_ACTIONS, signPushAction, type PushAction } from '@/lib/push-actions';
import { createAdminClient } from '@/lib/supabase/admin';

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
    const { data: row } = await admin
      .from('notifications')
      .insert({ user_id: n.userId, kind: n.kind, title: n.title, body: n.body ?? null, href: n.href ?? null })
      .select('id')
      .single();

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
