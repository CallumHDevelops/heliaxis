---
title: Labour POs
summary: Find the labour POs the site app raises for trades, read their review state, and record the trade’s invoice.
order: 30
keywords: labour PO, trade PO, subcontractor PO, held, issued, waiting for review, on hold, green light, to pay, issue PO, issue anyway, issue again, cancel PO, delete, print version, their invoice
where: Operations › Projects › a job › Orders
access: crm
---
Labour POs are raised by the site app when a trade signs off ([Sign-offs and the automatic labour PO](/admin/help/site/sign-offs-and-labour-pos)). They appear in the same lists as supplier orders: on the job’s **Orders** tab and on the Purchase orders page.

## In the list

Each has a **Labour** chip, who it’s for, “to pay”, and the review state: **Waiting for review**, **On hold: return to site required** or **Green light**. **Held** means waiting for you; **Issued** means sent to them.

![A job’s Orders tab with the roofer’s labour PO and two supplier orders.](/help/purchase-orders/s19-orders-tab-supplier-and-labour.jpg "A job’s Orders tab: the roofer’s labour PO (Labour, to pay, waiting for review) beside the supplier orders.")

## Open one

You’ll see **Who it’s for**, **The work**, **So far**, the money (labour, materials with no CIS, VAT, CIS and **What they’ll be paid**) and **Terms on the PO**.

The buttons are **Download PDF**, **Print version**, **Issue PO**, **Issue anyway** or **Issue again**, **Cancel PO**, and **Delete** for held ones only.

![Labour PO PO-0105 opened, with the roofer, the work, so far, the money, the terms and the buttons.](/help/purchase-orders/s21-labour-po-sheet.jpg "A labour PO opened: who it’s for, the work, so far, what they’ll be paid, the six terms, and Download PDF, Print version and Issue again.")

Record **Their invoice** once it’s issued.

## Read more

- Why one is **Held**, and when to press **Issue again**: [When a labour PO is held instead of sent](/admin/help/site/held-labour-pos).
- The money: [How a labour PO’s money is worked out](/admin/help/site/labour-po-money).
- The terms: [The terms on every labour PO](/admin/help/site/labour-po-terms).

> **Once switched on:** Labour POs need site-commissioning.sql, after purchase-orders.sql.
