package uk.co.heliaxis.app;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/** Receives the site's notifications (data messages from src/lib/notify.ts) and shows them. */
public class HeliaxisMessagingService extends FirebaseMessagingService {
    @Override
    @SuppressWarnings("deprecation") // pairs with FirebaseMessaging.getToken()
    public void onNewToken(@NonNull String token) {
        // The site picks the new token up the next time the app is opened.
        Push.saveToken(this, token);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Notifications.show(this, message.getData());
    }
}
