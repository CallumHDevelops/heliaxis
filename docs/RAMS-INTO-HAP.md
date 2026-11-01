# RAMS into HAP, and the In-House pack

Working notes and decisions for bringing the RAMS app (`CallumHDevelops/RAMS`, rams.heliaxis.co.uk) into
this app permanently and building the In-House pack alongside the Proposal and Handover packs.
Branch: `claude/rams-into-hap-inhouse-pack`. Read `docs/DOCUMENT-KIT.md` and `AGENTS.md` first.

## Decisions (Cal)

- **RAMS lives in HAP.** The separate RAMS app and its Supabase project are retired. Existing RAMS,
  signatures, briefings and files are kept (merge and migrate, do not start fresh).
- **Written only when a job becomes a project.** In HAP a `crm_projects` row is an *opportunity* (lead, contacted,
  survey booked, quote sent). It becomes a *project* from stage Won onwards (`PROJECT_STAGES`,
  `src/lib/crm/stages.ts`), and the database trigger `crm_projects_start` sets `project_started_at` at that
  moment, once. The RAMS is written then, one per technology the project's products call for
  (`rams/workflow.ts`: `ramsAtCreation`), and never again for the same job. Not for opportunities, not when
  products change later. A project with no product that has a template gets none; the RAMS tab offers to write one.
  Lost jobs get none.
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

## When a job becomes a project (corrected)

An earlier version of this note listed six places a "project" is created. Those are where *opportunities* are
created (every row in `crm_projects` starts as one), and hooking them would have written a RAMS for every lead.
On 2026-11-01 the live database had 133 rows: 71 contacted, 52 lead, 3 quote sent, 3 survey booked, 2 lost and
only 2 projects (1 installing, 1 won). Every row has a `project_ref` because `customer-refs.sql` numbers each
opportunity from its customer (HX-0042, HX-0042-2); the older `crm-v3.sql` only numbered won jobs.

The six opportunity-creation points, for reference (none of them should write a RAMS):
`api/crm/projects/route.ts`, `api/crm/quotes/route.ts`, `api/crm/contacts/[id]/opportunity/route.ts`,
`lib/crm/import.ts`, `lib/crm/server.ts` (`ensureOpportunity`) and `lib/assistant/tools.ts`.

The hook is one database trigger on `crm_projects`, firing when `project_started_at` goes from null to set (and
on insert if a row is created already started, as an "already in progress" job from the Projects page is). It adds
the project to a queue table; a worker writes the RAMS from the queue. Because the field is only ever set once,
a job is never queued twice. The worker skips jobs at Complete or Lost, so importing old finished jobs does not
write RAMS for them.

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
