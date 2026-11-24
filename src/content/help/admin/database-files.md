---
title: What each database file switches on
summary: Every database file in plain words, which one to run first, and which ones are optional.
order: 80
keywords: SQL files, list of SQL, Supabase, migrations, crm.sql, crm-v2.sql, crm-v3.sql, whatsapp.sql, surveys.sql, survey-booking.sql, purchase-orders.sql, site-commissioning.sql, handover.sql, sso.sql, theme.sql, notifications.sql, user-portals.sql, subcontractors.sql, order to run
access: admin
---
> **Admins only:** Database files are run by an admin, or by someone an admin has passed the job to. How to run one: [Switch a feature on (run a database file)](/admin/help/admin/run-a-database-file).

Each file switches on one part of Heliaxis. The **From Claude** card only shows the ones that still need running, in a sensible order, and says if one has to wait for another. Every file is safe to run twice.

## Customers, projects and the CRM

| File | What it switches on | Run after |
| --- | --- | --- |
| crm.sql | The CRM itself: opportunities, the timeline, site photos and tasks on opportunities. | |
| crm-v2.sql | The customer portal, documents, email, reminders and deposits. | crm.sql |
| crm-v3.sql | Projects (job numbers, delivery checklists, paperwork), task reminders and WhatsApp permission records. | crm-v2.sql |
| customer-refs.sql | A reference for every customer as soon as they’re added (like HX-0042), shared by their jobs (HX-0042, HX-0042-2…). | crm-v3.sql |
| surveys.sql | The solar survey tool: survey records, survey photos and drawings. | crm-v3.sql |
| survey-booking.sql | Online survey booking, the diary, and the Outlook copy of surveys, installs and diary entries. | surveys.sql |
| purchase-orders.sql | Purchase orders: order kit for a job from suppliers, email the PO as a PDF, and track it to delivery. | crm-v3.sql |
| site-commissioning.sql | The site app: job packs for trades, their sign-offs, their POs and your review. Also a subcontractor’s **Site contacts**. | purchase-orders.sql (and portal-v2.sql) |
| handover.sql | The handover pack: every document for the customer in one place, and uploads straight into their portal. | site-commissioning.sql |
| merge.sql | Merging duplicate customers and their jobs. | customer-refs.sql |
| deleted-customers.sql | Stops the Enquiries import bringing back customers you’ve deleted. | crm.sql |
| assistant.sql | Lets Metis save her conversations and drafts. | crm.sql |
| ad-spend.sql | Optional. Records which Meta ad each new lead came from, so Reports can put each ad’s spend beside its leads and sales. | |

For what each Projects file shows on screen, see [What needs switching on](/admin/help/projects/what-needs-switching-on).

## WhatsApp

| File | What it switches on | Run after |
| --- | --- | --- |
| whatsapp.sql | The WhatsApp inbox, smart replies and the outbox, and Meta lead-form leads. | |
| whatsapp-chasers.sql | WhatsApp chasers, and syncing with the WhatsApp Business app. | whatsapp.sql |
| whatsapp-media.sql | Photos, videos, voice notes and files customers send show in the chat, and you can save their photos to the job. Until then the chat just says "📷 Photo". | whatsapp.sql |
| whatsapp-scheduled.sql | **Send later**, and the late-night rule: a message typed after 20:30 waits until 07:00 the next morning. | whatsapp-chasers.sql |

## Notifications, sign-in and look

| File | What it switches on | Run after |
| --- | --- | --- |
| notifications.sql | The notification bell and phone notifications. | |
| native-push.sql | Proper notifications in the Android app. | notifications.sql |
| notifications-ref.sql | Clears WhatsApp and new-lead notifications for everyone once the chat is read or the lead contacted. | notifications.sql |
| sso.sql | One-tap sign-in to RAMS and the social studio. It only appears on the card once their keys are in Vercel. | |
| theme.sql | Optional. Each person’s Light, Dark or Match phone choice follows them to all their devices. | |

## Optional speed-ups

| File | What it does |
| --- | --- |
| crm-activities-index.sql | Makes **Latest notes** on the CRM home load faster once there are lots of notes. |
| whatsapp-feed-index.sql | Makes the WhatsApp rows in **Latest notes** load faster. |

Nothing depends on these. The app can’t tell when they’ve been run, so tick them off yourself.

## Older files (not on the card)

These were run when each part was first set up, and can’t be copied from inside the app:

| File | What it switches on |
| --- | --- |
| schema.sql | Accounts and approval: the base everything else sits on. |
| user-portals.sql | Ticking access per person on **Users**. |
| tasks.sql | **Tasks**. |
| subcontractors.sql | **Subcontractors** and the subcontractor portal. |
| rams-sync.sql | Keeping subcontractor records in step with RAMS. |
| portal-v2.sql | The subcontractor portal’s secure sign-in, the firm’s own team, and jobs booked from RAMS. |
| ntp.sql | NTP agreements. |
| reminders.sql | The daily reminder emails to subcontractors. |
| portal-v3.sql | Asking a subcontractor for a document, and CIS verification. |
| portal-v4.sql | Storing each subcontractor upload as one compact PDF. |
| heatmap_clicks.sql | The website click **Heatmap**. |

If a page says one of these is needed, ask Claude for it.

What each file changes on screen, and what you see until it’s run, is set out for the job pages in [What needs switching on](/admin/help/projects/what-needs-switching-on) and for WhatsApp in [What needs switching on for WhatsApp](/admin/help/whatsapp/what-needs-switching-on).
