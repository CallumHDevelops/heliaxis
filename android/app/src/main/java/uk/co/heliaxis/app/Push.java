package uk.co.heliaxis.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.Nullable;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * This phone's Firebase token. The site learns it each time the app opens a page: we add
 * #hx-fcm=<token>&hx-np=<1|0> to the address (src/lib/push-client.ts reads and removes it).
 */
final class Push {
    private static final String PREFS = "heliaxis";
    private static final String TOKEN = "fcmToken";
    /** Keys only this app may put in the fragment; a link from elsewhere can't smuggle them in. */
    private static final String[] APP_KEYS = {"hx-fcm", "hx-np"};

    private Push() {}

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** False when the APK was built without google-services.json (web notifications only). */
    static boolean firebaseReady(Context context) {
        return !FirebaseApp.getApps(context).isEmpty();
    }

    @Nullable
    static String cachedToken(Context context) {
        return prefs(context).getString(TOKEN, null);
    }

    static void saveToken(Context context, String token) {
        prefs(context).edit().putString(TOKEN, token).apply();
    }

    /** Fetch (or refresh) the token, then run {@code done} on the main thread either way. */
    @SuppressWarnings("deprecation") // getToken() is still the token FCM HTTP v1 sends to.
    static void fetchToken(Context context, Runnable done) {
        Context app = context.getApplicationContext();
        Handler main = new Handler(Looper.getMainLooper());
        if (!firebaseReady(app)) {
            main.post(done);
            return;
        }
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (task.isSuccessful() && task.getResult() != null) saveToken(app, task.getResult());
                main.post(done);
            });
        } catch (RuntimeException e) {
            main.post(done);
        }
    }

    /** {@code url} with our keys replaced by this phone's token and notification setting. */
    static Uri withToken(Uri url, @Nullable String token, boolean notificationsOn) {
        StringBuilder fragment = new StringBuilder(withoutAppKeys(url.getEncodedFragment()));
        if (token != null) {
            if (fragment.length() > 0) fragment.append('&');
            fragment.append("hx-fcm=").append(Uri.encode(token)).append("&hx-np=").append(notificationsOn ? '1' : '0');
        }
        return url.buildUpon().encodedFragment(fragment.length() > 0 ? fragment.toString() : null).build();
    }

    /** {@code url} with {@code key=value} added to its fragment. */
    static Uri withFragmentParam(Uri url, String key, String value) {
        String existing = url.getEncodedFragment();
        String param = key + "=" + Uri.encode(value);
        return url.buildUpon()
                .encodedFragment(existing == null || existing.isEmpty() ? param : existing + "&" + param)
                .build();
    }

    private static String withoutAppKeys(@Nullable String fragment) {
        if (fragment == null || fragment.isEmpty()) return "";
        StringBuilder out = new StringBuilder();
        for (String part : fragment.split("&")) {
            if (part.isEmpty() || isAppKey(Uri.decode(part.split("=", 2)[0]))) continue;
            if (out.length() > 0) out.append('&');
            out.append(part);
        }
        return out.toString();
    }

    private static boolean isAppKey(String key) {
        for (String k : APP_KEYS) if (k.equals(key)) return true;
        return false;
    }
}
