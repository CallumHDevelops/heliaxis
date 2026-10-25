---
title: Start a project
summary: Add a job sold outside the website flow, an add-on, or a job already under way, with its trades if you know them.
order: 50
keywords: new project, new job, add a job, add-on battery, callback, load in, existing job, new customer, trades, rates, who’s doing the work
where: Operations › Projects › + New project
access: crm
---
Use **+ New project** for a job sold outside the website flow, an add-on battery, a callback, or a job already under way that you want to load in. New enquiries still start on the CRM.

1. Press **+ New project**. From a customer’s job you can also use **⋯** › **New project for Jane**, or **New project for Jane** at the foot of the left column.
2. **Customer**: type a name, phone, email, postcode or HX-ref and pick them, or press **+ New customer** (Full name, Mobile, Postcode, Email). If you see “Possible duplicate of …”, check it’s the right person.
3. **Products**: tick what’s being fitted.
4. Fill in **Name for the job** (optional; it suggests one, such as “Solar + battery · NP20 4AB”), **Site address**, **Site postcode**, **Value £ (optional)** and **Owner**.
5. **Where is it up to?** Choose **Won (just sold)**, **Design & approvals**, **Ready to book**, **Install booked** or **Installing**.
6. **Who’s doing the work (optional)**: there’s a row for each trade the products need: Scaffolder, Roofer and Electrician for solar; Electrician for a battery, EV charger or heat pump. For each one:
   - find the person (for example **Find a roofer: name, firm or mobile**), or press **+ New person**;
   - enter the **Rate** (ex VAT) and choose how it’s paid: **Fixed price**, **Per panel** (roofer only), **Per day** or **Per hour**, with the days or hours agreed;
   - set the start date, and the VAT if they’re VAT registered.

   Press **Remove** on a row you don’t need, or **+ Add another trade** for more.
7. Press **Create project**. The job opens on its Overview.

![The New project sheet for Bob Jones with Solar PV and Battery ticked and three trades filled in.](/help/projects/s06-new-project-trades.jpg "New project for an existing customer, with Who’s doing the work filled in: rate, how it’s paid, start date and VAT.")

> **Once switched on:** **Who’s doing the work (optional)** appears once site-commissioning.sql has been run. Until then, New project has no trades block.

> **Good to know:** The trades block is optional. You can add trades later on the Site tab ([Add a trade to a job](/admin/help/site/add-a-trade)). If a trade’s agreement has a rate, it fills in when you pick them. Check it.

> **Watch out:** A VAT-registered trade needs the VAT chosen (or a company default), or the project won’t save. If the job is made but a trade couldn’t be added, it tells you. Add them on the Site tab.
