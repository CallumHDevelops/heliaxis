package uk.co.heliaxis.app;

import android.net.Uri;

import androidx.annotation.Nullable;

import java.util.regex.Pattern;

/**
 * Metis's own links, heliaxis://metis/…, used by the app shortcuts (res/xml/shortcuts.xml) and the
 * widget: each opens one of her full-screen pages on the site.
 *
 *   heliaxis://metis/new             a new conversation                    /admin/metis/new
 *   heliaxis://metis/new?voice=1     a new conversation, mic on ("Talk")   /admin/metis/new?voice=1
 *   heliaxis://metis/last            the most recent conversation          /admin/metis/last
 *   heliaxis://metis/thread/{id}     one conversation                      /admin/metis/thread/{id}
 *
 * They carry ids only; the site checks who is signed in and that the conversation is theirs. Anything
 * else under heliaxis://metis opens a new conversation.
 */
final class MetisLinks {
    private static final Pattern UUID = Pattern.compile("^[0-9a-fA-F-]{36}$");

    private MetisLinks() {}

    static boolean isMetis(@Nullable Uri link) {
        return link != null && "heliaxis".equalsIgnoreCase(link.getScheme()) && "metis".equalsIgnoreCase(link.getHost());
    }

    /** The page on the site a Metis link opens. */
    static Uri toSite(Uri link) {
        String path = "/admin/metis/new";
        java.util.List<String> parts = link.getPathSegments();
        String first = parts.isEmpty() ? "" : parts.get(0);
        if ("last".equals(first)) {
            path = "/admin/metis/last";
        } else if ("thread".equals(first) && parts.size() > 1 && UUID.matcher(parts.get(1)).matches()) {
            path = "/admin/metis/thread/" + parts.get(1).toLowerCase();
        }
        Uri.Builder site = Uri.parse(BuildConfig.SITE_ORIGIN + path).buildUpon();
        if (!path.endsWith("/last") && "1".equals(link.getQueryParameter("voice"))) site.appendQueryParameter("voice", "1");
        return site.build();
    }
}
