package uk.co.heliaxis.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * A button on a notification ("Send now" / "Cancel reply"). Posts the button's signed token to
 * /api/push/native/action (no sign-in needed) and swaps the notification for the outcome.
 */
public class NotificationActionReceiver extends BroadcastReceiver {
    static final String EXTRA_TOKEN = "token";
    static final String EXTRA_TAG = "tag";
    static final String EXTRA_URL = "url";
    private static final String FAILED = "Couldn’t do that. Open the chat.";

    @Override
    public void onReceive(Context context, Intent intent) {
        String token = intent.getStringExtra(EXTRA_TOKEN);
        String tag = intent.getStringExtra(EXTRA_TAG);
        String url = intent.getStringExtra(EXTRA_URL);
        if (token == null || tag == null) return;
        Context app = context.getApplicationContext();
        PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                Notifications.showResult(app, tag, send(token), url);
            } finally {
                pending.finish();
            }
        }).start();
    }

    private static String send(String token) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(BuildConfig.SITE_ORIGIN + "/api/push/native/action").openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(4000);
            c.setReadTimeout(5000);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            try (OutputStream out = c.getOutputStream()) {
                out.write(new JSONObject().put("token", token).toString().getBytes(StandardCharsets.UTF_8));
            }
            int code = c.getResponseCode();
            InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
            if (in == null) return FAILED;
            ByteArrayOutputStream body = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            for (int n; (n = in.read(buf)) > 0; ) body.write(buf, 0, n);
            in.close();
            return new JSONObject(body.toString("UTF-8")).optString("message", code < 400 ? "Done" : FAILED);
        } catch (Exception e) {
            return FAILED;
        } finally {
            if (c != null) c.disconnect();
        }
    }
}
