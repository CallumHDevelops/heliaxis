---
title: Delete a customer
summary: Remove a customer and everything about them for good, one at a time or in bulk, and keep them from coming back on the next import.
order: 160
keywords: delete, remove, erase, GDPR, right to be forgotten, bulk delete, select all, delete selected, spam, test lead, re-import, deleted before skipped
where: CRM › Enquiries
path: /admin/enquiries
access: admin
---
> **Admins only:** Only admins can delete customers. The **Select** button and **Delete customer** only show for admins.

Deleting a customer removes them completely: their details and timeline, their WhatsApp chat (and anything still waiting to send), emails, opportunities with their tasks, photos, documents and signatures, and the notifications about them. It can’t be undone.

If you only want to stop working on a job, mark it Lost instead: the history stays. See [Lost, on hold and reopening](/admin/help/customers/lost-and-on-hold).

## Delete one customer

1. Go to **CRM › Enquiries**.
2. Find them and press **View**.
3. Press **Delete customer**.
4. Read what it will remove, then press **Delete customer** again.

## Delete several at once

1. On **Enquiries**, press **Select**.
2. Tick the people, or tick **Select all** to take everyone the search, source and status filters show.
3. Press **Delete selected (n)**.
4. Check the names and what will go. If you’re deleting more than 5, type **DELETE** in the box.
5. Press **Delete n customers**.

Press **Done** to leave Select without deleting anything. Afterwards a line at the top says how many were deleted and how many were kept.

## Who’s kept unless you say so

Anyone with a signed quote, a paid deposit, a purchase order sent to a supplier, or trade sign-offs and certificates is listed with “you may need to keep these records”. They’re kept unless you tick **Delete Jane anyway** (or **Delete these 3 too**). Unticked, only the others go.

If someone being deleted shares a WhatsApp number with someone who isn’t, it tells you whose messages go and whose stay.

## They won’t come back on an import

Deleted people aren’t brought back by **Import**. A Meta lead import counts them as “deleted before, skipped”. A WhatsApp chat import shows “Deleted before, skipped”, with **Import anyway** if you do want them back. Only a one-way fingerprint of their Meta lead id, mobile and email is kept for this, never their details. If they send a new enquiry or a WhatsApp after you delete them, it comes in as normal.

For the rest of the Enquiries page, see [What’s on the Enquiries page](/admin/help/enquiries/enquiries-page).

> **Once switched on:** Skipping deleted people on import needs deleted-customers.sql. Until it’s run, deleting works, but the sheet warns that importing again could bring them back.

## Deleting one job instead

To remove just one job and keep the customer, use **⋯ › Delete this job** on its page, or **Delete this job** at the bottom of the left column (on a phone, the **Details** tab). Admins only. **Delete this job?** says what goes: that job’s timeline, tasks, photos, documents and portal link. Press **Delete the job**, or **Keep it**. The customer, their WhatsApp chat, emails and other jobs stay. A job with a signed quote (signed online, or marked as signed in Docs), a paid deposit, a purchase order sent to a supplier, or trade sign-offs or labour POs asks you to type its reference, then **Delete everything** (or mark it Lost instead). If it was their last job, it tells you their details, WhatsApp chat and emails are kept, with **Open Enquiries** to delete them there too.
