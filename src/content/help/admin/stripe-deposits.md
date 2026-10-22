---
title: Connect Stripe for card deposits
summary: Let customers pay their deposit by card from their portal, and have the CRM mark it paid by itself.
order: 190
keywords: Stripe, card payments, pay by card, deposit, online payment, webhook, signing secret, checkout, payment not showing as paid
where: Dashboard › From Claude › Connect Stripe for card deposits
access: admin
---
> **Admins only:** Connecting Stripe is a setup job on the **From Claude** card (under the optional ones).

Without Stripe, a customer’s portal shows the deposit due and says you’ll send bank details. With Stripe connected, they can press **Pay by card** after signing their quote. How staff set the deposit and see it paid is in [Take a deposit by card](/admin/help/customers/card-deposits).

## Set it up

Open **Connect Stripe for card deposits** on the From Claude card. It’s one of the optional jobs: if you can’t see it, tap the button that shows how many there are, for example **+ 3 optional**. Its steps:

1. Open Stripe › **Developers › API keys**, then reveal and copy the **Secret key**.
2. In Stripe, go to **Developers › Webhooks › Add endpoint**. Paste the **Endpoint URL** from the job (it has a copy button) and choose the event `checkout.session.completed`.
3. Copy the endpoint’s **Signing secret**.
4. Add both as keys in Vercel, using the names in the job, and redeploy. See [The Vercel keys page](/admin/help/admin/vercel-keys).

Card payments only switch on once both keys are in. With just the secret key, the app treats Stripe as not connected: customers aren’t offered **Pay by card**, so nobody can pay a deposit the CRM wouldn’t hear about.

## When a customer pays

Stripe tells Heliaxis straight away. The app then:

- marks the job’s deposit as paid,
- writes "💷 Deposit of £… paid by card" on the customer’s timeline, and
- sends everyone with CRM access a notification: "💷 Deposit paid: …".

## Check it’s working

- **CRM › CRM settings › Connections** says **Card deposits (Stripe)** "connected". It only says so once both the secret key and the signing secret are set.
- The **Card deposits (Stripe)** group on the Vercel keys page has two **✓**. If one is missing, Connections says "not connected" and customers are told they’ll get bank details.

> **Watch out:** If customers can pay but the deposit never shows as paid, the webhook isn’t reaching Heliaxis. Check the endpoint URL, the `checkout.session.completed` event and the signing secret in Vercel.
