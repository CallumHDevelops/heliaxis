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
5. `supabase/crm-v3.sql` — the new job stages, task reminders and WhatsApp permission records
   (section 10).
6. `supabase/customer-refs.sql` — a reference for every customer, like HX-0042 (section 9). Run it
   after crm-v3.sql.
7. `supabase/surveys.sql` — solar surveys, their photos and drawings (section 11).
8. `supabase/survey-booking.sql` — online survey booking, your diary and the Outlook copy
   (sections 12 and 13).

Until 5 to 8 are run the CRM works as before; the new screens appear once their file is done.

Admins see anything still to do as **From Claude** on the dashboard and the Tasks page. Each item
ticks itself off once the app can see it's done. To pass one to someone else, open it and pick them
under **Who sees this**: then only they see it (admins can still find it under **Shared with others**).

The every-minute job you already scheduled (`whatsapp-outbox`) also runs all CRM automation and
picks up email — nothing else to schedule.

Then open **CRM → ⚙ Settings** and set up lead sharing, reminders and saved replies.

## 2. Customer portal

Customers get a link once their quote goes out: **Send quote for signing** moves the job to **Quote
sent** and the link opens just the quote, to read, sign and accept. Signing moves the job to **Won**,
and the same link then opens the full portal (progress, documents, photos, the deposit). Before Quote
sent there's no link, and old links stop working if a job goes back or is lost.

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
from Outlook to a customer) showing on their timeline. Survey booking also reads your calendar to
find free time. Surveys and your own diary entries are copied to the surveyor's own calendar
(callum@), and installs to the install calendar (hello@ unless you pick another in Surveys → ⚙):
see section 13.

The app only gets access to hello@ and callum@, not every mailbox.

1. **entra.microsoft.com** → Identity → Applications → **App registrations → New registration**.
   Name `Heliaxis CRM`, single tenant, no redirect URI → Register.
2. Copy **Application (client) ID** and **Directory (tenant) ID**.
3. **Certificates & secrets → New client secret** (24 months) → copy the **Value**.
4. Don't add any **API permissions** to the app registration (if you ticked Mail permissions
   before, remove them). The PowerShell below gives it just the two mailboxes, using Exchange's
   **RBAC for Applications**.
5. **Identity → Applications → Enterprise applications** → search **Heliaxis CRM** → copy its
   **Object ID** (it's different from the one on the app registration).
6. On a Windows PC open **PowerShell** and run these one at a time (say **Y** or **A** if it asks to
   install; the second line opens a Microsoft sign-in, the third asks for the two IDs):

   ```powershell
   Install-Module ExchangeOnlineManagement -Scope CurrentUser
   Connect-ExchangeOnline
   $app = Read-Host "Application (client) ID"; $obj = Read-Host "Enterprise app Object ID"; New-ServicePrincipal -AppId $app -ObjectId $obj -DisplayName "Heliaxis CRM"
   New-ManagementScope -Name "Heliaxis CRM mailboxes" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'hello@heliaxis.co.uk' -or PrimarySmtpAddress -eq 'callum@heliaxis.co.uk'"
   "Application Mail.ReadWrite","Application Mail.Send","Application Calendars.ReadWrite" | ForEach-Object { New-ManagementRoleAssignment -App $app -Role $_ -CustomResourceScope "Heliaxis CRM mailboxes" }
   Test-ServicePrincipalAuthorization -Identity $app -Resource hello@heliaxis.co.uk
   ```

   After the last line every row should say **True** under **InScope**.
7. Vercel env vars, then redeploy:

| Variable | Value |
| --- | --- |
| `MS_TENANT_ID` | Directory (tenant) ID |
| `MS_CLIENT_ID` | Application (client) ID |
| `MS_CLIENT_SECRET` | The secret **value** |
| `MS_MAILBOX` | `hello@heliaxis.co.uk` (a shared mailbox is fine) |

Emails are matched to customers by email address. Attachments over 3 MB are sent as a portal link
(once the job is Won; before that, send big files on WhatsApp). The same steps are on the
**Connect Microsoft 365 email** to-do, with copy buttons.

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

## 9. Customer references and WhatsApp chats

Every customer gets a reference like **HX-0042** the moment they're added. Their first job shares
it; later jobs are HX-0042-2, HX-0042-3 and so on. A reference never changes and is never reused,
even after a delete. You'll see it on Enquiries, in the WhatsApp inbox and at the top of each chat,
and you can search by it. Needs `supabase/customer-refs.sql`.

On a computer, the **WhatsApp dock** sits on the right of every admin page: open on CRM home and job
pages, folded to a strip of chat heads elsewhere, and out of the way on the WhatsApp inbox (the chat
fills that page already). It remembers whether you like it open or folded, and half-written replies
stay put as you move between pages. **Ctrl+Enter** (Cmd+Enter on a Mac) sends. People with CRM
access but not Enquiries can read and reply to the chats of customers with a job. There's no dock on
phones: use the WhatsApp tab.

## 10. WhatsApp permission and STOP

Automatic WhatsApps (reminders, follow-ups, smart replies, chasers) should only go to customers who
have agreed to them. A customer counts as agreed when they message you first, tick the WhatsApp box
on the website form, agree on a Meta lead form that asks, or you mark them as agreed.

- **STOP**: if a customer replies STOP, they get one confirmation and no more automatic WhatsApps,
  whatever the rule below says, on every enquiry with that number. Anything queued for them is
  cancelled. **START** turns them back on. You can still reply to them by hand.
- **The review list**: the to-do *Check who's agreed to WhatsApp messages* opens it (or go to
  `/admin/crm/whatsapp-permission`). It lists customers with open jobs and no permission recorded.
  Tap **They agreed** for anyone who has, then switch on **Only send automatic WhatsApps to
  customers who've agreed**. Until you do, everyone who hasn't said STOP still gets them, as before.
- With the rule on, a customer without permission gets the email version instead (when Microsoft
  365 is connected and they have an email address), and it's noted on their timeline.
- Meta lead forms: leads count as agreed only if `META_LEADS_WHATSAPP_OPT_IN` is `true` in Vercel.
  Only set that while every lead form has a WhatsApp consent line.

Needs `supabase/crm-v3.sql` (until then a STOP can't be kept, and the notification says so).

## 11. Solar surveys

**Surveys and diary** is in the CRM menu (on a phone: **More**). **To do** lists booked and started
surveys by day, **Drafts** the started ones and **Done** the finished ones. Start one from **Home →
Today → Start survey**, from To do, or with **+ New survey** (find the customer, pick the job, solar
or heat pump).

- **On the phone**: one screen at a time in the order of a visit (chat with the customer, outside,
  roof, loft, electrics, kit spots, cable routes, finish), big buttons for gloves and the screen kept
  on. **Needed** items must be done to finish; **Not filled** ones are listed but never stop you;
  the rest sit behind **More detail**. If you can't get to something, tap **Couldn't check this
  section** and say why. Draw on photos (the roof layout, cable routes) there and then, or later in
  the van.
- **The main electric cut-out for ENA**: on the Electrics screen, **Main electric cut-out (DNO)** is
  Needed. Take a close-up where the fuse rating and the seal can be read, plus a wide shot with the
  meter. The survey's **Report** has a **For the ENA application** block with the cut-out and meter
  photos side by side and a **Download** button for each. It saves the original photo, named with the
  job ref (for example `HX-0042-main-cut-out.jpg`), ready to upload to ENA (Connect Direct).
- **No signal**: every survey dated today or tomorrow is copied to the phone whenever the app is
  open with signal, so open the app once before you set off. Answers and photos are kept on the
  phone and upload by themselves when there's signal again. You can **Finish on site** with the
  customer's signature with no signal; it goes through once everything has uploaded. If you sign out
  with changes still on the phone, the app warns you first. A brand-new survey (+ New survey) needs
  signal once.
- **When it's finished**: the job moves to **Surveyed**, red flags and the suggested system are
  saved, and tasks are made for drawings still to do and anything the customer will send. **Report**
  shows it all and prints (or saves as a PDF) on A4.
- **Heat pump surveys** are done in SimpliHeat: the survey here keeps the SimpliHeat link and report.

Needs `supabase/surveys.sql`.

## 12. Survey booking and the Diary

Customers can pick a survey time that really fits your day: from a **booking link** you send them
(Surveys → Diary → **Find a time** → **Send booking link**), or on the website at
heliaxis.co.uk/book-a-survey. Website bookings always make a new customer. If the email or mobile
matches someone already in the CRM, it's flagged "Possible duplicate of …" for you to check, and
nothing about the other customer is shown or changed.

**Your rules** (set from your answers; check them in **Surveys → ⚙**):

- Every day starts and ends at home, **NP26 5ST**. The drives there and back count towards the
  day's driving.
- Monday to Friday: the first survey starts from **08:30** and the last finishes by **18:00**.
  Saturdays: finished by **12:00**, and only for customers within **30 minutes' drive** of home. No
  Sundays or bank holidays.
- Between appointments: the drive, plus **15 minutes' buffer** and **15 minutes for coffee**.
- At most **4 surveys a day**. After **15:00**, nothing can be booked for the next working day.
- Solar 1 hour, heat pump 1 hour, both 1½ hours. Solar surveys finish before sunset.
- Customers can move or cancel online up to 24 hours before.
- Jobs with no solar, battery or heat pump (infrared, an EV charger or LED lighting, say) don't need a
  survey, so they aren't offered survey times and their booking link won't open. Use **+ Add to my diary** for a home visit, or add Solar PV or Heat pump to
  the job if they want a survey too.

**The Diary** (Surveys → Diary) shows the next 3 weeks: surveys, installs, Outlook and your own
entries, with the drives between them. Use **+ Add to my diary** for anything that isn't in the CRM
(site visits, meetings, time off), with a postcode: it counts as busy, the app plans the drive to and
from it, and it's copied to Outlook too.

**Ask me to confirm**: booking starts in this mode. A customer's choice is a request that you confirm
in the Diary with one tap, or **Offer another time** (you get a message to send them). Requests nobody
confirms lapse after 48 hours, or at the cut-off before the day. Once Outlook is connected, each
request shows whether instant booking would have accepted it; after a good week, a to-do suggests
switching to **Book instantly**.
Confirmations go out by WhatsApp, or by email when WhatsApp can't.

Online booking is **off** until you've checked the rules: the to-do *Check your survey booking rules
and switch it on* takes you there. Drive times are the app's own estimate (erring on the long side)
until you add a Google Maps key (optional: the to-do *Better drive times for survey booking*). The
website form can also use Cloudflare's free "I'm not a robot" check (the to-do *Protect the website
booking form from bots*).

Needs `supabase/survey-booking.sql`.

## 13. The Outlook copy

Once Microsoft 365 is connected (section 4), the CRM stays the master copy and Outlook gets a copy:

- Surveys and your own diary entries go in the surveyor's calendar (callum@). Installs go in the
  install calendar (hello@ unless set otherwise in Surveys → ⚙), one all-day event for each run of
  working days.
- Dates set or changed after Microsoft 365 is connected are copied by themselves. Dates from before
  that are in a one-off list, **Surveys → Diary → Copy these dates into Outlook**: untick any you
  already put in Outlook by hand, then tap **Copy**.
- Past events are never changed or deleted. Moving or cancelling a job updates its Outlook event.
- Booking reads your Outlook diary to find free time: anything in it counts as busy. Mark holidays
  and days off as **Away** (not Free), or bookings won't avoid them. The team sees "Busy" rather
  than your Outlook subjects.
- **Surveys → ⚙ → What your diary says** reads your last 10 weeks of Outlook (nothing is changed)
  and suggests settings that match how you really work.

## 14. The cookie banner

The website asks visitors before using cookies. **Accept** turns on Google Analytics and remembers
which advert or campaign brought them (so their enquiry is labelled `meta-ad: …`). **Reject**, or no
answer yet, means neither. The website works the same either way, and **Cookie settings** at the
bottom of every page lets them change their mind. The website's own visitor counts and click heatmap
use no cookies, so they carry on either way. Customers' personal links (their portal and their
booking link) never send anything to Google Analytics or the visitor counts.
