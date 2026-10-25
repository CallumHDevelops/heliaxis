---
title: Set up phone notifications
summary: The database files and keys that switch on the bell, phone notifications and proper Android app notifications.
order: 230
keywords: push notifications, phone notifications, VAPID, Generate keys, Firebase, Android notifications, native notifications, notifications.sql, native-push.sql, notifications not arriving
where: Dashboard › From Claude
access: admin
---
> **Admins only:** These are setup jobs on the **From Claude** card. Only an admin can press **Generate keys**.

How staff turn notifications on for their own phone is in [Notifications and the bell](/admin/help/getting-started/notifications). Behind that, an admin switches on three things, each a job on the From Claude card.

## 1. The bell: notifications.sql

**Run notifications.sql in Supabase** switches on the notification bell and phone notifications. Then **Run notifications-ref.sql in Supabase** makes WhatsApp and new-lead notifications clear for everyone once the chat is read or the lead is contacted. See [Switch a feature on (run a database file)](/admin/help/admin/run-a-database-file).

## 2. Phone and browser notifications: the three keys

Open **Add the phone notification keys**.

1. Press **Generate keys**. Three keys appear, each with **Copy name** and **Copy value**.
2. Copy all three into Vercel straight away: they aren’t saved anywhere, and the middle one is secret. See [The Vercel keys page](/admin/help/admin/vercel-keys) for how.
3. Redeploy.
4. On each phone, open the app, tap the bell (top right) and tap **Turn on**. People with Enquiries also see a **Turn on** banner at the top of Enquiries and the WhatsApp inbox. See [Notifications and the bell](/admin/help/getting-started/notifications).

> **Watch out:** Generate them once only. New keys after people have turned notifications on means everyone turning them on again.

## 3. Proper Android notifications: Firebase

The Android app can show real Android notifications, with their own sounds, instead of web ones. That needs:

- **Run native-push.sql in Supabase** (after notifications.sql).
- **Set up native Android notifications**: a free Firebase project. The job walks you through creating it, registering the Android app and pasting its service account file into Vercel.
- **Publish the new Android app (GitHub builds it)**: adds the Firebase details to GitHub and builds the new app. Everyone then sees an **Update** banner in their app.

Until Firebase is set up, the Android app uses the phone notifications from step 2.
