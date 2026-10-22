---
title: Connect Microsoft 365 (shared mailbox and Outlook)
summary: What connecting Microsoft 365 switches on, how an admin sets it up, and how to check it’s working.
order: 180
keywords: Microsoft 365, MS365, Office 365, Outlook, email, hello@, shared mailbox, calendar, Entra, app registration, PowerShell, email not sending, replies not showing, Microsoft 365 isn’t connected yet
where: Dashboard › From Claude › Connect Microsoft 365 email
access: admin
---
> **Admins only:** Setting it up needs an admin in Heliaxis and the Microsoft 365 admin sign-in, on a Windows computer.

## What it switches on

Once Microsoft 365 is connected, the app uses the shared mailbox (hello@heliaxis.co.uk):

- **Emails from the CRM** go from the shared mailbox, so customers’ replies come back to it.
- **Replies are picked up.** Every minute, new emails in the shared mailbox’s inbox, and emails sent to customers from the shared mailbox in Outlook, are matched to customers by email address and added to their timeline. An email from a customer also sends everyone with **Enquiries** access an "Email from …" notification. A reply also stops their follow-up sequence.
- **Purchase orders** can be emailed to suppliers as a PDF.
- **Automatic emails**: email steps in the follow-up sequence, and the email that stands in when a WhatsApp reminder can’t go.
- **Outlook calendars**: survey booking reads each surveyor’s Outlook diary, and the app copies surveys, installs and diary entries into Outlook. See [Outlook and the Microsoft 365 calendar](/admin/help/surveys/outlook-calendar).

Until then, the email box on a customer’s page "opens your email app (Microsoft 365 not connected yet) and is logged here", and a purchase order has to be downloaded and emailed by hand, then marked as sent. With it connected, the same box says the email is "sent from the shared Heliaxis mailbox; replies appear on the timeline."

It only gets access to the hello@ and callum@ mailboxes, not every mailbox in the business.

## Set it up

Open **Connect Microsoft 365 email** on the **From Claude** card. Its steps, in short:

1. In Microsoft Entra, register a new app called **Heliaxis CRM** (single tenant), and note its client ID and tenant ID.
2. Make a client secret and copy its **Value** straight away (it’s only shown once).
3. Don’t add any API permissions. Instead, copy the Enterprise application’s **Object ID**.
4. On a Windows PC, open PowerShell and paste the six PowerShell lines from the job, one at a time. They limit the app to the two mailboxes. After the last line, every row should say **True** under **InScope**.
5. Add the four keys from the job in Vercel and redeploy. See [The Vercel keys page](/admin/help/admin/vercel-keys).

The job’s **Open the guide** button opens the longer **CRM setup** guide.

## Check it’s working

- **CRM › CRM settings › Connections** says **Microsoft 365 email** "sending as hello@heliaxis.co.uk".
- The **Microsoft 365 email** group on the Vercel keys page has a **✓**.
- The From Claude job has gone.

> **Watch out:** The client secret expires (the job suggests 24 months). When it does, emails stop. Make a new secret in Entra and replace it in Vercel.
