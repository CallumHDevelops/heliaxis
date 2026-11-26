package uk.co.heliaxis.app;

import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * The lines in the Metis widget's list, from the last widget the site sent (MetisWidget.saved):
 * Today (calendar), Needs you (emails, urgent first), Tasks, then Tomorrow.
 */
public class MetisWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Lines(getApplicationContext());
    }

    /** One line: a section heading, or an item with a time or due date, a title, a second line and a page. */
    private static final class Line {
        final boolean heading;
        final String left;
        final String title;
        final String sub;
        final String href;
        /** 0 none, 1 gold (important), 2 red (urgent or late). */
        final int mark;

        Line(boolean heading, String left, String title, String sub, String href, int mark) {
            this.heading = heading;
            this.left = left;
            this.title = title;
            this.sub = sub;
            this.href = href;
            this.mark = mark;
        }

        static Line heading(String title) {
            return new Line(true, "", title, "", "", 0);
        }
    }

    private static final class Lines implements RemoteViewsFactory {
        private final Context context;
        private final List<Line> lines = new ArrayList<>();

        Lines(Context context) {
            this.context = context;
        }

        @Override
        public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            lines.clear();
            JSONObject w = MetisWidget.saved(context);
            if (w == null) return; // the empty view says to open the app once

            // Today: the rest of today's calendar.
            JSONArray today = w.optJSONArray("c");
            if (today != null) {
                lines.add(Line.heading(context.getString(R.string.widgetToday)));
                if (today.length() == 0) lines.add(new Line(false, "", context.getString(R.string.widgetNothingToday), "", "/admin", 0));
                for (int i = 0; i < today.length(); i++) lines.add(event(today.optJSONObject(i)));
            } else if (w.has("k") || w.has("e")) {
                lines.add(Line.heading(context.getString(R.string.widgetToday)));
                lines.add(new Line(false, "", context.getString(R.string.widgetNoCalendar), "", "/admin", 0));
            }

            // Needs you: Metis's emails, the most important first.
            JSONObject email = w.optJSONObject("e");
            JSONArray mails = email != null ? email.optJSONArray("i") : null;
            if (mails != null && mails.length() > 0) {
                int need = email.optInt("n", mails.length());
                lines.add(Line.heading(context.getString(R.string.widgetNeedsYou, need)));
                for (int i = 0; i < mails.length(); i++) {
                    JSONObject m = mails.optJSONObject(i);
                    if (m == null) continue;
                    boolean urgent = m.optInt("u", 0) == 1;
                    lines.add(new Line(false, urgent ? context.getString(R.string.widgetUrgent) : "", m.optString("n"), m.optString("s"), m.optString("h", "/admin/mail"), urgent ? 2 : 1));
                }
            }

            // Tasks: follow-ups and tasks, late ones marked.
            JSONArray tasks = w.optJSONArray("k");
            if (tasks != null && tasks.length() > 0) {
                lines.add(Line.heading(context.getString(R.string.widgetTasks)));
                for (int i = 0; i < tasks.length(); i++) {
                    JSONObject t = tasks.optJSONObject(i);
                    if (t == null) continue;
                    boolean late = t.optInt("l", 0) == 1;
                    lines.add(new Line(false, t.optString("d"), t.optString("n"), t.optString("s"), t.optString("h", "/admin/tasks"), late ? 2 : 0));
                }
            }

            // Tomorrow: the first few.
            JSONArray tomorrow = w.optJSONArray("m");
            if (tomorrow != null && tomorrow.length() > 0) {
                lines.add(Line.heading(context.getString(R.string.widgetTomorrow)));
                for (int i = 0; i < tomorrow.length(); i++) lines.add(event(tomorrow.optJSONObject(i)));
            }
        }

        private Line event(JSONObject e) {
            if (e == null) return new Line(false, "", "", "", "/admin", 0);
            // A survey or install of ours opens that customer's job; anything else, the home page.
            return new Line(false, e.optString("t"), e.optString("n"), e.optString("w"), e.optString("h", "/admin"), 0);
        }

        @Override
        public void onDestroy() {
            lines.clear();
        }

        @Override
        public int getCount() {
            return lines.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            if (position < 0 || position >= lines.size()) return null;
            Line l = lines.get(position);
            if (l.heading) {
                RemoteViews h = new RemoteViews(context.getPackageName(), R.layout.widget_heading);
                h.setTextViewText(R.id.widget_heading_text, l.title);
                return h;
            }
            RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_line);
            v.setTextViewText(R.id.widget_line_left, l.left);
            v.setViewVisibility(R.id.widget_line_left, l.left.isEmpty() ? View.GONE : View.VISIBLE);
            v.setTextViewText(R.id.widget_line_title, l.title);
            v.setTextViewText(R.id.widget_line_sub, l.sub);
            v.setViewVisibility(R.id.widget_line_sub, l.sub.isEmpty() ? View.GONE : View.VISIBLE);
            int colour = l.mark == 2 ? R.color.widgetUrgent : l.mark == 1 ? R.color.widgetGold : android.R.color.transparent;
            v.setInt(R.id.widget_line_mark, "setBackgroundColor", ContextCompat.getColor(context, colour));
            v.setTextColor(R.id.widget_line_left, ContextCompat.getColor(context, l.mark == 2 ? R.color.widgetUrgent : R.color.widgetMuted));
            // Tapping the line opens its page (the template is in MetisWidget).
            v.setOnClickFillInIntent(R.id.widget_line, new Intent().setData(MetisWidget.page(l.href)));
            return v;
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 2;
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public boolean hasStableIds() {
            return false;
        }
    }
}
