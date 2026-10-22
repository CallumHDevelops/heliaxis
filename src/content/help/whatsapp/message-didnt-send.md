---
title: When a WhatsApp doesn’t go
summary: What each "not sent" or "not delivered" message means, for your own messages, templates, scheduled messages and the automatic ones, and what to do.
order: 195
keywords: not sent, failed, not delivered, red exclamation mark, error, didn’t send, won’t send, can’t send, retry, Couldn’t chase, reply failed, template rejected, window is closed, no valid mobile number, 4096 characters, stuck, nothing sending
access: enquiries
---
Most WhatsApps that don’t go fall into one of four groups. CRM staff without Enquiries see the same in their customers’ chats.

## When you press Send

The reason shows in red above the reply box, and your message stays in the box so you can try again.

| It says | What to do |
| --- | --- |
| "The 24-hour reply window is closed — WhatsApp only allows a template until they message back." | The window closed while the chat was open. Send a template instead: see [Send a template in a chat](/admin/help/whatsapp/send-a-template) |
| "This lead has no valid mobile number." | Add or correct their **Mobile** on the **Customer** card. See [Link a chat to a customer](/admin/help/whatsapp/link-a-chat-to-a-customer) |
| "WhatsApp messages are limited to 4,096 characters." | Shorten it, or split it into two messages |
| The box is greyed out and the chat says "WhatsApp isn’t connected yet — sending is disabled until the Meta keys are added." | An admin needs to finish the Meta connection. See [What needs switching on for WhatsApp](/admin/help/whatsapp/what-needs-switching-on) |
| "Documents can only be sent within 24h of their last message — send it by email, or put it in their portal." | Email it, or add it to their portal |

A template can also be turned down as it’s sent, for example "That template isn’t approved in this language (or it was deleted). Check WhatsApp templates.", "Meta has paused this template because people blocked or reported it. Try another one." or "Meta has turned this template off. Try another one." Pick another template, and see [Template statuses, rejections and changes](/admin/help/whatsapp/template-approval).

## Sent, but not delivered

A message WhatsApp couldn’t deliver gets a **!** instead of ticks, with WhatsApp’s reason under it, and everyone with Enquiries gets "WhatsApp message not delivered". There’s no retry button on it: send it again (or a template, if the 24 hours are up).

## Something waiting to go that failed

A smart reply or chaser that couldn’t go shows "⚠ … failed: …" under the last message, with **Retry** and **Cancel**. The app tries 3 times, a minute apart, before it gives up. Everyone with Enquiries also gets "WhatsApp reply to Jane Smith failed" or "Couldn’t chase Jane Smith". The usual reasons:

- "The free 24h window has closed and no chase template is set (Smart replies → Chasers)." Put a template name in **Template for chasers outside the free window** on **Smart replies & chasers**, or ask an admin to choose one under **Use for…** on **WhatsApp templates**.
- "The template “…” needs “…”, which can’t be filled in automatically." The template chosen for that job has a blank the app can’t fill. An admin picks another one. See [Templates the app sends by itself](/admin/help/whatsapp/templates-the-app-uses).

An automatic WhatsApp to someone who replied STOP (or, with the permission rule on, hasn’t agreed) is cancelled just before it goes, so it simply disappears from the chat. See [WhatsApp permission and STOP](/admin/help/whatsapp/whatsapp-permission).

## A scheduled message that didn’t go

The person who scheduled it gets "Your WhatsApp to Jane Smith didn’t go", and the chat shows "⚠ Scheduled message not sent" with the reason, **Retry** and **Cancel**. The usual one: "Not sent: Jane hasn’t messaged in the last 24 hours, so WhatsApp won’t take a typed message now. Open the chat to send it as a template instead." See [Send a WhatsApp later](/admin/help/whatsapp/send-later).

Pressing **Cancel** on something that has just gone says "Too late: that message has already gone"; **Send now** or **Save** says "Already sent or cancelled".

## Nothing automatic is going at all

If smart replies, chasers and scheduled messages only go while someone has the inbox or a chat open, the every-minute job isn’t running. An admin can check it: see [Check the every-minute job is running](/admin/help/admin/every-minute-job).
