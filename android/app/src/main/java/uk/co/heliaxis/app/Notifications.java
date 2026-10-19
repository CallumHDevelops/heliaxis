package uk.co.heliaxis.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationChannelCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * Native notifications. Each type has its own channel, so people can choose the sound (or turn
 * one off) in Settings → Apps → Heliaxis → Notifications. Channel ids match channelFor() in
 * src/lib/notify.ts.
 */
final class Notifications {
    static final String GENERAL = "general";
    private static final List<String> CHANNELS = Arrays.asList("whatsapp", "leads", "tasks", "jobs", GENERAL);
    private static final int ID = 1; // one notification per tag; the tag says which
    /** The site's id for a notification (notifications.id), kept on it for dismiss(). */
    private static final String EXTRA_ID = "uk.co.heliaxis.app.NOTIFICATION_ID";

    private Notifications() {}

    static void createChannels(Context context) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(context);
        nm.createNotificationChannelsCompat(Arrays.asList(
                channel("whatsapp", "WhatsApp messages", "Messages from customers and new WhatsApp leads", true),
                channel("leads", "New leads", "New enquiries from the website, Meta ads and elsewhere", true),
                channel("tasks", "Tasks", "Tasks given to you, and tasks you set being done", false),
                channel("jobs", "Customers & jobs", "Surveys booked, quotes accepted, deposits paid and next steps", false),
                channel(GENERAL, "Other", "Everything else", false)));
    }

    private static NotificationChannelCompat channel(String id, String name, String description, boolean urgent) {
        return new NotificationChannelCompat.Builder(id,
                        urgent ? NotificationManagerCompat.IMPORTANCE_HIGH : NotificationManagerCompat.IMPORTANCE_DEFAULT)
                .setName(name)
                .setDescription(description)
                .setShowBadge(true)
                .build();
    }

    /** A message from src/lib/notify.ts: title, body, href, id, tag, channel, unread, actions. */
    static void show(Context context, Map<String, String> data) {
        String title = value(data, "title", "Heliaxis");
        String body = value(data, "body", "");
        String id = value(data, "id", "");
        String tag = value(data, "tag", "");
        if (tag.isEmpty()) tag = id.isEmpty() ? "n-" + System.currentTimeMillis() : "n-" + id;
        String channel = CHANNELS.contains(value(data, "channel", "")) ? data.get("channel") : GENERAL;
        boolean urgent = channel.equals("whatsapp") || channel.equals("leads");

        Uri page = pageUrl(value(data, "href", "/admin"));
        Uri open = id.isEmpty() ? page : Push.withFragmentParam(page, "hx-n", id);

        NotificationCompat.Builder b = new NotificationCompat.Builder(context, channel)
                .setSmallIcon(R.drawable.ic_notification_icon)
                .setColor(ContextCompat.getColor(context, R.color.notificationAccent))
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setCategory(channel.equals("whatsapp") ? NotificationCompat.CATEGORY_MESSAGE : NotificationCompat.CATEGORY_EVENT)
                .setPriority(urgent ? NotificationCompat.PRIORITY_HIGH : NotificationCompat.PRIORITY_DEFAULT)
                .setShowWhen(true)
                .setAutoCancel(true)
                .setContentIntent(openApp(context, open, tag));
        if (!id.isEmpty()) {
            Bundle extras = new Bundle();
            extras.putString(EXTRA_ID, id);
            b.addExtras(extras);
        }
        // No setNumber(): launchers add the numbers up across notifications, so the badge already
        // counts one per notification showing.

        // "Send now" / "Cancel reply" on a queued smart reply: each carries a signed token.
        try {
            String raw = value(data, "actions", "");
            JSONArray actions = raw.isEmpty() ? new JSONArray() : new JSONArray(raw);
            for (int i = 0; i < Math.min(actions.length(), 2); i++) {
                JSONObject a = actions.getJSONObject(i);
                Intent tap = new Intent(context, NotificationActionReceiver.class)
                        .putExtra(NotificationActionReceiver.EXTRA_TOKEN, a.getString("token"))
                        .putExtra(NotificationActionReceiver.EXTRA_TAG, tag)
                        .putExtra(NotificationActionReceiver.EXTRA_URL, page.toString());
                PendingIntent pi = PendingIntent.getBroadcast(context, (tag + "#" + i).hashCode(), tap,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                b.addAction(0, a.getString("title"), pi);
            }
        } catch (Exception ignored) {
            // no buttons, the notification still shows
        }

        post(context, tag, b);
    }

    /**
     * { type: dismiss, ids, tag }: someone read the chat or contacted the lead, so the site marked
     * these notifications read; take down any still showing. By id, so a newer one on the same tag
     * stays (a new message, or "Survey booked" after "New lead"); the tag only matches one shown
     * without an id (e.g. "Reply sent").
     */
    static void dismiss(Context context, Map<String, String> data) {
        List<String> ids = Arrays.asList(value(data, "ids", "").split(","));
        String tag = value(data, "tag", "");
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return;
        try {
            for (StatusBarNotification shown : nm.getActiveNotifications()) {
                Bundle extras = shown.getNotification().extras;
                String id = extras == null ? null : extras.getString(EXTRA_ID);
                boolean match = id != null && !id.isEmpty() ? ids.contains(id) : !tag.isEmpty() && tag.equals(shown.getTag());
                if (match) nm.cancel(shown.getTag(), shown.getId());
            }
        } catch (RuntimeException ignored) {
            // can't list them on this phone: leave them, tapping one still opens the app
        }
    }

    /** Replaces a notification after one of its buttons was tapped ("Reply sent" etc.). */
    static void showResult(Context context, String tag, String message, @Nullable String url) {
        NotificationCompat.Builder b = new NotificationCompat.Builder(context, "whatsapp")
                .setSmallIcon(R.drawable.ic_notification_icon)
                .setColor(ContextCompat.getColor(context, R.color.notificationAccent))
                .setContentTitle(message)
                .setSilent(true)
                .setAutoCancel(true)
                .setTimeoutAfter(6000);
        if (url != null) b.setContentIntent(openApp(context, Uri.parse(url), tag));
        post(context, tag, b);
    }

    @SuppressLint("MissingPermission") // checked just above
    private static void post(Context context, String tag, NotificationCompat.Builder b) {
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        NotificationManagerCompat.from(context).notify(tag, ID, b.build());
    }

    /** Only pages on our own site; anything else opens the dashboard. */
    private static Uri pageUrl(String href) {
        if (!href.startsWith("/") || href.startsWith("//")) href = "/admin";
        return Uri.parse(BuildConfig.SITE_ORIGIN + href);
    }

    private static PendingIntent openApp(Context context, Uri url, String tag) {
        Intent intent = new Intent(Intent.ACTION_VIEW, url, context, HeliaxisLauncherActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, tag.hashCode(), intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static String value(Map<String, String> data, String key, String fallback) {
        String v = data.get(key);
        return v == null || v.isEmpty() ? fallback : v;
    }
}
