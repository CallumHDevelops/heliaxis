---
title: Merge a customer who’s in twice
summary: Join two records for the same person into one, choose which details to keep, and join their jobs for the same work.
order: 150
keywords: duplicate, merge, same person twice, possible duplicate, looks like the same person, combine, join jobs, not the same person, dedupe, two records
where: CRM › Pipeline › a customer › ⋯
access: crm
---
When the same person is in the CRM twice (say they came in from the website and again from a Meta ad), merge them so there’s one record with everything on it.

The app spots likely duplicates (the same email, the same phone or WhatsApp number, or an online booking that matched someone already in the CRM). Their page shows “Looks like the same person as Rob Evans (HX-0069) · same number”, and their card on the Board and List shows **Possible duplicate**.

![The Merge two records sheet, with Which record stays, Details, Jobs and What happens.](/help/customers/merge-sheet.jpg "Merging two records for the same person.")

## Start a merge

Any of these opens the merge sheet:

- **Merge…** on the “Looks like the same person as …” badge.
- **⋯ › Merge with another customer…** on their page (there’s no **⋯** on a phone). Under **Find the other record**, type a name, phone, email, postcode or HX-ref and pick them.
- On the Enquiries page (admins): **Select**, tick the two people, then **Merge 2 selected**.

## Work through the sheet

1. **Which record stays**: the app suggests one and says why (it has the signed quote or the paid deposit, kit has been ordered for its job, its job is further on, or it came in first). Press **Swap**, or pick the other card, to keep that one instead.
2. **Details**: for each detail that differs (**Name**, **Mobile**, **Email**, **Postcode**, **Interested in**, **Property**), the app ticks the better one and says why, such as “WhatsApp needs a mobile” or a postcode that isn’t a UK one. Tap the other to use it.
3. **Jobs** (headed with the other record’s reference): for each of its jobs, pick **Join into …** or **Keep as its own job**. The app suggests joining when both have one open job for the same things at the same address. A joined job keeps the stage that’s further on. When joining changes which lead a sale counts for in Reports, it says so, with a button to count it for the other.
4. **What happens**: what moves across (WhatsApp messages, notes, tasks, photos and so on), what’s cancelled, and where WhatsApp replies will go. Tick any box it shows.
5. Press **Merge**.

It can’t be undone. The kept customer’s timeline records what was merged and by whom.

## What can’t be joined

Two jobs are never joined when both have a signed quote or a paid deposit, both are already projects, both have a survey with answers in it, or they’re linked to different RAMS projects. They stay as separate jobs under the one customer.

> **Admins only:** Records with a signed quote, a paid deposit or kit ordered can only be merged by an admin. When both have signed paperwork, you also type the kept reference to confirm.

## Afterwards

The old reference, old links and the other number and email all find the kept customer. A WhatsApp from the other number lands in their chat. Their **Customer** card shows **Also came in via …** under **Source**, and **Other numbers** (see [Change a customer’s details](/admin/help/customers/edit-customer-details)).

## Not the same person

If the badge is wrong (a couple who share an email, say), use **⋯ › Not the same person as …**. The badge stops suggesting it.

## Two jobs for one customer made by mistake

Use **⋯ › Join this job with another of Jane’s jobs…**. The **Join two jobs** sheet asks “Which job is the same work as this one?” (if they have more than one other job): pick it, check what it says, and press **Join the jobs**. The job that’s further on stays, with its stage.

> **Once switched on:** Merging needs merge.sql (after customer-refs.sql). Until it’s run, the sheet says it needs one more database step.
