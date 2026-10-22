---
title: Import WhatsApp Business app chats
summary: Bring old chats from the WhatsApp Business app into customers’ chats in the CRM, with their original dates.
order: 180
keywords: import, export chat, WhatsApp Business app, old chats, chat history, txt, zip, without media, bring in chats, 01633 965205, Import anyway, deleted before, Heliaxis is
where: CRM › Enquiries › Import
path: /admin/enquiries/import
access: admin
---
> **Admins only:** The **Import** button (top right of **CRM › Enquiries**) and the Import page are for admins.

The page’s **WhatsApp Business app chats** part brings in chats from the WhatsApp Business app on 01633 965205. WhatsApp exports one chat at a time, so export each customer’s chat, then choose all the files together.

## Export a chat from the phone

**Android**
1. Open the chat in WhatsApp Business.
2. Tap ⋮ → More → Export chat.
3. Choose Without media.
4. Save it to your phone or Drive, or email it to yourself.

**iPhone**
1. Open the chat and tap the customer’s name at the top.
2. Tap Export Chat.
3. Choose Without Media.
4. Save to Files. It’s a .zip; choose it as it is.

## Import them

1. On the Import page, press **Choose chat files** and pick all the files.
2. Each chat shows the name from the file, how many messages and the dates. Read any warning under it (for example, dates read the UK way, day/month).
3. **Heliaxis is**: pick which name in the chat is us. The app guesses when it can. If only the customer wrote, pick **Nobody here (only the customer wrote)**.
4. **Customer**: someone already in the CRM with that number is picked for you ("already in the CRM with this number"). Otherwise type in **Name, phone or email**, press **Search** and pick them, or press **Add them as a new lead** and give their name and **Mobile, e.g. 07700 900123**. **Change** and **Find them in the CRM instead** let you choose again.
5. Open **First messages** to check you’ve got the right chat.
6. Press **Import** on each, or **Import all ready (3)** for all of them.

Each one then says, for example, "Added Jane as a new lead · 120 messages imported · **Open the chat**", "Added Jane to the CRM at Contacted · …" (when the chat has messages from us) or "Matched Jane, moved to Contacted · …".

## What importing does

- Messages keep their original dates. Nobody is messaged or notified, and no smart reply or chaser is set.
- It doesn’t open the 24-hour window or mark the chat unread. Replies from the CRM go from 01633 965439, not the app’s number, so the first message to them has to be an approved template.
- If the chat has messages from us, the customer moves from Lead to Contacted.
- If the customer wrote in it, that counts as WhatsApp permission.
- In the chat, "Imported from the WhatsApp Business app" marks where it starts. Imported messages have no ticks.
- Importing the same chat again adds nothing new ("… were already there").

## Things it won’t do

- Group chats: "Only one-to-one chats can be imported."
- Customers you’ve deleted: "Deleted before, skipped…". Press **Import anyway** if you do want them back.
- More than 20,000 messages in one chat ("This chat has … messages; the most in one go is 20,000."), or a file that’s too big ("That chat is too big to import in one go.").
- Add the chat’s number to a customer who already has a different number, or whose number someone else has: it says so.

Chats you add stay on the list, on any computer, until you import them or remove them with **×** (which asks "Remove this chat from the list? It hasn’t been imported.").

> **Good to know:** The page may also say how many customers you’ve already messaged on WhatsApp are still at Lead, with **Move them all to Contacted** and **Not now**. See [Move messaged customers to Contacted](/admin/help/enquiries/contacted-catch-up).

Older Meta lead-form leads are imported on the same page: see [Import older Meta leads](/admin/help/enquiries/import-meta-leads).

> **Once switched on:** Importing chats needs whatsapp-chasers.sql. Without it, Import says "Run supabase/whatsapp-chasers.sql in Supabase first."
