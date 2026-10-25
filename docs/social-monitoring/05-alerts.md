# 05 · Notifications

**Simple notifications only.** A risky comment sends one notification through the app's existing `notify()`. That means a bell entry, a Web Push to every browser or iPhone Home Screen app the person has turned notifications on for, and a notification on the Android app. **No SMS, no phone calls, no repeat reminders, no escalation chain.** (Decided by Cal, 25 Oct 2026.)

## 1. Who gets notified

**Everyone who has access to Social Monitoring:** every approved admin, plus every approved member with the **Social monitoring** tick on the Users page (`profiles.portals` contains `social_monitoring`). There are no separate recipient lists to maintain. Give someone the tick, and they get the alerts.

## 2. What sends a notification

| Event | Notified | Title / body | Links to |
|---|---|---|---|
| Critical mention | Everyone with access, immediately | `CRITICAL · Facebook comment` / first 120 characters of the comment | `/admin/social/review/{id}` |
| High mention | Everyone with access, immediately (deferred to the end of quiet hours if it arrives during them) | `High · Google ★1 review` / first 120 characters | same |
| Severity rises after the AI or an edit (e.g. Medium → Critical) | Everyone with access | as above, for the new severity | same |
| Medium, Low | Nobody. Bell count and badges only | — | — |
| Positive | One daily digest at the digest time: `3 positive comments today` | | `/admin/social?severity=positive` |
| A connection stops working or a key expires within 7 days | Admins | `Social monitoring: Trustpilot isn't connecting` | `/admin/social/settings` |
| Jobs failing (a job reaches `failed`, or AI classification is unavailable 3 times in 15 min) | Admins | `Social monitoring needs a look` | `/admin/social/settings` |
| Daily check failed (§5) | Admins, by **email** (Resend) as well as `notify()` | | |

Quiet hours (default 21:00–07:30) hold High notifications until the morning. **Critical always notifies straight away.**

## 3. The notification call

```ts
await Promise.all(recipients.map((userId) =>
  notify({
    userId,
    kind: 'social_critical',              // social_critical | social_high | social_digest | social_system
    title: `CRITICAL · ${platformLabel} ${kindLabel}`,
    body: excerpt(mention.text, 120),
    href: `/admin/social/review/${mention.id}`,
    tag: `social-${mention.id}`,          // a later notification for the same comment replaces this one
    ref: `social:${mention.id}`,          // cleared for everyone once the comment is dealt with
  })
));
```

- **Recipients**: `profiles` where `status = 'approved'` and (`role = 'admin'` or `'social_monitoring' = any(portals)`).
- **Idempotency**: before sending, insert a `social_alert` row with a unique `dedupe_key` (`mention:{id}:v{version}:{severity}`). If the insert conflicts, the notification was already sent, so skip it. A retried job never notifies twice.
- **Clearing**: when the comment is marked Posted or Dismissed, a `clearSocialNotifications(mentionId)` helper (same pattern as `clearChatNotifications`) marks everyone's notifications for it read and takes them off Android phones.
- **Android**: `channelFor()` in `notify.ts` gets `if (kind.startsWith('social')) return 'social';`, and the Android app adds a "Social alerts" channel, so people can give it its own sound. Until the app update ships, `notify()` falls back to the `general` channel, which still works.
- The push body shows the start of the comment on the lock screen, as the brief asks. A setting can turn the excerpt off (`push_show_excerpt`, default on).

## 4. Seeing it in the app

- **Needs attention** panel at the top of the dashboard for everyone with access: open Critical and High comments, overdue replies, connections that are down. It cannot be collapsed while a Critical is open.
- **Badges**: Operations shows the open Critical + High count. Social Monitoring shows all open items.
- **Bell**: the existing header bell lists every social notification.
- There is no Acknowledge button. A Critical is dealt with by approving and copying the reply, then marking it Posted, or by an admin dismissing or downgrading it with a reason. The Inbox shows how long each open Critical has been waiting.

## 5. Daily check (heartbeat)

Every day at 10:05 the system pushes a test comment ("HEARTBEAT TEST: this battery could catch fire [synthetic]") through the real path: ingest → keyword layer → Critical → `notify()`. It is marked synthetic and goes **only to the heartbeat person** (default: the first admin), labelled `[TEST] Daily alert check`, and it is never counted in Insights.

- **Pass**: the notification row was created and at least one push was accepted by the push service or Firebase. `notify()` records `last_used_at` on the subscription it reached.
- **Fail**: an email to every admin through Resend ("Social monitoring's daily check failed at the {stage} step"), plus a red banner on the dashboard. Email is used because the failing path may be push itself.

## 6. Phone setup (help page `src/content/help/social/notifications.md`)

- **Android**: the Heliaxis app. Notifications work once the person has signed in.
- **iPhone**: iOS 16.4 or later; add the app to the Home Screen from Safari, open it from there, then tap **Turn on notifications**. iPhone Focus and Silent modes can hold or silence these notifications. This is the accepted trade-off of simple notifications.
- **Computer**: allow notifications in the browser when asked.
- Settings › Social Monitoring lists each person with access and whether notifications are on for them (`push_subscriptions` or `native_push_tokens` present), so gaps are visible.
