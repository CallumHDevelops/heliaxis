---
title: Why the report’s numbers differ from Enquiries and Meta
summary: Why Leads on CRM reports isn’t the same as the count on Enquiries or the leads Meta shows in Ads Manager, and when a gap needs checking.
order: 45
keywords: numbers don’t match, wrong numbers, missing leads, Meta says more leads, Ads Manager count, lead count, difference, gap, Meta counted, Enquiries count, imported leads, duplicate, matched
where: CRM › CRM reports
path: /admin/crm/reports
access: crm
---
CRM reports, Enquiries and Meta each count leads their own way, so their numbers rarely match exactly. Most gaps are normal. This is what makes them differ.

## Reports and Enquiries

- **Reports count jobs, Enquiries counts people.** **Leads** on CRM reports is the number of opportunities made in the period. A customer with two jobs counts twice. Someone on Enquiries with no job isn’t counted at all.
- **Every new job counts.** A second job for an existing customer, someone added with **+ New**, and a project added straight in at Won all count as leads in the period they were made.
- **The count at the top of Enquiries is everyone, ever.** "340 leads" there isn’t for a period. CRM reports only counts the last 30 days, 90 days or 1 year.
- **Imported leads keep their old dates.** A Meta lead or WhatsApp chat imported today counts in the period it first came in, not today.
- **Deleted customers drop out.** Their jobs leave every figure.
- **A merged customer can still count as two leads.** When two customers are merged, the lead that was joined into the other job still counts as a lead for its own source, with nothing sold. See [What each figure means](/admin/help/reports/figures-explained).

## Reports and Meta

Once ad spend is connected, the note under **By source and ad campaign** puts Meta’s own lead count beside the CRM’s: "Meta counted 52 leads from your ads; the CRM has 48 from Meta in this period." On a computer, point at a **Leads** number in a Meta row to see Meta’s count for that row ("Meta counted 12"). A small gap is normal, because:

- **Meta counts on its own dates.** Its figures run by calendar day in the ad account’s time zone, today included. The CRM counts jobs made in the last 30, 90 or 365 days from now.
- **Meta counts every lead it puts down to your ads**, website leads included. The CRM only knows a website enquiry came from a Meta ad when the visitor accepted cookies; otherwise it’s a website lead.
- **People already in the CRM aren’t counted again.** When an imported lead is matched to someone already in the CRM, it goes on their timeline instead of making a new job, so Meta counts it and the CRM doesn’t.

The CRM’s Meta total is lead forms on an ad, website enquiries from a Meta ad link and WhatsApp chats started from an ad. Lead forms that weren’t on an ad (**meta-organic**) aren’t in it.

## When a gap needs checking

A big gap, with Meta well ahead, can mean new lead-form leads aren’t reaching the CRM. Ask an admin to check that live leads are on and to import any that were missed: see [Meta lead ads coming in](/admin/help/enquiries/meta-lead-ads).

If a renamed ad’s leads seem to be missing from its row, see [Renamed ads](/admin/help/reports/renamed-ads). Before ad spend is connected, a renamed ad’s leads can be split over two rows in the source table: see [Sources in the report](/admin/help/reports/sources).
