# Heliaxis CRM — setup

Everything below is optional except step 1: each connection switches its feature on when its keys
are added in Vercel, and the CRM works without it in the meantime.

## 1. Database (required)

In the Supabase SQL editor, in this order (each is safe to re-run):

1. `supabase/crm.sql` — opportunities, timeline, photos, tasks on opportunities, next steps. Creates an
   opportunity for every existing enquiry.
2. `supabase/crm-v2.sql` — customer portal, documents, library, saved replies, email, reminders,
   lead routing, sequences, booking, quote acceptance, deposits.
3. `supabase/assistant.sql` — Metis's (the assistant's) conversations and drafts.
4. `supabase/deleted-customers.sql` — so Enquiries → Import skips customers you've deleted (see section 8).

Admins see anything still to do as **From Claude** on the dashboard and the Tasks page. Each item
ticks itself off once the app can see it's done. To pass one to someone else, open it and pick them
under **Who sees this**: then only they see it (admins can still find it under **Shared with others**).

The every-minute job you already scheduled (`whatsapp-outbox`) also runs all CRM automation and
picks up email — nothing else to schedule.

Then open **CRM → ⚙ Settings** and set up lead sharing, reminders and saved replies.

## 2. Customer portal

Customers only get a portal once their job starts: when the opportunity moves to **Won** or later.
Before that there's no link, and old links stop working if a job goes back or is lost.

Nothing to set up. Add to Vercel so the portal's "WhatsApp us" button works:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Your WhatsApp business number, e.g. `447700900123` |
| `NEXT_PUBLIC_SITE_URL` | `https://heliaxis.co.uk` (used in portal links) |

## 3. WhatsApp templates for reminders

Countdowns and review requests are free WhatsApps when the customer has messaged in the last 24h.
Otherwise WhatsApp needs an approved template (≈2p each, Utility). Create these in WhatsApp Manager
→ Message templates (English UK, Utility) and put their names in CRM → Settings:

- `install_reminder` — *Hi {{1}}, a reminder that your Heliaxis installation is {{2}} — {{3}}. Reply here with any questions.*
- `survey_reminder` — *Hi {{1}}, a reminder that your Heliaxis survey is {{2}} — {{3}}. Reply here with any questions.*
- `review_request` — *Hi {{1}}, thank you for choosing Heliaxis! If you're happy with your installation, would you leave us a quick review? {{2}}*

({{2}} is "in 3 days" / "tomorrow" / "booked for Tuesday 21 October"; {{3}} is the date and time.)

## 4. Microsoft 365 shared email

Lets anyone send from e.g. hello@heliaxis.co.uk inside the CRM, with replies (and anything sent
from Outlook to a customer) showing on their timeline. Also puts portal survey bookings in the
mailbox's calendar.

1. **entra.microsoft.com** → Identity → Applications → **App registrations → New registration**.
   Name `Heliaxis CRM`, single tenant, no redirect URI → Register.
2. Copy **Application (client) ID** and **Directory (tenant) ID**.
3. **Certificates & secrets → New client secret** (24 months) → copy the **Value**.
4. **API permissions → Add → Microsoft Graph → Application permissions**: `Mail.ReadWrite`,
   `Mail.Send`, `Calendars.ReadWrite` → **Grant admin consent**.
5. Recommended: limit the app to the one mailbox with an
   [application access policy](https://learn.microsoft.com/graph/auth-limit-mailbox-access)
   (Exchange PowerShell `New-ApplicationAccessPolicy`).
6. Vercel env vars, then redeploy:

| Variable | Value |
| --- | --- |
| `MS_TENANT_ID` | Directory (tenant) ID |
| `MS_CLIENT_ID` | Application (client) ID |
| `MS_CLIENT_SECRET` | The secret **value** |
| `MS_MAILBOX` | `hello@heliaxis.co.uk` (a shared mailbox is fine) |

Emails are matched to customers by email address. Attachments over 3 MB are sent as a portal link.

## 5. Card deposits (Stripe)

1. stripe.com → Developers → API keys → copy the **Secret key** → Vercel `STRIPE_SECRET_KEY`.
2. Developers → Webhooks → **Add endpoint** `https://heliaxis.co.uk/api/stripe/webhook`, event
   `checkout.session.completed` → copy the **Signing secret** → Vercel `STRIPE_WEBHOOK_SECRET`.
3. Redeploy. Set a deposit amount on an opportunity (Details) and the customer can pay it from
   their portal after accepting the quote.

## 6. Meta conversions (better ads)

Sends "survey booked", "quote sent" and "won" (with value) back to Meta, so your ads find people
who actually buy.

1. Events Manager → your Pixel / dataset → copy its **ID** → Vercel `META_PIXEL_ID`.
2. Settings → Conversions API → **Generate access token** → Vercel `META_CAPI_TOKEN`.
3. For lead-form ads: Events Manager → set up the **CRM integration** / "conversion leads" on the
   same dataset so Meta optimises lead ads for quality.

Website leads are matched by the ad click id, Meta lead-form leads by their lead id, and both by
hashed email and phone.

## 7. Metis, the assistant

**More → Metis** (or *Talk to Metis* on the dashboard). Type or tap the mic and say what happened,
e.g. "Just left Jane Smith in BS5, wants 10 panels and a battery, quote Friday, get Esther to send the
EV guide". Metis adds notes, sets next steps, creates tasks (for you or a colleague) and writes
emails/WhatsApps as **drafts**. Nothing reaches a customer until someone checks the draft and presses Send.

1. console.anthropic.com → API keys → **Create key** → Vercel `ANTHROPIC_API_KEY` → redeploy.
2. Run `supabase/assistant.sql`.

She runs on Claude Opus 5.5 (Anthropic). If Claude declines a request by mistake, the API automatically retries it on
Anthropic's recommended fallback model.

## 8. Deleting customers

Admins only. On **Enquiries**, open someone and tap **Delete customer**, or tap **Select**, tick
people (or **Select all**) and **Delete selected**. Everything about them goes: their details,
timeline, WhatsApp chat, emails, opportunities with their tasks, photos, documents and signatures,
and the notifications about them. It can't be undone. Anyone with a signed quote or a paid deposit is
kept unless you tick to include them, and deleting more than 5 at once asks you to type DELETE.
Metis forgets what she looked up about them, but what you said to her about them, and her replies,
stay in your past conversations.

Deleted people aren't brought back by **Import** (Meta, CSV or WhatsApp chats): it lists them as
"deleted before, skipped". Only a one-way fingerprint of their Meta lead id, mobile and email is
kept for this, never the details. If they send a new lead or a WhatsApp after you delete them, it
still comes in as normal, including through Import.
This needs `supabase/deleted-customers.sql`; until it's run, deleting works but imports can't skip them.
