import 'server-only';
import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Notify a user: a row for the header bell, plus a Web Push to every device they've
 * turned notifications on for (phone app, browsers). Best-effort — a failed push never
 * fails the action that caused it. Push is skipped until the VAPID keys are set.
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

    if (!vapid()) return;
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', n.userId);
    const payload = JSON.stringify({
      id: row?.id,
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
  } catch {
    // Tables not migrated yet, or push service down — never block the caller.
  }
}
