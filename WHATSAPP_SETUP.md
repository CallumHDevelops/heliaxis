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
Supabase pg_cron (every minute) ──▶ /api/cron/whatsapp-outbox ──▶ read receipt → "typing…" → send
You in the app ──▶ /api/whatsapp/conversations/<id> ──▶ WhatsApp Cloud API
```

## 1. Database

Run `supabase/whatsapp.sql` in the Supabase SQL editor. Then turn on the **pg_cron** and **pg_net**
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
   subscribe to **messages**.
6. **Lead Ads webhook**: app → Webhooks → **Page** → same callback URL and token → subscribe to
   **leadgen**. Then connect the Page to the app (the easiest way is Meta's *Leads Access Manager*
   in Business Settings → Integrations → Leads Access → give the app access, or use the
   *Webhooks* tool in Graph API Explorer: `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen`
   with a Page token).
7. **Template**: WhatsApp Manager → Message templates → Create, category **Utility** (cheaper) or
   **Marketing**, language English (UK). For example, name `enquiry_intro`:
   > Hi {{1}}, it's Heliaxis — thanks for your enquiry. Is now a good time for a couple of quick
   > questions so we can get you an accurate quote?

   Meta decides the final category. Anything promotional ends up as Marketing.
8. **Lead form**: add a custom question *"Happy for us to contact you on WhatsApp?"* (Yes/No).
   Any question with "whatsapp" in it counts as the opt-in.

## 3. Vercel env vars

| Variable | What |
| --- | --- |
| `META_APP_SECRET` | App → Settings → Basic → App secret (checks webhook signatures) |
| `META_WEBHOOK_VERIFY_TOKEN` | Any random string; the same one you typed in step 5/6 |
| `WHATSAPP_TOKEN` | The system-user token from step 4 |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp → API setup → Phone number ID |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp → API setup → WhatsApp Business Account ID (lists your templates in the app) |
| `META_PAGE_ACCESS_TOKEN` | Optional. A Page token for fetching leads, if the system-user token doesn't cover the Page |
| `WHATSAPP_DEFAULT_TEMPLATE` | e.g. `enquiry_intro`. Its `{{1}}` is filled with the lead's first name |
| `WHATSAPP_TEMPLATE_LANG` | Default `en_GB` |
| `WHATSAPP_AUTO_FIRST_MESSAGE` | `true` = send the default template to opted-in Meta leads 3–6 min after they submit |
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
- Website enquiries can be messaged too (template first). Only do that if they've agreed to
  WhatsApp contact.

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
