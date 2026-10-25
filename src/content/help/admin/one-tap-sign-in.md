---
title: Set up one-tap sign-in to RAMS and the social studio
summary: Let staff open RAMS, Our team and the Social media studio from Heliaxis already signed in, and keep the studio invite-only.
order: 220
keywords: single sign-on, SSO, RAMS sign in, social studio sign in, one-tap, sso.sql, service role key, invite-only, Allow new users to sign up, email code, confirm email
where: Dashboard › From Claude › Open RAMS without signing in again
access: admin
---
> **Admins only:** These are optional setup jobs on the **From Claude** card.

**RAMS** and the **Social media studio** are separate apps with their own accounts. One-tap sign-in lets Heliaxis open them already signed in, so staff don’t need a second password. What staff see is in [Open RAMS and the social media studio](/admin/help/getting-started/open-rams-and-social).

## Who gets in

- **RAMS** (and **Our team**, which opens RAMS): anyone with the **RAMS** or **Our team** tick on Users who also has an approved RAMS account under the same email as their Heliaxis login. Heliaxis never makes RAMS accounts. Anyone else lands on the RAMS sign-in page as before.
- **Social media studio**: anyone with the **Social media studio** tick on Users. If they don’t have a studio account yet, one is made for them the first time they open it, under their Heliaxis email. An account that’s already there is left as it is.

Before either opens signed in, each person confirms their email once with a 6-digit code. The app does this because Heliaxis sign-ups don’t check email addresses. One confirmation covers both apps.

## Set it up

1. **RAMS keys.** Open **Open RAMS without signing in again** on the From Claude card. It has you copy two values from the **RAMS** project in Supabase (not the Heliaxis one) into Vercel, then redeploy.
2. **Studio keys.** Open **Open the social studio without signing in again** and do the same with the **social studio** project.
3. **Run sso.sql.** Once either set of keys is in, a **Run sso.sql in Supabase** job appears. Run it: see [Switch a feature on (run a database file)](/admin/help/admin/run-a-database-file). Until it’s run, anyone who presses **Email me a code** sees "This isn’t switched on yet: sso.sql needs running in Supabase (it’s on the From Claude card)." They can still use the link at the bottom of that page to open the app and sign in as usual.

## Make the social studio invite-only

If anyone can still give themselves a studio account, a **Make the social studio invite-only** job appears. Someone could otherwise set up an account under a colleague’s email before they do. Its steps:

1. Tap **Open Supabase ↗** and pick the **social studio** project.
2. **Authentication › Sign In / Providers**. Turn off **Allow new users to sign up** and **Save**.

People with a studio account can still sign in. From then on, give studio access with the tick on **Users**.

> **Watch out:** Taking someone’s **Social media studio** or **RAMS** tick away, or rejecting them, only removes the buttons in Heliaxis. It doesn’t sign them out of those apps. Delete them there too: in the studio, under **Manage users**.
