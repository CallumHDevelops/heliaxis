package uk.co.heliaxis.app;

import android.net.Uri;

/** The Metis icon: the same app, opened straight onto the assistant chat (/admin/assistant). */
public class MetisLauncherActivity extends HeliaxisLauncherActivity {
    @Override
    protected Uri getLaunchingUrl() {
        return super.getLaunchingUrl().buildUpon().path("/admin/assistant").build();
    }
}
