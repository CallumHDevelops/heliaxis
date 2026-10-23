package uk.co.heliaxis.app;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.browser.customtabs.CustomTabsService;
import androidx.core.app.NotificationManagerCompat;

import com.google.androidbrowserhelper.trusted.LauncherActivity;
import com.google.androidbrowserhelper.trusted.SessionStore;
import com.google.androidbrowserhelper.trusted.SharedPreferencesTokenStore;
import com.google.androidbrowserhelper.trusted.TwaLauncher;

import java.util.List;

/**
 * Opens heliaxis.co.uk full-screen in Chrome (Trusted Web Activity), like the stock launcher,
 * but first: asks once for notification permission (Android 13+), and makes sure we have this
 * phone's Firebase token so the site can register it for native notifications.
 *
 * Always Chrome when the phone has it, not the default browser. Samsung Internet's own dark mode
 * darkens every page it shows, the app's Light theme included, and tells the page the phone is
 * light, so nothing in the page can stop it (the owner's phone, 23 Oct). Chrome keeps a page that
 * asks to stay light, light. Without Chrome the library chooses, as before.
 */
public class HeliaxisLauncherActivity extends LauncherActivity {
    /** The browsers to open the app in, best first, when installed and able to run it full-screen. */
    private static final String[] PREFERRED_BROWSERS = {"com.android.chrome"};

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
    protected TwaLauncher createTwaLauncher() {
        String browser = preferredBrowser();
        if (browser == null) return super.createTwaLauncher();
        return new TwaLauncher(this, browser, SessionStore.makeSessionId(getTaskId()), new SharedPreferencesTokenStore(this));
    }

    /** The first preferred browser that can run a Trusted Web Activity, as the library's own picker tests it. */
    @Nullable
    private String preferredBrowser() {
        PackageManager pm = getPackageManager();
        for (String browser : PREFERRED_BROWSERS) {
            Intent connect = new Intent(CustomTabsService.ACTION_CUSTOM_TABS_CONNECTION).setPackage(browser);
            List<ResolveInfo> services = pm.queryIntentServices(connect, PackageManager.GET_RESOLVED_FILTER);
            for (ResolveInfo service : services) {
                if (service.filter != null && service.filter.hasCategory(CustomTabsService.TRUSTED_WEB_ACTIVITY_CATEGORY)) return browser;
            }
        }
        return null;
    }

    @Override
    protected Uri getLaunchingUrl() {
        return Push.withToken(
                super.getLaunchingUrl(),
                Push.cachedToken(this),
                NotificationManagerCompat.from(this).areNotificationsEnabled());
    }
}
