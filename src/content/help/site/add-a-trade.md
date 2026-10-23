---
title: Add a trade to a job
summary: Put a scaffolder, roofer, electrician or other trade on a job with their dates, agreed rate, VAT and CIS.
order: 10
keywords: Site tab, subcontractor, scaffolder, roofer, electrician, plasterer, other trade, new person, agreed rate, fixed price, per panel, per day, per hour, VAT, reverse charge, CIS, electrical certificate, EIC, Minor Works, note to the trade
where: Operations › Projects › a job › Site
access: crm
---
The **Site** tab is there from Won. It replaces phoning round with dates and rates. Each trade gets a link to their own job pack on their phone, with no login.

1. Open the job and go to **Site**. With nobody on it yet, it says “No trades on this job yet…”.
2. Under **Add a trade**, press **+ Scaffolder**, **+ Roofer** or **+ Electrician** (whichever the job needs), or **+ Add a trade**.
3. **Trade**: Scaffolder, Roofer, Electrician or Other trade (“Which trade? e.g. Plasterer”).
4. **Who**: find them by name, firm or mobile, or press **+ New person** and fill in **Name**, **Company**, **Mobile**, **Email**, **VAT number (if they have one)** and **Happy to get job messages on WhatsApp** (see [Job messages to trades on WhatsApp](/admin/help/site/whatsapp-job-messages)).
5. Fill in **What they’re doing (printed on the PO)**, **Start date** and **Days on site**.
6. **Agreed rate**: the £ ex VAT and how it’s paid: **Fixed price**, **Per panel** for the roofer (“The PO uses the number of panels the roofer signs for.”), **Per day** or **Per hour**, with the days or hours agreed. **From their agreement** shows when the rate came from their subcontractor agreement.
7. Leave **Raise a PO when they sign off (untick for Heliaxis staff)** ticked for subcontractors.
8. **VAT**: “Not VAT registered: no VAT” is locked. Otherwise choose **Reverse charge: customer to pay the VAT to HMRC**, **VAT 20%** or **Zero-rated** (or the company default), with **Note on the VAT (optional)**.
9. **CIS** shows their verification, such as “verified (net) · 20% deducted”, “Gross status · no deduction” or “Not verified · 30% deducted”. Press **Change for this job** if you need to.
10. Electrician only: **Paperwork** (which forms they fill in, preset from the products) and **Electrical certificate**: **EIC in the app (design, construction, inspection and testing)**, **EIC in the app, one person did all three**, **Minor Works certificate**, or **They upload their own NAPIT / NICEIC certificate**.
11. Tick **Show the customer’s mobile in their job pack** if you want to, and add a **Note to the trade (top of their job pack)**, such as “Key safe 1234 is on the side gate”.
12. Check the preview line, which shows what the PO will come to.
13. Press **Add to the job**.

![The Add a trade sheet for Valley Scaffolding at £650 fixed, reverse-charge VAT and CIS not verified.](/help/site/s11-add-a-trade-scaffolder.jpg "Add a trade: Valley Scaffolding at £650 fixed, reverse-charge VAT, not CIS verified (30%), and the preview of what the PO pays.")

Next, send them their job pack: see [Send the job pack](/admin/help/site/send-the-job-pack). For how the PO’s money is worked out, see [How a labour PO’s money is worked out](/admin/help/site/labour-po-money).

> **Once switched on:** The Site tab needs site-commissioning.sql (run after purchase-orders.sql and portal-v2.sql). See [What needs switching on](/admin/help/projects/what-needs-switching-on).

> **Good to know:** You can also add trades when you make the job, under **Who’s doing the work (optional)** on New project. See [Start a project](/admin/help/projects/start-a-project).
