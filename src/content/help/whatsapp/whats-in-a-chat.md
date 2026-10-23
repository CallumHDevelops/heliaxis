---
title: What you see in a chat
summary: Ticks, who sent each message, imported history, smart replies and chasers waiting to go, and the photos or voice notes customers send.
order: 45
keywords: ticks, blue ticks, delivered, read, failed, exclamation mark, Sent from the WhatsApp app, Chaser label, Smart reply label, imported, photo, voice note, video, document, download, Save to job photos, Back to job, reply queued, Retry, Send now, Edit, Cancel
where: CRM › WhatsApp inbox › a chat
path: /admin/enquiries/inbox
access: enquiries, crm
---
![A WhatsApp chat with ticks, a smart reply, a chaser waiting and the reply box](/help/whatsapp/chat-page.jpg "A chat: messages, a chaser waiting, and the reply box")

## The top of the chat

- **←** back to the list, their initial and name.
- Their reference, number and how long the free window has left ("HX-0042 · +447700900123 · 19h left"), or "window closed".
- **↻** reloads the chat now.
- **Smart replies on** / **Smart replies off** (Enquiries access): switches smart replies for this chat. See [Smart replies](/admin/help/whatsapp/smart-replies).
- **+ Add task** (CRM access). See [Make a task or call-back reminder from a chat](/admin/help/whatsapp/task-from-a-chat).

Opened from a job, a line shows their name and stage ("Jane Smith · Quote sent") with **Back to job**, which takes you back to the same tab.

## Messages

- Grouped by day: **Today**, **Yesterday**, then the date (with the year, for earlier years).
- Ticks on ours: ✓ sent, ✓✓ delivered or read, **!** failed, with the reason underneath. Everyone with Enquiries gets "WhatsApp message not delivered" when that happens.
- Above a message from us, who sent it: a team member’s name, **Sent from the WhatsApp app** (typed in the WhatsApp Business app on the same number), **Chaser**, or **Smart reply · Battery storage**.
- A template shows the words the customer saw.
- **Imported from the WhatsApp Business app** marks where imported history starts. Imported messages have no ticks.
- A long chat shows its newest 500 messages.

## Waiting to go

Anything that hasn’t gone yet sits below the last message:

| Box | What it is | Buttons |
| --- | --- | --- |
| ⏱ Smart reply “Battery storage” sends in 3:12 | A smart reply | **Send now**, **Edit**, **Cancel** |
| ⏱ First message “…” sends … | The first message to a new Meta lead, shown as they’ll see it | **Send now**, **Cancel** |
| ↻ Chaser if they don’t reply — sends … · free message (or · as a template (paid)) | A chaser; the second one says **Final nudge** | **Send now**, **Edit**, **Cancel** |
| 🕐 Scheduled for 07:00 tomorrow | A message someone scheduled | See [Send a WhatsApp later](/admin/help/whatsapp/send-later) |
| ⚠ … failed: … | It couldn’t go | **Retry**, **Cancel** |

**Edit** opens the words: change them and press **Save**, or **Back** to leave them. For anything marked **!** or ⚠, see [When a WhatsApp doesn’t go](/admin/help/whatsapp/message-didnt-send).

## Photos, voice notes and files they send

- Photos show small; tap one for full size.
- Videos and voice notes play in the chat, with a download beside them. Other files have **Download**.
- "Photo on its way…" shows while it arrives. If it couldn’t be fetched, the reason shows, with **Try again** while it’s under 7 days old. WhatsApp only keeps files for 7 days: after that it says "WhatsApp only keeps files for 7 days, and this one wasn’t saved in time." or "WhatsApp no longer has this file. Ask them to send it again."
- A file over the size limit says "Too big to keep here (…; the limit is …). Ask them to email it instead."
- When the chat is on a job (in the WhatsApp panel, or opened from the job), photos they sent have **Save to job photos**. It then says **Saved to job ✓**.

> **Once switched on:** Photos, voice notes and files need whatsapp-media.sql. Until it’s been run, the chat shows "📷 Photo" (and the like) instead.

The chat updates itself every few seconds while it’s on screen. See [Unread badges, notifications and live updates](/admin/help/whatsapp/unread-and-notifications).
