---
title: Check the WhatsApp connection
summary: Ask Meta whether the WhatsApp number is connected, reconnect incoming messages, and find the number’s IDs.
order: 100
keywords: WhatsApp not working, messages not arriving, WhatsApp offline, connected, pending, register number, PIN, coexistence, webhook, phone number ID, account ID, Meta, WhatsApp Manager, Live check with Meta
where: Dashboard › From Claude › Check Vercel keys → › WhatsApp
access: admin
---
> **Admins only:** The live check is on the Vercel keys page, which only admins can open.

If WhatsApps stop coming in or going out, this is the first place to look. It asks Meta, live, about the number Heliaxis uses.

## Open it

1. On the dashboard, in **From Claude**, press **Check Vercel keys →**. (If the card has gone, open /admin/setup/env.)
2. Scroll to the **WhatsApp** group. Under its keys is **Live check with Meta**. It says "Checking with Meta…" for a moment.

If the WhatsApp keys aren’t in Vercel yet, it says so instead. The **Finish connecting WhatsApp** job on the From Claude card walks you through adding them, with the **WhatsApp & Meta Lead Ads setup** guide.

## What it tells you

**The number.** A box shows the number and its name, with Meta’s verdict:

| It says | What it means |
| --- | --- |
| "Connected. Ready to send and receive." | All is well. |
| "Pending…" | Meta is finishing setup. Press **Check again** in a few minutes. |
| "Not on the WhatsApp API yet (WhatsApp Manager shows this as “Offline”)." | The number isn’t connected yet. See below. |
| Flagged, restricted or banned | Meta has a problem with the number. Check **WhatsApp Manager › Phone numbers** for Meta’s message. |

If the display name hasn’t been approved by Meta yet, it says so under the number.

**Incoming messages.** Once the WhatsApp account ID is in Vercel, it lists the apps that receive this account’s messages. If it says **No app receives this account’s messages yet**, press **Connect to app** so incoming WhatsApps reach Heliaxis. If an app is already listed but messages still don’t arrive, the button says **Connect Heliaxis CRM again**: press it. It says "Done. The app is subscribed to this account." when it has worked.

**Numbers this token can see.** Every WhatsApp account and number Meta lets Heliaxis see, each with its ID and a **Copy** button. The ones already in Vercel are marked **in Vercel**. Use these when a setup job asks for the account or phone number ID.

## If the number isn’t connected

> **Watch out:** If the number is used in the WhatsApp Business app on a phone, don’t register it here. That moves it off the phone for good. It needs Meta’s "coexistence" option instead, which keeps the app working. Ask Claude for the steps.

Only if the number isn’t on any phone:

1. Tick **This number isn’t used in the WhatsApp or WhatsApp Business app on any phone, and I’m happy for it to work only through Heliaxis.**
2. Type a 6-digit PIN in **6-digit PIN**. It becomes the number’s two-step verification PIN, so write it down. If the number already has a PIN, use that one.
3. Press **Register number**. It says "Registered. Keep that PIN safe."

Press **Check again** any time to ask Meta afresh.

For using WhatsApp day to day, see the WhatsApp section, starting with [The WhatsApp inbox](/admin/help/whatsapp/the-whatsapp-inbox).
