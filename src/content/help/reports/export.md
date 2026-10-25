---
title: Export customers and jobs
summary: Download every customer or every job in the CRM as a spreadsheet that opens in Excel.
order: 80
keywords: export, download, CSV, Excel, spreadsheet, backup, customer list, jobs list, mailing list, accountant, all customers
where: CRM › CRM reports › Export
path: /admin/crm/reports
access: admin
---
The **Export** part at the bottom of CRM reports downloads spreadsheets of everything in the CRM, not just the period you’re looking at.

> **Admins only:** Only admins see **Export**.

## Download a spreadsheet

1. Open **CRM › CRM reports** and scroll to **Export**.
2. Press **Export customers (CSV)** or **Export jobs (CSV)**.
3. The file downloads, named with today’s date. Open it in Excel.

## What’s in each one

**Export customers (CSV)** has one row per customer, oldest first:

Name, Email, Phone, Postcode, Source, Status, WhatsApp permission, Permission date, Created, Number of projects.

- **Source** is the short name the CRM keeps, such as quote-form or meta: Video 4. See [Sources in the report](/admin/help/reports/sources).
- **Status** is their Enquiries status: New, Contacted, Quoted, Won or Lost.
- **WhatsApp permission** says "Yes" and how they agreed (for example "Yes (Meta lead form)"), "No (replied STOP)" or "Not recorded".
- **Number of projects** counts all their jobs, open or closed.

**Export jobs (CSV)** has one row per opportunity or project, oldest first:

Ref, Title, Customer, Stage, Products, Value, Address, Postcode, Survey date, Install date, Install days, Owner, Accepted, Deposit, Deposit paid, DNO status, MCS number, Created.

## Good to know

- Dates and times are UK time, written so Excel reads them as dates ("2026-10-19 14:30").
- UK phone numbers are written like "07700 900123", so Excel keeps the leading 0.
- Money is in pounds, with the £ sign.

> **Watch out:** The files hold customers’ personal details. Keep them somewhere safe, and delete copies you no longer need.
