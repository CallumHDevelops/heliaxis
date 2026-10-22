---
title: Search for a customer or project
summary: Find anyone by name, postcode, phone, email or HX reference from the dashboard, or from any page with Ctrl K.
order: 80
keywords: search, find, look up, Ctrl K, Cmd K, ⌘K, quick search, find customer, find job, postcode, phone number, HX-ref, reference
access: enquiries, crm
---
One search box finds customers and their jobs from anywhere in the app. You need Enquiries or CRM to see it.

## Where to search

- **On the dashboard:** the box under the greeting. Press **/** to jump into it.
- **On any other page (computer):** click **Search** in the top bar, or press **Ctrl K** (**⌘K** on a Mac). A search box opens over the page. On the dashboard, the same keys just put the cursor in the dashboard’s box.
- **On a phone:** use the box on the dashboard (the top bar has no Search button on a phone).

## What you can type

- A name: "rob evans", or just "rob".
- A postcode, with or without its space: "np20 4ab" or "NP204AB".
- A phone number, the way you’d write it: "07791 120089".
- An email address, or part of one.
- An HX reference: "HX-0042", "hx42" or "0042".

It matches word by word, in any order: "evans rob" finds Robert Evans, and "rob np15" finds the Robs in NP15. Accents don’t matter: "sian" finds Siân. A customer who was merged into another is still found by their old reference, number or email.

If you have CRM, it also looks at jobs: their title, site address, postcode and reference.

Results appear as you type, once you’ve typed two characters.

## The results

You’ll see up to 8 people. Each line shows their name and HX reference, then their postcode, phone and where they came from (the Meta ad’s name, for example). On the right it shows their job’s stage, how many jobs they have, or their enquiry status.

- Someone with one job (if you have CRM): click their line to open that job.
- Someone with several jobs: each job gets its own line under them (up to 3, then "and … more"). Click the one you want. Their own line opens the first job listed.
- Someone with no job, or anyone if you have Enquiries but not CRM, opens on Enquiries. If you can’t open either, the line says **No job yet** and can’t be clicked.

On a computer, use **↑** and **↓** to move, **Enter** to open and **Esc** to close. Pressing **Enter** straight after typing opens the first result.

Searching never changes anything: opening a result just takes you to the page.

| Message | What it means |
| --- | --- |
| "Keep typing…" | Type at least two characters. |
| "Nobody found for …" | No customer or job matches every word. Try fewer words. |
| "Can’t search right now: are you offline?" | No connection. |
| "Search isn’t working right now. Try again in a moment." | Something went wrong on the server. Try again shortly. |
| "You’ve been signed out. Refresh the page to sign in again." | Your sign-in ran out: refresh. |

> **Once switched on:** HX references are searched once customer-refs.sql has been run, and job references once crm-v3.sql has been run.

The CRM page has its own search box too, which also matches word by word. See [Find a customer](/admin/help/customers/find-a-customer). For the keys that open and move through search, see [Keyboard shortcuts](/admin/help/getting-started/keyboard-shortcuts).

<!-- shot: getting-started/search.jpg | Search: type a name, postcode, phone, email or HX-ref | The search box open over a page, with results -->
