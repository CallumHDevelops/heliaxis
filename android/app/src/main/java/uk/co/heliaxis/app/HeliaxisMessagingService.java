package uk.co.heliaxis.app;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Receives the site's data messages (src/lib/notify.ts): a notification to show, or, with
 * type "dismiss", one to take down because it's been dealt with elsewhere (chat read, lead contacted).
 */
public class HeliaxisMessagingService extends FirebaseMessagingService {
    @Override
    @SuppressWarnings("deprecation") // pairs with FirebaseMessaging.getToken()
    public void onNewToken(@NonNull String token) {
        // The site picks the new token up the next time the app is opened.
        Push.saveToken(this, token);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();
        String type = data.get("type");
        if (type == null || type.isEmpty()) Notifications.show(this, data);
        else if (type.equals("dismiss")) Notifications.dismiss(this, data);
        // Any other type is from a newer site than this app knows: ignore it rather than show a blank.
    }
}
