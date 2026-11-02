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

## The database migration (supabase/rams.sql)

`supabase/rams.sql` is additive and re-runnable: 3 columns on `profiles` (job title, phone, signature), 14 new
tables (the RAMS documents, their site details, people, certificates, trades and each trade's signature,
briefings, the queue), 4 functions, 4 triggers, 2 private storage buckets. It changes no existing data and the one
trigger on `crm_projects` only ever inserts a queue row. `supabase/rams-rollback.sql` undoes it, and refuses
(as a single statement, so nothing is dropped whatever runs it) if any RAMS table holds rows.

Tested against a throwaway local Postgres with stand-ins for the HAP tables: it applies twice cleanly, the
rollback refuses with data and works when empty, and 28 checks pass (a lead is never queued; reaching Won queues
a job once and never again; a job arriving Complete or Lost is not queued; numbering per job; a draft is edited in
place; an approved RAMS cannot be edited or deleted; status only moves along the allowed path; a revision is
version + 1 with the old one superseded; one live request per trade per version; a signature cannot be changed or
withdrawn; a briefing on an issued RAMS cannot be removed).

Behaviour to know about:

- **Deleting a job that has an approved, issued or superseded RAMS is refused by the database** (the RAMS app's
  backstop for the compliance record, kept). `src/lib/projects/delete.ts` must turn that error into a clear
  message. Draft RAMS go with the job as before.
- Trades are HAP's own subcontractors; `rams_trades` and `rams_trade_requests` point at them. Nothing is mirrored.
- Not yet in the schema (they arrive with the screens): share links, client signature requests and their audit
  tables, NTP appointments, certificate-expiry reminders.
- Jobs already at Won or later when the trigger is installed are not queued (it fires on the change). Backfilling
  those is a separate, deliberate step.

## Copying the existing RAMS data (not in this repo)

The repo is public, so the data copy is run directly against the database and is never committed: no customer
names, addresses or document contents belong here. What moves: the one live RAMS project, created in HAP as a
customer and a project (stage Complete, owner Callum), its RAMS documents with their references, approvals and
version unchanged, the crew and operative records, the company details, and the reference counter. RAMS users map
to HAP users by email. Storage files cannot be copied by SQL: the one signature image a RAMS prints must be
downloaded from the old project and uploaded to the `rams-signatures` bucket at the same path.

## Running the SQL

Apply `rams.sql` to the Heliaxis project through the Supabase connector (not a paid branch: it only adds things and
has a tested rollback), after Cal has approved it. Read-only inspection comes first and has been done on both
projects. Never apply anything to the other projects the connector can see.
