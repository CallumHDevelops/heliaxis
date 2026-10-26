---
title: Take a deposit by card
summary: Set a deposit on a job so the customer can pay it by card from their portal after signing, and see when it’s paid.
order: 190
keywords: deposit, card payment, pay online, Stripe, payment link, bank transfer, paid, deposit due
where: CRM › Opportunities › a customer › Quote & deposit
access: crm
---
The deposit is set on the **Quote & deposit · DNO** card in the customer’s left column. The card appears from Quote sent.

## Set the deposit

1. Under **Quote & deposit**, type the amount in **Deposit £** (for example 1500).
2. Press **Save**.

The customer sees it as **Pay your deposit** on their portal once they’ve signed (signing moves the job to Won and opens the full portal), or from Won if you moved the job there yourself. It says the amount “secures your installation date”, and their progress tracker shows “Deposit due” under **Order confirmed** until it’s paid.

## How the customer pays

- With card payments connected: they press **Pay by card**, pay on a secure payment page, and come back to “Thank you, your deposit has been paid. We’ll be in touch to confirm your installation date.”
- Without: the portal shows the amount and says “We’ll send you our bank details to pay by transfer.”

Card payment is only offered once the quote is signed: online, or a quote or contract marked as signed in **Docs**. Under the deposit box, the card tells you which applies: “The customer can pay it by card from their link once they’ve signed the quote.” or “Card payments aren’t connected yet (Stripe). The portal shows the amount due.”

## When it’s paid

The card shows “💷 Paid” with the date, and the tracker shows “Deposit paid”. On the Projects list, a job with an unpaid deposit shows **Deposit due**, and it’s marked as needing attention once the job has been going for more than a week (see [The Projects list](/admin/help/projects/projects-list)).

> **Good to know:** Card payments only work once a Stripe account has been connected to the app (see [Connect Stripe for card deposits](/admin/help/admin/stripe-deposits)). Ask the owner if the card says they aren’t connected yet. Until then, customers are told they’ll get bank details instead.
