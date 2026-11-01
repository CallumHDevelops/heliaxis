# RAMS into HAP, and the In-House pack

Working notes and decisions for bringing the RAMS app (`CallumHDevelops/RAMS`, rams.heliaxis.co.uk) into
this app permanently and building the In-House pack alongside the Proposal and Handover packs.
Branch: `claude/rams-into-hap-inhouse-pack`. Read `docs/DOCUMENT-KIT.md` and `AGENTS.md` first.

## Decisions (Cal)

- **RAMS lives in HAP.** The separate RAMS app and its Supabase project are retired. Existing RAMS,
  signatures, briefings and files are kept (merge and migrate, do not start fresh).
- **Written only when a project is created.** One RAMS per technology the project's products call for
  (`rams/workflow.ts`: `ramsAtCreation`). Not again when products change. A project created with no product
  that has a template gets none; the RAMS tab offers to write one. Lost jobs get none.
- **Reviewer:** the project's owner (`crm_projects.owner_id`) if they are an admin, otherwise any admin.
  Never the author. RAMS "managers" become HAP admins. HAP roles are only `member` and `admin`.
- **Sign-off, then trades.** Nothing goes to a trade until a project admin has signed the RAMS off. Then it
  goes to every trade on it, and to each trade added afterwards. Trades review and sign in the existing trade
  portal; each signature is a briefing record.
- **Versions.** Before a RAMS is issued it is edited in place and the version does not move. An alteration to
  an *issued* RAMS is the next version: a draft, the same reference, trades carried over, old links and signing
  requests closed. Signatures stay on the version that was signed; trades sign the new one once it is signed off.
- **In-House pack codes** `HX-IH-01` to `HX-IH-15` are provisional until Cal approves them in the CODE-MAP.
  The "only if needed" forms (variation, complaint, non-conformity, overstay, letter of authority) are upload
  slots until the QMS wording is supplied. Nothing is invented.
- **Git:** work on a branch, never push to `main` (every push to `main` deploys the live site).

## Where a project (a `crm_projects` row) is created: six places

1. `src/app/api/crm/projects/route.ts` (about line 100): the CRM's "New project" sheet. Owner defaults to the
   person creating it.
2. `src/app/api/crm/quotes/route.ts` (about line 45): making a quote for a customer with no open project creates
   one at stage `surveyed` with `products: []`.
3. `src/app/api/crm/contacts/[id]/opportunity/route.ts` (about line 28): opening an opportunity from a contact.
4. `src/lib/crm/import.ts` (line 159): the CRM import (past enquiries). Should not create RAMS for old imports.
5. `src/lib/crm/server.ts`, `ensureOpportunity` (about line 170): every incoming enquiry becomes a Lead. Called
   from the website quote form (`api/quote`), online survey booking (`lib/booking/book.ts`), Meta lead ads
   (`lib/whatsapp/lead-ads.ts`) and new WhatsApp numbers (`lib/whatsapp/inbox.ts`).
6. `src/lib/assistant/tools.ts` (about line 363): the assistant's tool that adds a customer and a Lead.

Hooking each of those is fragile (a seventh path would be missed). The plan is one `AFTER INSERT` trigger on
`crm_projects` that adds the new project to a queue table, and a worker that writes the RAMS from the queue. The
import (4) must be excluded, for example by the import marking its rows so the trigger skips them.

Note the consequence of "only at creation": paths 2 and 5 often create a project with no or guessed products,
so those get no RAMS, or one for the guessed technology. Cal to confirm whether that is what he wants.

## Merging the databases

RAMS has its own Supabase project with about 25 tables. Name collisions with HAP: `profiles`, `subcontractors`,
`subcontractor_document_pulls`, `cron_runs`. Plan:

- `profiles`: widen HAP's (job title, phone, signature) rather than add a second. RAMS user ids differ from HAP's
  (separate auth projects), so the migration maps RAMS users to HAP users by email and rewrites author and
  approver ids.
- `subcontractors`, `subcontractor_insurances`, `subcontractor_document_pulls`, `portal_webhook_events`: RAMS only
  mirrors HAP's trade portal. These are replaced by direct reads of HAP's own tables. The `PORTAL_API_KEY`
  server-to-server API (`src/app/api/rams/v1/*`), the webhook and the SSO hop go away.
- RAMS `projects` become links to `crm_projects`. Existing RAMS are matched through the hand-typed "RAMS project
  ID" on a project where one was entered; the rest are imported as standalone legacy projects.
- RAMS-only tables (documents, briefings, signature requests, share links and their audit tables, certifications,
  operatives, company settings, project files) come across with their guards and row-level security.
  An issued RAMS and a signed briefing are compliance records: the migration must not change a reference, a
  signature or a timestamp, and must copy the storage objects.
- Links already sent to clients (`/share/[token]`, `/sign/[token]`) must keep working after the move.

## Running the SQL

SQL files in `supabase/` are run by hand today, and code copes with a table being missing (`schemaReady()`).
Cal wants the assistant to apply them directly. That needs a Supabase connection, which a session only has if it
is set up before the session starts (a claude.ai connector, or a token saved on the environment). Safest order:
read-only inspection of both projects first; apply to a Supabase branch or dev project; production only after Cal
approves the exact SQL.
