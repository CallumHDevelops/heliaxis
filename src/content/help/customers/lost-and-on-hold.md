---
title: Lost, on hold and reopening
summary: Mark a job Lost (with a reason), put it on hold so the reminders stop, and bring it back later.
order: 200
keywords: lost, not interested, went elsewhere, lost reason, on hold, pause, paused, waiting, reopen, revive, come back, closed
where: CRM › Opportunities › a customer
access: crm
---
## Mark a job Lost

1. On the customer’s page, press the stage button (such as **Quote sent ▾**).
2. Under **Done**, tap **Lost**.
3. The app asks “Why was Jane Smith’s job lost? (optional, e.g. price, timing, went elsewhere)”. Type a reason, or leave it empty, and press **OK**. **Cancel** keeps the job as it is.

The page then shows a **Lost** badge, and the job leaves the **Live** chip. The reason shows in **Job details** as **Why it was lost**. Reports count the job as lost, but don’t list the reasons. To add or change it later, press **✎ Edit** on **Job details** and use **Why was it lost?**.

You can also move a card to **Lost** from the Board or List (**Move**). That doesn’t ask for a reason.

What Lost does:

- The customer’s private link stops working, and the **Customer portal** card says “There’s no customer link for a Lost job.”
- Its next-step reminder, and any survey or install countdown messages, stop.
- Reminders for its tasks still go out. Tick off any task you no longer need (see [Next steps and tasks for a customer](/admin/help/customers/next-step-and-tasks)).
- Everything else stays: notes, chat, photos, documents. If all their jobs are now Lost, their Enquiries status becomes Lost too.

> **Good to know:** Lost keeps the history. Deleting removes it for good, and only admins can do it. See [Delete a customer](/admin/help/customers/delete-customers).

## Reopen a Lost job

Press the stage button (**Lost ▾**), or on a phone **Reopen →**. **Move stage** opens: pick the stage it’s really at. The job goes back on the **Live** chip. If you move it back to Quote sent or Won, the customer’s link works again.

## Put a job on hold

For a job that’s paused (waiting for a roof repair, a mortgage, the spring):

1. On **Job details**, press **✎ Edit**.
2. Tick **On hold**.
3. Say why in the box (“Why? e.g. waiting for the roof survey”).
4. Press **Save**.

The header shows **On hold: reason**, the **Important** card at the top of the left column says so, and the card on the Board and List shows **On hold**. The timeline notes it.

While a job is on hold:

- No survey or install countdown messages go to the customer.
- The new-lead follow-up messages pause.
- Reminders for its tasks don’t go out.
- An install-day job isn’t moved to Installing by itself.
- On the Projects page it leaves the Live list.

Its next step’s reminder still goes off, so move or clear the next step if you don’t want it. It stays at its stage, and you can still message the customer yourself. To take it off hold, untick **On hold** and **Save**.

> **Once switched on:** **On hold** needs crm-v3.sql. Until it’s been run, the box isn’t in Job details.
