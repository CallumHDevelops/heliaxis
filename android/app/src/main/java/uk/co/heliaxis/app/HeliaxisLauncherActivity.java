package uk.co.heliaxis.app;

import android.Manifest;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationManagerCompat;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

/**
 * Opens heliaxis.co.uk full-screen in Chrome (Trusted Web Activity), like the stock launcher,
 * but first: asks once for notification permission (Android 13+), and makes sure we have this
 * phone's Firebase token so the site can register it for native notifications.
 */
public class HeliaxisLauncherActivity extends LauncherActivity {
    private static final int ASK_NOTIFICATIONS = 1;
    private static final String ASKED = "askedNotifications";
    /** First launch only: how long to wait for a Firebase token before opening anyway. */
    private static final long TOKEN_WAIT_MS = 1500;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean preparing;
    private boolean launched;

    @Override
    protected boolean shouldLaunchImmediately() {
        return false; // we call launchTwa() ourselves, once ready
    }

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The base class finishes straight away when the app is already open, etc.
        if (isFinishing()) return;
        if (shouldAskForNotifications()) {
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, ASK_NOTIFICATIONS);
            return;
        }
        prepareAndLaunch();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == ASK_NOTIFICATIONS) prepareAndLaunch();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    private boolean shouldAskForNotifications() {
        if (Build.VERSION.SDK_INT < 33) return false;
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return false;
        SharedPreferences prefs = Push.prefs(this);
        if (prefs.getBoolean(ASKED, false)) return false; // asked before: they can change it in Settings
        prefs.edit().putBoolean(ASKED, true).apply();
        return true;
    }

    private void prepareAndLaunch() {
        if (preparing) return;
        preparing = true;
        if (Push.cachedToken(this) != null || !Push.firebaseReady(this)) {
            open();
            Push.fetchToken(this, () -> {}); // keep the saved token fresh for next time
            return;
        }
        handler.postDelayed(this::open, TOKEN_WAIT_MS);
        Push.fetchToken(this, this::open);
    }

    private void open() {
        // isDestroyed: the token can arrive after a rotation replaced this instance.
        if (launched || isFinishing() || isDestroyed()) return;
        launched = true;
        handler.removeCallbacksAndMessages(null);
        launchTwa();
    }

    @Override
    protected Uri getLaunchingUrl() {
        return Push.withToken(
                super.getLaunchingUrl(),
                Push.cachedToken(this),
                NotificationManagerCompat.from(this).areNotificationsEnabled());
    }
}
