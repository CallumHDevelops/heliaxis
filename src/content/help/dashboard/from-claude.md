---
title: From Claude setup to-dos
summary: The setup jobs Claude leaves on the dashboard, how to follow one, tick it off, answer a question and choose who sees it.
order: 50
keywords: From Claude, setup, to-do, switch on, SQL file, run SQL, Copy SQL, Vercel keys, Check Vercel keys, question for you, who sees this, setup jobs
where: Dashboard
path: /admin
access: everyone
---
When a new feature needs switching on (a database file to run, a key to add in Vercel, a setting to choose), Claude leaves a to-do for it in the **From Claude** card. It’s on the dashboard and at the top of the Tasks page.

> **Good to know:** Admins see every to-do unless it has been passed to particular people. Anyone else only sees the to-dos an admin has passed to them, and no card at all if there are none.

For what the kinds of setup job are (a database file, a key in Vercel, a setting), see [How setup works](/admin/help/admin/how-setup-works).

## Follow a to-do

The card says how many setup jobs are left. Tap one to open its step-by-step instructions. Depending on the job you’ll see:

- **Copy SQL** and **View SQL**: copy the database file, or read it, to run it in Supabase.
- A button to the right page, in Heliaxis or elsewhere (often just **Open**; one that opens another website has **↗**).
- **Open the guide**: a longer guide for the job.
- Numbered steps, and values with a copy button beside each.
- **Generate keys** (for phone notifications, admins only): makes three keys to paste into Vercel. They aren’t saved, so copy all three straight away. Anyone else sees a note asking an admin to do it.

Tags show the kind of job: **Question for you**, **Recommended** or **Optional**. Optional ones are tucked away: tap **+ 2 optional** (or however many there are) to see them, and **Hide optional** to put them away again.

**Check Vercel keys →** under the heading (admins only) shows which keys are set.

## Tick it off

When you’ve done it, tap the circle beside it, or **✓ I’ve done this** at the bottom of its steps. It then says **Ticked. Waiting to confirm**.

The app checks each visit, and the to-do disappears once it can see the change working. Keys added in Vercel only show up after the redeploy finishes; if one is still there after that, check the names match exactly. One-off jobs the app can’t check go as soon as they’re ticked. Tap **Untick** if you ticked one by mistake.

## Answer a question

A **Question for you** has a **Your answer** box. Type your answer and press **Send to Claude**. If the answer can’t reach Claude yet, it’s kept and the card tells you what to do. If your answer would be public, the app asks first, with **Send anyway** and **Don’t send**. If you answered in the Claude chat instead, press **✓ I’ve answered in the chat**.

## Choose who sees a to-do

> **Admins only:** At the bottom of an open to-do, under **Who sees this**:
>
> - **Admins (default)**: every admin sees it.
> - Tap people’s names to show it only to them (they can tick it off too). The to-do then says who it’s shared with, or **Only you**.
>
> To-dos passed only to other people are under **Shared with others** at the bottom of the card, where you can still tick them or change who sees them.

<!-- shot: dashboard/from-claude.jpg | From Claude: a setup to-do’s steps, tick and Who sees this | The From Claude card with a to-do open -->
