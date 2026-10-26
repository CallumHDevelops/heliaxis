---
title: Change someone’s access or stop them signing in
summary: Tick or untick what a person can open, make them an admin, or stop someone who has left from signing in.
order: 40
keywords: remove user, delete user, someone left, leaver, block, disable account, revoke access, take away access, make admin, remove admin, change role, change permissions
where: Your initials (top right) › Users
path: /admin/users
access: admin
---
> **Admins only:** All of this is on the **Users** page.

## Change what someone can open

1. Click your initials at the top right › **Users**.
2. Find the person. Type in **Search name or email…** if the list is long.
3. Tick or untick the boxes under **Portal access**. See [What each access tick allows](/admin/help/admin/access-ticks).
4. Press **Save**. "Saved" appears.

The change applies the next time they open a page. Their menus then show only what’s ticked.

## Make someone an admin

1. Set their **Role** to **Admin**.
2. Press **Save**.

Admins can open everything, so the ticks grey out. To take it away again, set **Role** back to **Member**, tick what they should keep, and press **Save**.

## When someone leaves

There’s no delete button. Instead, stop them signing in:

1. Set their **Status** to **Rejected**.
2. Press **Save**.

The next time they open any page in Heliaxis, they’re sent to the **Awaiting approval** page instead. Everything they did (notes, tasks, messages) stays as it was. Nothing is handed over by itself: jobs they own and open tasks given to them stay with them, so give those to someone else. To let them back in, set **Status** to **Approved** and press **Save**.

> **Good to know:** If they took new leads in turn, the app stops giving them any once they’re rejected or lose the **CRM** tick, and shares new leads between the others. If they come back, they take turns again by themselves. See [Choose who gets new leads](/admin/help/admin/new-leads).

> **Watch out:** **RAMS** and the **Social media studio** are separate apps with their own accounts. Rejecting someone here, or unticking those boxes, only removes the buttons. They can still sign in to those apps directly, so also remove them there: in the studio, use **Manage users**.

## You can’t change your own account

Your own **Status** and **Role** are greyed out, so you can’t lock yourself out by mistake. Ask another admin if yours needs changing.

If the page says "The portals column is missing — run supabase/user-portals.sql in Supabase first.", see [Switch a feature on (run a database file)](/admin/help/admin/run-a-database-file).
