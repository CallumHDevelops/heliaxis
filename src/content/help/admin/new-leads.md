---
title: Choose who gets new leads
summary: Share new enquiries between people in turn, and get an alert when a new lead hasn’t been contacted in time.
order: 130
keywords: lead rotation, round robin, assign leads, lead owner, share leads, new lead notification, speed to lead, first response, not contacted alert, Share new leads between
where: CRM › CRM settings › New leads
path: /admin/crm/settings
access: admin
---
> **Admins only:** Anyone with CRM access can see these settings, but only admins can change them.

## Share new leads in turn

When a new enquiry comes in (from the website, a Meta lead form, a new WhatsApp number or an online survey booking), the CRM can give it to the next person in turn. Leads you import aren’t handed out. That person becomes its owner and gets a notification: "New lead for you: …".

1. Open **CRM › CRM settings**.
2. Under **New leads**, in **Share new leads between (in turn)**, tick everyone who should take new leads. The list shows everyone with CRM access.
3. Press **Save settings** (under the **Purchase orders** part). It says "Saved ✓".

With nobody ticked, new leads stay unassigned and nobody gets the "for you" notification.

The list only shows people who are approved and have **CRM** access. If someone who’s ticked is rejected, set back to pending or loses the **CRM** tick on **Users**, they drop off the list and the app skips them: new leads go to the others in turn, and only they get the notification. They stay ticked and keep their place, so if their access comes back they take turns again by themselves.

> **Good to know:** Leads already given to someone stay theirs when they lose access. Change the **Owner** on those jobs to hand them over (see [Job details](/admin/help/customers/job-details)).

> **Good to know:** The **Choose who gets new leads** job on the **From Claude** card disappears once at least one person is ticked. It comes back if nobody who’s ticked can open the CRM any more, because new leads would then stay unassigned. It comes back unticked, even if you ticked the job off before. If you’re happy for new leads to stay unassigned, tick it off: it then says **Ticked. Waiting to confirm** and stays that way until someone ticked can open the CRM again, when it goes.

## The "hasn’t been contacted" alert

**Alert if a new lead hasn’t been contacted within (minutes, 0 = off)** sets how long a new lead can wait. It starts at 15.

If a lead that came in within the last 3 days is still at **Lead** with nobody having contacted it by then, the app sends a notification, for example "⏱ Sam Jones hasn’t been contacted", "New enquiry 20 min ago — message them now." It goes to the lead’s owner, or to everyone with CRM access if it has no owner. Each lead is only alerted about once.

Type **0** to switch the alert off, then press **Save settings**.

> **Good to know:** The alert, like the CRM’s other automatic messages, waits while the WhatsApp quiet hours are on (set in **Smart replies & chasers**). It needs the every-minute job: see [Check the every-minute job is running](/admin/help/admin/every-minute-job).

The rest of the page is in [CRM settings](/admin/help/admin/crm-settings).
