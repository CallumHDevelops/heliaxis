---
title: CRM settings
summary: What’s on the CRM settings page, who can change each part, and where each part is explained.
order: 120
keywords: settings, CRM settings, connections, configuration, automation, new leads, reminders, reviews, follow-up sequence, saved replies, document library, handover pack settings, product library, office address
where: CRM › CRM settings
path: /admin/crm/settings
access: crm
---
**CRM settings** is where you choose what the CRM sends and does by itself. Anyone with **CRM** access can open it. Most of it can only be changed by an admin: for everyone else it’s greyed out and the top says "Only admins can change these."

![The top of CRM settings: Connections, Survey booking and diary, and New leads](/help/admin/crm-settings.jpg "CRM settings: the Connections list and the New leads section")

## What’s on the page, top to bottom

| Part | What it’s for | Who can change it |
| --- | --- | --- |
| **Connections** | Whether **WhatsApp**, **Microsoft 365 email**, **Card deposits (Stripe)** and **Meta conversions** are connected. Each says "connected" or "not connected". When they’re on, email says which address it sends as, and Meta says "sending stages to Meta". | Set up by an admin: see [Connect Microsoft 365](/admin/help/admin/microsoft-365), [Connect Stripe](/admin/help/admin/stripe-deposits) and [Send sales back to Meta](/admin/help/admin/meta-conversions). |
| **Survey booking and diary →** | Opens the survey booking settings. | See [Survey booking settings](/admin/help/surveys/booking-settings). |
| **New leads** | Who new leads are shared between, and the "hasn’t been contacted" alert. | Admins. [Choose who gets new leads](/admin/help/admin/new-leads) |
| **Install & survey reminders (WhatsApp)** | Countdown messages before surveys and installs. | Admins. [Reminders and review requests](/admin/help/admin/reminders-and-reviews) |
| **Review requests** | The Google review link, and when it’s sent after Complete. | Admins. [Reminders and review requests](/admin/help/admin/reminders-and-reviews) |
| **Follow-up sequence for new leads** | Automatic follow-ups to new leads who haven’t replied. | Admins. [Set up the follow-up sequence](/admin/help/admin/follow-up-sequence) |
| **Purchase orders** | The **Office / warehouse delivery address** and **Postcode**, for kit delivered to you instead of the site. Until it’s set, "To the office" can’t be picked on an order. | Admins. See [Order kit](/admin/help/purchase-orders/order-kit). |
| **Save settings** | Saves everything above it. It says "Saved ✓". | Admins. |
| **Saved replies** | Ready-made messages for the WhatsApp and email composers. | Anyone with CRM. [Add a saved reply](/admin/help/admin/saved-replies) |
| **Document library** | Guides and packs you send to lots of customers. | Anyone with CRM. [Add a document to the library](/admin/help/admin/document-library) |
| **Handover pack** and **Product library** | The wording and numbers the handover pack prints, and which manuals go with which products. | Admins. [Set up the handover pack](/admin/help/handover/set-up) |

> **Watch out:** **Save settings** only saves the parts above it. **Saved replies** and the **Document library** save as you go, and the **Handover pack** has its own **Save** button.

The **Reports** button at the top right opens **CRM reports**.

> **Once switched on:** The **Handover pack** and **Product library** parts only appear once handover.sql has been run.
