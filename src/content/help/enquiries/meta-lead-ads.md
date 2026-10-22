---
title: Meta lead ads coming in
summary: How Facebook and Instagram lead-form leads reach Enquiries by themselves, what they bring with them, and how to check live leads are on.
order: 80
keywords: Meta, Facebook, Instagram, lead ads, lead form, instant form, live leads, webhook, test lead, Lead Ads Testing Tool, leads not arriving, missing Meta leads, WhatsApp permission
where: CRM › Enquiries
path: /admin/enquiries
access: enquiries
---
When someone fills in one of your Facebook or Instagram lead forms, Meta tells the app straight away. The lead appears on Enquiries within moments, with no copying from Meta.

## What a Meta lead brings

- Their name (or "Meta lead" if the form didn’t ask), email, phone and postcode.
- What they’re interested in, from any question about interest, service or product.
- Their company, if the form asked.
- Every other answer, in **Message** ("Roof type: Tiles · Best time to call: Evenings").
- The ad it came from, shown as **Meta ad · Video 4**. A form that wasn’t on an ad shows as **Meta (organic)**. See [Lead sources and ad names](/admin/help/enquiries/lead-sources).
- Their WhatsApp permission: yes if they said yes to a WhatsApp question on the form, or for every Meta lead once an admin has confirmed the forms all ask for it.

Then the app does what it does for every new lead: an opportunity at **Lead**, the "New Meta lead: …" notification to everyone with Enquiries access, and the lead shared to the next person on the rota. See [Where leads come from, and what happens next](/admin/help/enquiries/where-leads-come-from).

New Meta leads also show on the dashboard’s **New Meta leads** card until someone moves them on from **New**. See [New Meta leads on the dashboard](/admin/help/dashboard/new-meta-leads).

## The WhatsApp intro

If an admin has switched on the automatic first WhatsApp, and the lead gave a phone number and agreed to WhatsApp, the app sends them the intro template 3 to 6 minutes after they come in. The notification then ends "WhatsApp intro sends in a few minutes." and opens their chat. If **Hold the first message to new leads who enquire in quiet hours until the morning** is ticked in Smart replies & chasers, a lead who comes in during quiet hours gets it in the morning instead.

## Test leads

Leads made with Meta’s Lead Ads Testing Tool aren’t added to Enquiries. Instead, everyone with Enquiries access gets a notification, "Meta test lead arrived ✓", saying "Live leads are working. Test leads aren’t added to Enquiries." That’s how you know the connection works.

## When Meta leads stop arriving

1. Check Meta has the lead: open the form’s leads in Meta Business Suite.
2. Ask an admin to open **Enquiries › Import** and press **Find lead forms**. Next to each Facebook Page it says **Live leads: On ✓**, **Live leads: Off** or **Live leads: couldn’t check**.
3. If it’s off, the admin presses **Switch on live leads** for that Page. It then says "Live leads are on…", or "Meta said yes, but doesn’t show live leads as on yet. Wait a minute, then press “Look again”." New leads only reach Enquiries by themselves while it’s on.
4. To fetch any leads that were missed, the admin presses **Import selected** on the same page. People already in the CRM aren’t added twice. Leads from the last hour are left out, so import again later for those. See [Import older Meta leads](/admin/help/enquiries/import-meta-leads).

Leads fetched this way come in as imported leads: nobody is notified, they aren’t shared out on the rota, and they get no WhatsApp intro or "hasn’t been contacted" alert. Check the list on **Enquiries** and get in touch with any new ones yourself.

If a lead reached Meta but the app couldn’t fetch its answers, everyone with Enquiries access gets "Meta lead could not be fetched". Pass it to an admin to check the CRM’s Meta access key. Once it’s fixed, **Import selected** brings the lead in.

> **Admins only:** Connecting lead forms the first time is the "Connect Meta lead forms to the CRM" to-do in From Claude, with every step in Meta’s settings. See [From Claude setup to-dos](/admin/help/dashboard/from-claude).

> **Watch out:** Someone already in the CRM who fills in a lead form again comes in as a new lead. Check for a duplicate and merge them if so: see [Merge a customer who’s in twice](/admin/help/customers/merge-duplicates).
