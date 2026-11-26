package uk.co.heliaxis.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;

import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Metis on the home screen: today's calendar, the emails that need you and your tasks, in a list that scrolls.
 *
 * The phone never fetches it: the site sends it as a Firebase data message ({ type: "widget", w: "<json>" }, see
 * src/lib/widget.ts) every 15 minutes, whenever Metis has sorted something new, and whenever the app is opened.
 * It's kept in SharedPreferences, so the widget shows the last one straight away, even offline. Tapping a line opens
 * that page in the app; tapping the header opens the dashboard.
 */
public class MetisWidget extends AppWidgetProvider {
    static final String PREF_KEY = "hestiaWidget";
    /** Older than this and the header says when it was last updated. */
    private static final long STALE_MS = 2 * 60 * 60 * 1000L;

    /** A new widget from the site: keep it and redraw every Metis widget on the home screens. */
    static void save(Context context, @Nullable String json) {
        if (json == null || json.isEmpty()) return;
        try {
            new JSONObject(json); // only keep what we can read
        } catch (Exception e) {
            return;
        }
        Push.prefs(context).edit().putString(PREF_KEY, json).apply();
        updateAll(context);
    }

    @Nullable
    static JSONObject saved(Context context) {
        String raw = Push.prefs(context).getString(PREF_KEY, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    static void updateAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(context, MetisWidget.class));
        if (ids == null || ids.length == 0) return;
        for (int id : ids) mgr.updateAppWidget(id, build(context, id));
        mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(context, id));
        mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }

    private static RemoteViews build(Context context, int widgetId) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_metis);
        JSONObject w = saved(context);

        // Header: the day, and how many emails need you (urgent ones called out).
        String day = w != null ? w.optString("d", "") : "";
        if (day.isEmpty()) day = new SimpleDateFormat("EEE d MMM", Locale.UK).format(new Date());
        v.setTextViewText(R.id.widget_day, day);

        JSONObject email = w != null ? w.optJSONObject("e") : null;
        int need = email != null ? email.optInt("n", 0) : 0;
        int urgent = email != null ? email.optInt("u", 0) : 0;
        if (need > 0) {
            v.setViewVisibility(R.id.widget_badge, View.VISIBLE);
            v.setTextViewText(R.id.widget_badge, urgent > 0 ? need + " need you · " + urgent + " urgent" : need + " need you");
            v.setInt(R.id.widget_badge, "setBackgroundResource", urgent > 0 ? R.drawable.widget_badge_urgent : R.drawable.widget_badge);
            v.setTextColor(R.id.widget_badge, ContextCompat.getColor(context, urgent > 0 ? R.color.widgetOnUrgent : R.color.widgetInk));
            v.setOnClickPendingIntent(R.id.widget_badge, open(context, "/admin/mail", 2));
        } else {
            v.setViewVisibility(R.id.widget_badge, View.GONE);
        }

        // "Updated 09:15" only when it's old (no signal, or the phone asleep for a long time).
        long at = w != null ? w.optLong("at", 0) : 0;
        if (at > 0 && System.currentTimeMillis() - at > STALE_MS) {
            v.setViewVisibility(R.id.widget_stale, View.VISIBLE);
            v.setTextViewText(R.id.widget_stale, context.getString(R.string.widgetUpdated, DateFormat.getTimeInstance(DateFormat.SHORT, Locale.UK).format(new Date(at))));
        } else {
            v.setViewVisibility(R.id.widget_stale, View.GONE);
        }

        // The list: one adapter per widget (the data URI keeps them apart).
        Intent adapter = new Intent(context, MetisWidgetService.class)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        adapter.setData(Uri.parse(adapter.toUri(Intent.URI_INTENT_SCHEME)));
        v.setRemoteAdapter(R.id.widget_list, adapter);
        v.setEmptyView(R.id.widget_list, R.id.widget_empty);
        v.setTextViewText(R.id.widget_empty, context.getString(w == null ? R.string.widgetFirstRun : R.string.widgetNothing));

        // Each line fills in its own page (MetisWidgetService); the header opens the dashboard.
        Intent template = new Intent(Intent.ACTION_VIEW, null, context, HeliaxisLauncherActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int mutable = Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0;
        v.setPendingIntentTemplate(R.id.widget_list,
                PendingIntent.getActivity(context, 1000 + widgetId, template, PendingIntent.FLAG_UPDATE_CURRENT | mutable));
        v.setOnClickPendingIntent(R.id.widget_header, open(context, "/admin", 1));
        v.setOnClickPendingIntent(R.id.widget_empty, open(context, "/admin", 3));
        return v;
    }

    /** A page on our own site, opened in the app. Anything else opens the dashboard. */
    static Uri page(String href) {
        if (href == null || !href.startsWith("/") || href.startsWith("//")) href = "/admin";
        return Uri.parse(BuildConfig.SITE_ORIGIN + href);
    }

    private static PendingIntent open(Context context, String href, int code) {
        Intent intent = new Intent(Intent.ACTION_VIEW, page(href), context, HeliaxisLauncherActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
