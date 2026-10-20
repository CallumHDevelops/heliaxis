# WhatsApp inbox + Meta Lead Ads

Leads from Facebook/Instagram Lead Ads go straight into **Enquiries**, and you can chat with any lead
on WhatsApp from **Enquiries → WhatsApp inbox** in the Heliaxis app. Smart replies answer common
questions after a human-looking delay.

Nothing goes live until the env vars below are set, so the code is safe to deploy first.

## How it works

```
Meta Lead Ad form ──webhook──▶ /api/meta/webhook ──▶ enquiries (source "meta: <ad name>")
                                                      └─ opted in? → intro template, 3–6 min later
Customer WhatsApp ──webhook──▶ /api/meta/webhook ──▶ whatsapp_messages + push to the team
                                                      └─ keyword match? → whatsapp_outbox (send in 4–5 min)
You in the WhatsApp Business app ──echo──▶ /api/meta/webhook ──▶ same chat in Heliaxis (coexistence)
Supabase pg_cron (every minute) ──▶ /api/cron/whatsapp-outbox ──▶ smart replies, chasers, "waiting for a reply" pushes
You in the app ──▶ /api/whatsapp/conversations/<id> ──▶ WhatsApp Cloud API
```

## 1. Database

Run `supabase/whatsapp.sql`, then `supabase/whatsapp-chasers.sql` and `supabase/whatsapp-media.sql`, in the Supabase SQL editor. Then turn on the **pg_cron** and **pg_net**
extensions (Database → Extensions) and run the `cron.schedule(...)` block at the bottom of that file,
with your `CRON_SECRET` filled in. That's what sends delayed replies when nobody has the app open.
(Vercel's Hobby plan only allows daily crons, so Supabase triggers this one.)

## 2. Meta setup (one time)

1. **Business verification**: business.facebook.com → Settings → Security Centre → verify Heliaxis.
2. **Create an app**: developers.facebook.com → My Apps → Create → type **Business** → link it to the
   Heliaxis business portfolio.
3. **Add WhatsApp** to the app → follow "Add phone number". Use a number that isn't on the
   WhatsApp app, or choose the **coexistence** option to keep using the WhatsApp Business app on the
   same number. Set the display name (Meta approves it).
4. **Permanent token**: Business Settings → Users → System users → Add (Admin) → Assign assets
   (the app, the WhatsApp account, the Facebook Page) → Generate token with
   `whatsapp_business_messaging`, `whatsapp_business_management`, `leads_retrieval`,
   `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement`.
5. **Webhook**: in the app → WhatsApp → Configuration → Callback URL
   `https://heliaxis.co.uk/api/meta/webhook`, verify token = your `META_WEBHOOK_VERIFY_TOKEN` →
   subscribe to **messages**, and also to **smb_message_echoes** if you use coexistence (below).
6. **Lead Ads webhook**: Meta now keeps this under *use cases*. On the app dashboard tap **Add use
   cases** (top right) → **Capture & manage ad leads with Marketing API** (this is also where
   `leads_retrieval` lives). Then **Use cases** → that use case → **Customize** → **Webhooks** →
   **Page** → same callback URL and token → **Verify and save** → subscribe to **leadgen**. (The old
   app → Webhooks menu may still work, but the use-case route is the reliable one.) If Vercel hides
   `META_WEBHOOK_VERIFY_TOKEN` as Sensitive, set a new long random value in Vercel and in Meta, and
   redeploy before saving; Meta only checks it when you save, so WhatsApp keeps working.
   Then:
   - **Leads Access**: Business Settings → Integrations → Leads Access → the Page → give the app access.
   - **Subscribe the Page to the app**, or no leads arrive even with the webhook above. In Heliaxis:
     Enquiries → Import → *Find lead forms* → **Switch on live leads** next to the Page. That calls
     `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen` with the Page's token (needs
     `pages_manage_metadata`), keeping any other fields the app already gets from the Page.
   - Check with Meta's Lead Ads Testing Tool: a test lead should show **success** under Track status.
7. **Templates**: easiest from Heliaxis, Enquiries → WhatsApp → *Smart replies & chasers* →
   **WhatsApp templates** (`/admin/enquiries/templates`). Its *Ready-made* tab sends Heliaxis's
   templates to Meta with one tap (welcome, follow-up, quote ready, missed call,
   survey / install reminders, review request) and shows Meta's answer; *Use for* picks which one
   each automatic message uses; *New template* makes your own (admins only, needs
   `WHATSAPP_BUSINESS_ACCOUNT_ID` and a token with `whatsapp_business_management`). Or by hand:
   WhatsApp Manager → Message templates → Create, category **Utility** (cheaper) or
   **Marketing**, language English (UK). For example, name `enquiry_intro`:
   > Hi {{1}}, it's Heliaxis — thanks for your enquiry. Is now a good time for a couple of quick
   > questions so we can get you an accurate quote?

   Meta decides the final category. Anything promotional ends up as Marketing.
8. **Lead form**: add a custom question *"Happy for us to contact you on WhatsApp?"* (Yes/No).
   Any question with "whatsapp" in it counts as the opt-in.
9. **Chase template** (optional): a second Utility template, e.g. `enquiry_follow_up`:
   > Hi {{1}}, just following up on your Heliaxis enquiry. Reply here whenever suits and we'll pick up where we left off.

   Set its name in Enquiries → Smart replies → Chasers (or *Use for* on the templates page). Chasers use it only once the free window has closed.

## 3. Vercel env vars

| Variable | What |
| --- | --- |
| `META_APP_SECRET` | App → Settings → Basic → App secret (checks webhook signatures) |
| `META_WEBHOOK_VERIFY_TOKEN` | Any random string; the same one you typed in step 5/6 |
| `WHATSAPP_TOKEN` | The system-user token from step 4 |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp → API setup → Phone number ID |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp → API setup → WhatsApp Business Account ID (lists your templates in the app) |
| `META_PAGE_ACCESS_TOKEN` | Optional. A Page token for fetching leads, if the system-user token doesn't cover the Page |
| `WHATSAPP_DEFAULT_TEMPLATE` | e.g. `enquiry_intro`. Its `{{1}}` is filled with the lead's first name. Optional: *Use for → First message to new Meta leads* on the templates page overrides it |
| `WHATSAPP_TEMPLATE_LANG` | Default `en_GB` |
| `WHATSAPP_AUTO_FIRST_MESSAGE` | `true` = send the default template to opted-in Meta leads 3–6 min after they submit (any time of day, unless *Hold the first message to new leads who enquire in quiet hours* is ticked in Smart replies → Chasers) |
| `META_LEADS_WHATSAPP_OPT_IN` | `true` = treat every Meta lead as opted in (only if the form itself says you'll contact them on WhatsApp) |
| `META_GRAPH_VERSION` | Optional, default `v23.0` |
| `CRON_SECRET` | Already used by the other crons; the pg_cron job sends it |

Redeploy after adding them.

## Using it

- **Inbox**: Enquiries → *WhatsApp inbox*. Unread chats are bold; tapping a push notification opens
  the chat. Opening a chat sends the customer blue ticks.
- **24-hour rule**: you can type freely for 24h after the customer's last message. After that (or
  for a lead who has never messaged) the chat offers your approved templates instead.
- **Smart replies** (Enquiries → *Smart replies*): keywords → reply, with a random delay
  (default 4–5 min). When one matches, you get a push straight away and the reply shows in the chat
  as "sends in 3:42" with **Send now / Edit / Cancel**. Just before sending, the customer sees their
  message marked read and "typing…" for a few seconds.
  - Smart replies hold off for 2 hours on a chat after anyone replies by hand, and replying by hand
    cancels any that are waiting.
  - The same reply is never sent twice to someone within 24h.
  - The *Smart replies on/off* button in a chat turns them off for that person.
- **Chasers**: ask something ("can you send us a photo of the land?") and, if they don't answer, a
  chaser goes after 12h (or whatever you pick under the message box: Auto / Off / 4h / 12h / 24h / 3
  days). Auto = chase anything with a "?". A smart reply can have its own chaser too. Chasers:
  - are cancelled the moment they reply, or when you send another message;
  - never go out in quiet hours (21:00–08:45 UK by default, set to the minute), and move to the morning instead;
  - after a message sent in the evening (18:00 or later, or in quiet hours), wait until at least
    10:00 the next morning, to give them a chance to wake up (the evening rule, on by default);
  - stay **free** when they can: if 12h would land after the 24h window closes, the chaser goes about
    an hour before it closes (at least 4h after your message, and never earlier than the evening rule
    allows). Otherwise the chase template is sent (paid). The chat shows which it'll be;
  - can have an optional final nudge (off by default), which keeps to the same hours;
  - are checked again just before they go, so one queued under older settings still waits for the
    morning. **Send now** in the chat always sends straight away.
- **Photos, videos, voice notes and files** customers send show in the chat (once
  `whatsapp-media.sql` has been run). WhatsApp only keeps them for 7 days, so each one is downloaded
  as it arrives and kept in a private storage bucket, `whatsapp-media` (the app creates it). Tap a
  photo to see it full size; in a job's chat, **Save to job photos** copies it into the job's Site
  photos. Voice notes play in Chrome, Edge, Firefox and Safari 18.4 or later (older iPhones and Macs
  get a Download instead). Anything over 50 MB (16 MB for photos and voice notes) isn't kept: the
  chat says so. Past 250 MB or 30 files in a day from one chat, the rest wait for someone to tap
  **Try again**. Deleting a customer deletes their files too.
- **Monitoring**: the inbox has *Needs reply* and *Waiting on them* filters, and the team gets a push
  when a customer has waited 30 min without an answer (outside quiet hours).
- Website enquiries can be messaged too (template first). Only do that if they've agreed to
  WhatsApp contact.

## Using the WhatsApp Business app as well (coexistence)

You can keep the WhatsApp Business app on your phone **on the same number** and use Heliaxis
alongside it. When you add the number to the API (step 3), pick *"Connect your existing WhatsApp
Business app"* and scan the QR code from the app. Then subscribe the webhook to
**smb_message_echoes** (step 5).

- Messages you type in the WhatsApp Business app show up in the Heliaxis chat (marked "Sent from
  the WhatsApp app"). They count as a person replying, so pending smart replies and chasers are
  cancelled, and a question you ask there gets a chaser just like one sent from Heliaxis.
- Messages sent from Heliaxis also appear in the WhatsApp Business app.
- Meta's limits: open the WhatsApp Business app at least every couple of weeks or the link drops;
  broadcast lists, disappearing and view-once messages are turned off; groups don't sync. Meta can
  also import up to 6 months of old chat history at onboarding. This code doesn't import it yet.

## Costs (UK, billed by Meta per delivered message)

| Message | Approx. cost |
| --- | --- |
| Replies within 24h of the customer's message (chat + smart replies) | Free* |
| Utility template (e.g. "thanks for your enquiry", appointment reminders) | ~£0.016 |
| Marketing template (promotions, re-engaging old leads) | ~£0.04–0.05 |
| Utility template sent while the 24h window is open | Free |
| Everything for 72h after someone taps a Click-to-WhatsApp ad | Free |

\*Some third-party guides say Meta now charges for service messages after the first 1,000 a month
per number. Check your rate card in WhatsApp Manager → Insights. Rates change quarterly; Meta's
official card is at developers.facebook.com/docs/whatsapp/pricing.
