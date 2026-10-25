---
title: What each access tick allows
summary: Every box under Portal access on the Users page, what it opens, and what being an admin adds.
order: 30
keywords: permissions, portal access, access list, roles, member, admin, what can they see, can’t see, CRM access, Enquiries access, Subcontractors access, Our team, RAMS, social, analytics, CMS, design, branding, tasks
where: Your initials (top right) › Users
path: /admin/users
access: admin
---
> **Admins only:** Only admins can change these, on the **Users** page.

Every account is a **Member** or an **Admin**. A member only gets the parts of the app ticked for them under **Portal access**. The menus, the dashboard and the phone’s bottom bar only show what each person can open. If someone follows a link to something they can’t open, the app takes them to the dashboard with "You don’t have access to that area. Ask an admin to add it to your account."

## The ticks

| Tick | What it opens |
| --- | --- |
| **Website CMS** | **CMS › Manage CMS** and **CMS › Blog**: editing heliaxis.co.uk’s pages, menus, images and blog. |
| **Brand guidelines** | The brand guidelines page (logos, colours, fonts and usage rules), from its card on the dashboard. |
| **Design studio** | **Apps › Design studio**. |
| **Tasks** | **Team › Tasks**, the shared to-do list. They can also be given tasks on a job. |
| **Enquiries** | **CRM › Enquiries**, **WhatsApp inbox**, **Smart replies & chasers** and **WhatsApp templates**. The dashboard shows them new enquiries and unread chats. (Importing older leads on Enquiries is for admins only.) |
| **CRM** | **CRM › Pipeline**, **Surveys and diary**, **CRM reports**, **CRM settings** and **Metis**; **Operations › Projects**; **Finance › Purchase orders** once switched on; and **WhatsApp chats** (only the chats linked to a job) if they don’t also have Enquiries. They can be picked to share new leads, and they get deposit-paid notifications. |
| **Social monitoring** | **Operations › Social monitoring**: comments and reviews about Heliaxis from Facebook, Instagram, Trustpilot and Google, with replies drafted for you to copy and post by hand (nothing is ever posted automatically). Everyone with this tick, and every admin, gets a notification when a comment is urgent. Only admins can approve replies to safety comments. It appears once **social-monitoring.sql** has been run. |
| **Analytics** | **CMS › Website analytics** and **Heatmap**. |
| **Subcontractors** | **Team › Subcontractors**: every subcontractor firm’s agreement, ID, bank, tax and insurance details. |
| **Our team** | **Team › Our team**, which opens Heliaxis’s own operatives in RAMS. |
| **Social media studio** | **Apps › Social media studio** (a separate app). |
| **RAMS** | **Operations › RAMS**, and **RAMS** on the phone’s bottom bar (a separate app). |

Everyone who’s approved can open the dashboard and **Get the app**, whatever is ticked. The search box on the dashboard needs **Enquiries** or **CRM**.

> **Watch out:** **Subcontractors** shows people’s ID, bank details and UTR numbers. Only tick it for people who need it.

## What an admin gets on top

Setting **Role** to **Admin** opens everything above, plus:

- The **Users** page (and the **Users & access** card on the dashboard).
- Every **From Claude** setup to-do on the dashboard (a member only sees the ones an admin has passed to them), and the **Check Vercel keys →** page. See [How setup works](/admin/help/admin/how-setup-works).
- Changing **CRM settings** and the handover pack settings. Members with CRM can read them but not change them, apart from **Saved replies** and the **Document library**, which anyone with CRM can change. See [CRM settings](/admin/help/admin/crm-settings).
- Changing the survey booking settings. See [Survey booking settings](/admin/help/surveys/booking-settings).
- On **Enquiries**: importing older leads and deleting customers. See [Import older Meta leads](/admin/help/enquiries/import-meta-leads) and [Delete a customer](/admin/help/customers/delete-customers).
- Exporting from **CRM reports**. See [Export customers and jobs](/admin/help/reports/export).

## Separate apps

**RAMS**, **Our team** and **Social media studio** open other apps. Ticking them puts the link in the person’s menu and on their dashboard. The other app still decides who gets in:

- **RAMS** and **Our team** only open signed in for someone who already has an approved RAMS account under the same email.
- For the **Social media studio**, once one-tap sign-in is set up, a studio account is made for them the first time they open it.

See [Set up one-tap sign-in to RAMS and the social studio](/admin/help/admin/one-tap-sign-in).

For what a member sees with their ticks, see [What you can see depends on your access](/admin/help/getting-started/your-access).

> **Once switched on:** Ticks per person need user-portals.sql. Until it has been run, every member gets **Website CMS** and **Enquiries** only, and the ticks can’t be changed.
