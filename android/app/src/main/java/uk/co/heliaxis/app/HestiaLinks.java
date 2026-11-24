package uk.co.heliaxis.app;

import android.net.Uri;

import androidx.annotation.Nullable;

import java.util.regex.Pattern;

/**
 * Hestia's own links, heliaxis://hestia/…, used by the app shortcuts (res/xml/shortcuts.xml) and the
 * widget: each opens one of her full-screen pages on the site.
 *
 *   heliaxis://hestia/new             a new conversation                    /admin/hestia/new
 *   heliaxis://hestia/new?voice=1     a new conversation, mic on ("Talk")   /admin/hestia/new?voice=1
 *   heliaxis://hestia/last            the most recent conversation          /admin/hestia/last
 *   heliaxis://hestia/thread/{id}     one conversation                      /admin/hestia/thread/{id}
 *
 * They carry ids only; the site checks who is signed in and that the conversation is theirs. Anything
 * else under heliaxis://hestia opens a new conversation.
 */
final class HestiaLinks {
    private static final Pattern UUID = Pattern.compile("^[0-9a-fA-F-]{36}$");

    private HestiaLinks() {}

    static boolean isHestia(@Nullable Uri link) {
        return link != null && "heliaxis".equalsIgnoreCase(link.getScheme()) && "hestia".equalsIgnoreCase(link.getHost());
    }

    /** The page on the site a Hestia link opens. */
    static Uri toSite(Uri link) {
        String path = "/admin/hestia/new";
        java.util.List<String> parts = link.getPathSegments();
        String first = parts.isEmpty() ? "" : parts.get(0);
        if ("last".equals(first)) {
            path = "/admin/hestia/last";
        } else if ("thread".equals(first) && parts.size() > 1 && UUID.matcher(parts.get(1)).matches()) {
            path = "/admin/hestia/thread/" + parts.get(1).toLowerCase();
        }
        Uri.Builder site = Uri.parse(BuildConfig.SITE_ORIGIN + path).buildUpon();
        if (!path.endsWith("/last") && "1".equals(link.getQueryParameter("voice"))) site.appendQueryParameter("voice", "1");
        return site.build();
    }
}
