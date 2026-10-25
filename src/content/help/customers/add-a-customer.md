---
title: Add a new customer by hand
summary: Add a new enquiry for someone who phoned, was referred or walked in, or a new opportunity for someone already in the CRM.
order: 60
keywords: new customer, new enquiry, new lead, new opportunity, + New, phone call, referral, walk-in, add person, create opportunity, enquiries not in the CRM
where: CRM › Opportunities › + New
path: /admin/crm
access: crm
---
Website, Meta and WhatsApp enquiries become opportunities by themselves. Use this for anyone else: a phone call, a referral, someone you met.

## Add a new customer

1. On the CRM page press **+ New** (on a phone, the yellow **+**, then **New opportunity**).
2. The **New opportunity** sheet opens. Under **Customer**, type their name, phone, email, postcode or HX-ref first, to check they aren’t already in the CRM.
3. If nobody matches, press **+ New customer**.
4. Fill in **Full name** (the only thing you must give), **Mobile**, **Postcode** and **Email**.
5. Under **Products**, tick what they’re interested in: **Solar PV**, **Battery**, **Heat pump**, **EV charger**, **Infrared heating**, **LED lighting** or **Other**.
6. Leave **Name for the job** empty to use the products and postcode (for example “Solar + battery · NP20 4AB”), or type your own.
7. Fill in **Site address** if you know it, and **Value £ (optional)**. For a new customer the job’s site postcode is the **Postcode** you typed above.
8. Pick the **Owner** (you, by default).
9. Under **Where is it up to?**, pick **New enquiry: needs a survey and quote** or **Surveyed: needs a quote**.
10. Press **Create opportunity**. Their page opens.

The app gives them a customer reference such as HX-0042 straight away, and the first job shares it. A mobile number links any WhatsApp chat on that number to them.

A new customer added at **New enquiry** is treated as a new lead: the follow-up sequence for new leads goes to them if it’s switched on in CRM settings (see [Set up the follow-up sequence for new leads](/admin/help/admin/follow-up-sequence)), and the owner gets the “hasn’t been contacted” alert (after 15 minutes unless CRM settings set another time, or 0 for off) if nobody has logged a call, messaged or emailed them by then. Log your call straight away (see [Add a note, log a call or a site visit](/admin/help/customers/notes-calls-visits)) so the job moves to Contacted.

> **Once switched on:** References (HX-0042) need customer-refs.sql. Until it’s been run, customers and jobs have no reference.

## A new job for someone already in the CRM

1. Press **+ New** and type their name, phone, email, postcode or HX-ref.
2. Pick them from the list. It shows their reference, postcode and how many jobs they have.
3. Fill in the rest as above. **Site address** and **Site postcode** start as their last job’s; change them if this job is somewhere else.
4. Press **Create opportunity**.

The new job gets its own reference, such as HX-0042-2. A second job for an existing customer doesn’t get the new-lead follow-up messages or the “hasn’t been contacted” alert.

If the sheet says “Possible duplicate of …”, check you’ve picked the right person. See [Merge a customer who’s in twice](/admin/help/customers/merge-duplicates).

> **Good to know:** To start a job that’s already sold or under way (Won, Design & approvals and so on), use **+ New project** on the Projects page instead. See [Start a project](/admin/help/projects/start-a-project).

## Enquiries that aren’t in the CRM yet

If the CRM page says, for example, “2 enquiries aren’t in the CRM yet”, press **Review**. The **Enquiries without an opportunity** sheet lists each one with its postcode, where it came from and when. Press **Create opportunity** to make it a Lead (the products are guessed from what they said they were interested in) and open its page.

Next: [Sales stages and moving a customer along](/admin/help/customers/sales-stages).
