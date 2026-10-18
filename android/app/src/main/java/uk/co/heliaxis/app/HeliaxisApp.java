package uk.co.heliaxis.app;

import android.app.Application;

/** Sets up the notification channels (people can turn each type on/off in Android settings). */
public class HeliaxisApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        Notifications.createChannels(this);
    }
}
