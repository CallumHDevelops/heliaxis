/**
 * The rules of a project's RAMS (risk assessment and method statement), as one pure module the RAMS
 * pages, the server actions, the auto-create worker, the trade portal and the In-House pack all read.
 * No I/O: the database and the screens call these and act on the answer.
 *
 * The life of a RAMS, as Cal described it:
 *
 *   1. It is written automatically when the job becomes a project (it reaches Won, which is when
 *      crm_projects.project_started_at is set), and only then (ramsAtCreation). An opportunity (a lead,
 *      a quote) gets none. Adding a product later doesn't write another: that is done by hand on the
 *      project's RAMS tab.
 *   2. It goes to the project's owner to review, or any admin if the owner isn't one (reviewersFor).
 *   3. Once that person signs it off it can go to the trades, and to each trade added afterwards
 *      (tradesToSend). Nothing goes to a trade before then.
 *   4. Trades review and sign. Their signatures stay with the version they signed.
 *   5. An alteration after it has been issued is a new version of the same document (revision):
 *      version 2 starts as a draft, goes round again, and the trades sign it again. Before it is
 *      issued, edits are made in place and the version does not move.
 *
 * Statuses and their rules come from the RAMS app this replaces (it kept the same ones): draft,
 * in review, approved, issued, archived. Only an admin approves or issues, and nobody signs off
 * their own document.
 */

export type RamsStatus = 'draft' | 'in_review' | 'approved' | 'issued' | 'archived';
export const STATUS_LABEL: Record<RamsStatus, string> = { draft: 'Draft', in_review: 'In review', approved: 'Approved', issued: 'Issued', archived: 'Superseded' };

/** The technologies a RAMS can be written for (the RAMS app's own list). */
export type TechnologyId = 'solar_pv' | 'battery_storage' | 'ashp' | 'led_lighting' | 'small_wind';
export const TECHNOLOGY_LABEL: Record<TechnologyId, string> = {
  solar_pv: 'Solar PV',
  battery_storage: 'Battery Energy Storage',
  ashp: 'Air Source Heat Pump',
  led_lighting: 'LED Lighting',
  small_wind: 'Small-scale Wind',
};

/**
 * A project's products (crm_projects.products) and the RAMS technology each one needs. EV chargers,
 * infrared panels and "other" have no RAMS template yet: they get none automatically, and a RAMS for
 * them is written by hand on the project.
 */
export const PRODUCT_TECHNOLOGY: Record<string, TechnologyId> = { solar: 'solar_pv', battery: 'battery_storage', heatpump: 'ashp', led: 'led_lighting' };

/** The RAMS technologies a project's products call for, once each, in the order the products are listed. */
export function technologiesFor(products: string[]): TechnologyId[] {
  const out: TechnologyId[] = [];
  for (const p of products) {
    const t = PRODUCT_TECHNOLOGY[p];
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/* ── 1. Writing it when the project is created ───────────────────────────── */

export type ToCreate = { create: TechnologyId[]; why: string | null };

/**
 * Which RAMS to write for a job that has just become a project: one per technology its products
 * call for. It is only ever asked once, when the job first reaches Won. It still checks what exists,
 * so that the worker picking the same new project up twice (a retry) never writes a second. A
 * project with no product that has a template gets none: its RAMS tab offers to write one.
 */
export function ramsAtCreation(p: { products: string[]; lost?: boolean; existing: { technology: string }[] }): ToCreate {
  if (p.lost) return { create: [], why: 'The job is lost.' };
  const wanted = technologiesFor(p.products);
  if (!wanted.length) return { create: [], why: 'No product with a RAMS template on the project when it was created, so none was written. Write one on the RAMS tab.' };
  const have = new Set(p.existing.map((d) => d.technology));
  const create = wanted.filter((t) => !have.has(t));
  return { create, why: create.length ? null : 'Already written.' };
}

/* ── 2. Moving it along ─────────────────────────────────────────────────── */

export type Actor = { id: string; role: 'member' | 'admin' };
export type Refusal = { ok: false; why: string };
export type Allowed = { ok: true };

/**
 * May this person move this document to this status? The same rules the RAMS app enforced: anyone
 * can submit a draft for review or send a document in review back to draft; only an admin approves,
 * issues or takes back a signed-off one; nobody approves their own; archived is only ever the result
 * of a revision, never a move.
 */
export function canMove(doc: { status: RamsStatus; authorId: string | null }, to: RamsStatus, who: Actor): Allowed | Refusal {
  const from = doc.status;
  if (from === to) return { ok: false, why: `It is already ${STATUS_LABEL[to].toLowerCase()}.` };
  if (from === 'archived') return { ok: false, why: 'This version has been superseded. Work on the current version.' };
  if (to === 'archived') return { ok: false, why: 'A document is only superseded by a new version of it.' };
  const admin = who.role === 'admin';
  switch (to) {
    case 'in_review':
      return from === 'draft' ? { ok: true } : { ok: false, why: 'Only a draft can be sent for review.' };
    case 'approved':
      if (from !== 'in_review') return { ok: false, why: 'Only a document in review can be signed off.' };
      if (!admin) return { ok: false, why: 'Only a project admin can sign off a RAMS.' };
      if (doc.authorId && doc.authorId === who.id) return { ok: false, why: 'You wrote it, so someone else has to sign it off.' };
      return { ok: true };
    case 'issued':
      if (from !== 'approved') return { ok: false, why: 'Only a signed-off RAMS can be issued.' };
      return admin ? { ok: true } : { ok: false, why: 'Only a project admin can issue a RAMS.' };
    case 'draft':
      if (from === 'in_review') return { ok: true };
      return admin ? { ok: true } : { ok: false, why: 'Only a project admin can take back a signed-off RAMS.' };
  }
}

/* ── 3. Who reviews it ──────────────────────────────────────────────────── */

export type Person = { id: string; name: string; role: 'member' | 'admin' };
export type Reviewers = { asked: Person[]; fallback: boolean; why: string | null };

/**
 * Who is asked to review a new RAMS: the project's owner when they are an admin; otherwise every
 * admin (the first to act signs it off). Whoever wrote it is never asked to review it. An
 * automatically written RAMS has no author, so the owner can sign off their own project's.
 */
export function reviewersFor(ownerId: string | null, people: Person[], authorId: string | null = null): Reviewers {
  const admins = people.filter((p) => p.role === 'admin' && p.id !== authorId);
  const owner = ownerId ? admins.find((p) => p.id === ownerId) : undefined;
  if (owner) return { asked: [owner], fallback: false, why: null };
  if (!admins.length) return { asked: [], fallback: true, why: 'No admin is available to review it.' };
  return { asked: admins, fallback: true, why: ownerId ? 'The project’s owner isn’t an admin, so every admin is asked.' : 'The project has no owner, so every admin is asked.' };
}

/* ── 4. Sending it to the trades ────────────────────────────────────────── */

/** One request to sign: a trade, asked to read and sign one version of one RAMS. */
export type TradeRequest = {
  tradeId: string;
  /** The RAMS document (a version has its own id). */
  docId: string;
  sentAt: string | null;
  signedAt: string | null;
  /** Withdrawn, or closed because the version was superseded. */
  revokedAt: string | null;
};
export type Trade = { id: string; name: string; /** The RAMS documents they are on (a revision carries the crew over). */ docIds: string[] };

/** Signed off: approved or issued. Only then may a trade be sent it. */
export const isSignedOff = (s: RamsStatus) => s === 'approved' || s === 'issued';

/**
 * Who to send which RAMS to now: every trade on a signed-off document who has no live request for
 * that version. Called when a document is signed off (everyone on it goes) and whenever a trade is
 * added (just them), so trades added later are picked up. A revised document is a new id, so its
 * trades are asked again; signatures on the old version stay where they are.
 */
export function tradesToSend(docs: { id: string; status: RamsStatus }[], trades: Trade[], requests: TradeRequest[]): { tradeId: string; docId: string }[] {
  const live = new Set(requests.filter((r) => !r.revokedAt).map((r) => `${r.tradeId}:${r.docId}`));
  const out: { tradeId: string; docId: string }[] = [];
  for (const d of docs) {
    if (!isSignedOff(d.status)) continue;
    for (const t of trades) if (t.docIds.includes(d.id) && !live.has(`${t.id}:${d.id}`)) out.push({ tradeId: t.id, docId: d.id });
  }
  return out;
}

/* ── 5. Revisions ───────────────────────────────────────────────────────── */

export type Revision = { ok: true; version: number; carriesOver: ('trades' | 'review_date')[]; revokes: ('share_links' | 'signature_requests')[] } | Refusal;

/**
 * An alteration to a RAMS that has been issued is a new version, not an edit: version + 1, a draft,
 * with the old one archived. Only an issued document can be revised (a draft or one in review is
 * simply edited, and the version stays put) and only by an admin. Links and signature requests on
 * the old version are closed; the trades carry over and sign the new version when it is signed off.
 */
export function revision(doc: { status: RamsStatus; version: number }, who: Actor): Revision {
  if (doc.status !== 'issued') {
    return { ok: false, why: doc.status === 'archived' ? 'This version has been superseded. Revise the current version.' : 'Only an issued RAMS is revised into a new version. Until then it can simply be edited.' };
  }
  if (who.role !== 'admin') return { ok: false, why: 'Only a project admin can revise an issued RAMS.' };
  return { ok: true, version: doc.version + 1, carriesOver: ['trades', 'review_date'], revokes: ['share_links', 'signature_requests'] };
}

/* ── What the In-House pack reads ───────────────────────────────────────── */

export type RamsSummary = {
  documents: { id: string; reference: string; title: string; status: RamsStatus; version: number; reviewer?: string | null }[];
  trades: { name: string; sent: boolean; signed: boolean }[];
};

/**
 * The project's RAMS as the In-House pack's catalogue reads it: the current version of each document
 * (superseded ones left out), and for each trade whether it has been sent, and has signed, every
 * current document it is on. A trade on a revised document shows as not sent until the new version
 * is signed off and sent, even though it signed the old one.
 */
export function summarise(docs: RamsSummary['documents'], trades: Trade[], requests: TradeRequest[]): RamsSummary {
  const current = docs.filter((d) => d.status !== 'archived');
  const ids = new Set(current.map((d) => d.id));
  const out: RamsSummary['trades'] = [];
  for (const t of trades) {
    const on = t.docIds.filter((id) => ids.has(id));
    if (!on.length) continue;
    const mine = (id: string) => requests.find((r) => r.tradeId === t.id && r.docId === id && !r.revokedAt);
    out.push({ name: t.name, sent: on.every((id) => !!mine(id)?.sentAt), signed: on.every((id) => !!mine(id)?.signedAt) });
  }
  return { documents: current, trades: out };
}
