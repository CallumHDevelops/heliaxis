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

`supabase/rams.sql` is additive and re-runnable: 3 columns on `profiles` (job title, phone, signature), 12 new
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

## Heat pump paperwork (from Easy MCS, 2026-11-06)

Taken from Easy MCS's In-House and Handover tabs for a heat pump job. The Easy MCS references are listed here only so
the two can be matched; the code uses Heliaxis `HX-` codes.

**In-House pack (done in `inhouse/slots.ts`).** Heat pump jobs get: `HX-IH-16` heat pump survey record (F20),
`HX-IH-17` room survey record, only if done (F21), `HX-IH-18` ASHP noise calculation, England and Wales (F22A),
`HX-IH-19` ASHP noise calculation, Scotland (F22), `HX-IH-20` EPVS registration, only if it applies (CC3). The risk
assessment and method statement examples (F28, F29) are the project's RAMS (`HX-IH-07`, which has an ASHP template).
The noise calculation follows the site's postcode area (`nationOf`); a border postcode can be marked Not needed.
The letter of authority and structural survey are on the solar and battery list only. All the new items are uploads
until the wording of the forms is supplied.

**Handover pack: what a heat pump job still lacks.** The Handover catalogue (`handover/slots.ts`) already covers the
cover letter, workmanship warranty, completion sign-off, manufacturer information, invoice, Building Regulations,
electrical certificate, MCS certificate and warranty insurance for heat pumps. It does not have:
heat pump commissioning checklist (F26A), cylinder commissioning checklist (F26), heat pump handover certificate
(F26B), DNO application for heat pumps (F25, the G98 notice is solar and battery only), schematic diagram (CC10,
`HX-HO-13` is solar and battery only), design calculations (CC15, `HX-HO-14` is solar and battery only) and, for
ground source only, the ground loop design (F24). `HX-HP-01` is only the *electrical supply* record and says the
heat pump's own commissioning record comes from the heating engineer. These forms follow MIS 3005 and are Easy MCS's
templates; whether HAP reproduces them or has Heliaxis-worded versions is Cal's call. The customer, address, email
and MCS number on the sample files belong to a real job and are not in this repo.

## Document templates (src/lib/templates)

The heat pump forms are the first documents made from a **template**: plain data (`templates/types.ts`) that the
renderer (`documents/templates/render.ts`) draws in the document kit, in the digital and print variants. A template is
sections of fields (short text, number with a unit, yes/no/not applicable, one of a list, date, long text), passages of
text and signature lines; text and pre-filled answers can use merge fields ({{customer}}, {{address}}, {{mcs_number}}…).
The same drawing makes a blank form to print, a form with the job's details already on it, and a completed one.
`templates/rules.ts` holds the merge fields, `validateTemplate` (what must be true before a template can be saved: keys
unique and never reused, a "show when" pointing at an earlier field, merge fields that exist) and the answer rules.

`templates/seed/heat-pump.ts` has the first three, in Heliaxis's own words: `HX-HP-02` heat pump commissioning record,
`HX-HP-03` hot water cylinder commissioning record, `HX-HP-04` heat pump handover certificate. The codes and the field
lists are provisional until the owner approves them in the quality system; nothing in them claims that completing a
form meets a standard. The site app's own forms (`site/forms`) are code with rules in them and are not replaced.

Not built yet: storing templates and their versions in the database, the builder screen, and filing a made document
into a Handover or In-House slot.

## Commissioning forms in HAP, and SimpliHeat

SimpliHeat (the separate heat pump app, `CallumHDevelops/simpliheat`, a Next.js and Supabase app under `web/`) already
captures the MIS 3005-I commissioning checklist on site: 120 questions in `web/lib/commissioning/schema.ts`, filled in
offline on a tablet, with answers suggested from the design, sign-off by trade, and the record kept inside the project's
design document. It also has its own template engine (`web/lib/doctemplates`). `HX-HP-02` in HAP matches its checklist
field for field (keys, kinds, units, options, conditions; checked by loading both schemas as data).

**Decisions (Cal).** Answers can be entered in HAP as well as SimpliHeat, and what is entered in HAP feeds back to
SimpliHeat **as suggestions the on-site engineer accepts** (SimpliHeat's own rule: an answer nobody looked at is not an
answer), not written in as answers. HAP half first; SimpliHeat is changed afterwards, on a branch, with push access
asked for then.

**Why not write into SimpliHeat's design document.** Its saves use optimistic concurrency on `updated_at`; a device
that was offline gets a conflict, and the prompt's "Load their version" discards its local edits (that has lost data
before). So nothing here ever writes into the design document.

**The rules** (`src/lib/templates/forms.ts`, tested against an in-memory store):
- one record per project and form (`supabase/template-documents.sql`), each answer with who, when and from where;
- saves are made against the version read and retried if someone else saved in between;
- the first signature needs nothing left to answer and makes the form the record; the customer signs afterwards; a
  signed record is locked (signatures can be added, never changed); correcting it is a revision, in one database step;
- SimpliHeat's record is taken in: it fills what has no answer and updates its own earlier answers, but never replaces
  one entered in HAP (its different answer is kept beside it and reported as a conflict); once its technician has
  signed, what was signed is the record, and an answer only entered in HAP is dropped and listed;
- HAP's own answers go to SimpliHeat as suggestions, in its types (Yes/No as true/false), with who and when.

**The API.** SimpliHeat's server calls `GET` and `POST /api/simpliheat/v1/projects/{job ref}/forms/{code}` with
`Authorization: Bearer <SIMPLIHEAT_API_KEY>` (the same secret on both apps, 32+ characters; unset, the API answers
503 and nothing else). The job reference (HX-0042) is the link between the two apps' projects. The office's routes are
under `/api/crm/projects/{id}/forms` (session; signing and revising are admin only), with a PDF in the Heliaxis style.

**Still to do, HAP:** apply `supabase/template-documents.sql` (after approval), set `SIMPLIHEAT_API_KEY`, the fill-in
screen on the project, and filing a signed form into the Handover and In-House packs.
**Still to do, SimpliHeat (own branch, own review):** show HAP's suggestions beside each question, push its record to
HAP when it syncs, add the cylinder questions (31, `HX-HP-03`), and the handover certificate's extra questions. HAP's
cylinder record uses Yes/No/N/A; SimpliHeat's yes/no has no N/A, so those would be a select there.
Note that Next.js's bundled docs, which AGENTS.md points to, are not in this install: the routes follow the existing ones.

## Where the packs are in HAP

There are three packs, and Docs is the one place they live (there is no separate Handover tab). **Docs** has a menu down the
left: **Proposal**, **In-House**, **Handover**, **General** (every file on the job) and **+ Upload**. Choosing a pack shows its
line items on the right: a green tick when it is done, an orange warning when it is still needed, the item's code
(`HX-PP-01`) and its document number (`HX-0126-PP-01`, with `v2` once there is a second version), and Preview / Edit /
Download. Each pack has **Download ZIP**; Proposal and Handover (the packs the customer is given) have **Send to customer**.

Links: `?tab=docs&view=proposal|inhouse|handover|general`; `&form=HX-HP-02` goes straight into one form in the In-House
pack. The old `?tab=handover` and `?view=mcs` still work. The Overview has one Documents card with the three packs.

- **Proposal** (`src/lib/proposal`): line items from its catalogue. Uploads are filed with `crm_documents.proposal_slot`
  and kept off the customer's portal (`visible = false`) until the pack is released. The documents we make ourselves
  (covering letter, quotation, performance estimate, contract, complaints procedure) have no generators yet, so they show
  as still needed; Preview / Edit / Download appear when they exist.
- **In-House** (`src/lib/inhouse`): internal, never shown or sent to a customer. The heat pump forms (HX-HP-02, -03, -04)
  are its first group: Edit fills them in on screen (autosave, who/when/from where beside each answer, SimpliHeat's
  differing answer offered as "Use that"; admin signs or starts a revision). Files are filed with `crm_documents.inhouse_slot`
  (`supabase/inhouse-docs.sql`, applied).
- **Handover** (`src/lib/handover`): the screen it has always had (send, build, sign, payments), inside Docs.

API: `GET /api/crm/projects/[id]/packs`, `GET /api/crm/projects/[id]/packs/[pack]/zip` (`src/lib/zip.ts`, stored not
compressed, 80 MB at most), `forms`, `forms/[code]`, `forms/[code]/pdf` (`?download=1`).
A question that pre-fills from the job (address, customer) counts as answered, because it prints the job's value.

Not built yet: Send to customer for the Proposal pack (it waits for the documents to be made), Edit for documents we make,
the In-House generators and merged internal PDF, the RAMS screens, the template builder, the SimpliHeat-side changes.
