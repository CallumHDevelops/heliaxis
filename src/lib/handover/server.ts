import 'server-only';
import { addWorkingDays, ukBankHolidays, ukDay } from '@/lib/bank-holidays';
import { CRM_BUCKET, DOCS_BUCKET, ensureDocsBucket, ensurePortalToken, logActivity, portalUrl, safeName } from '@/lib/crm/server';
import { moveStage } from '@/lib/crm/move-stage';
import { addDays, shortDay } from '@/lib/projects/deadlines';
import { docFileName } from '@/lib/documents/pdf-kit';
import { inputsHash, saveGenerated, type Reprint, type StoredRef } from '@/lib/documents/store';
import { makeReceipt, RECEIPT_TITLE } from '@/lib/documents/handover/cc13-receipt';
import { CC4_TITLE, makeSwitchOff } from '@/lib/documents/handover/cc4';
import type { Loader } from '@/lib/documents/handover/common';
import { COVER_TITLE, makeCoverLetter } from '@/lib/documents/handover/cover-letter';
import { F16E_TITLE, makeCompletion } from '@/lib/documents/handover/f16e';
import { F19I_TITLE, makeWarranty } from '@/lib/documents/handover/f19i';
import { F47_TITLE, makeG98Sheet } from '@/lib/documents/handover/f47';
import { F48I_TITLE, makeShading } from '@/lib/documents/handover/f48i';
import { F49_TITLE, makeSchedule } from '@/lib/documents/handover/f49';
import { F49A_TITLE, makeAgreement } from '@/lib/documents/handover/f49a';
import { F76_SHEET_TITLE, makeG99Sheet } from '@/lib/documents/handover/f76-sheet';
import { F78_TITLE, makeF78 } from '@/lib/documents/handover/f78';
import { buildPack, packChanges, type PackEntry, type PackPart } from '@/lib/documents/handover/pack';
import { msConfigured, sendMail } from '@/lib/ms365';
import { notify } from '@/lib/notify';
import { schemaReady } from '@/lib/schema-ready';
import { sendAfter, sendTimeWords } from '@/lib/site/messages';
import type { Db } from '@/lib/site/server';
import { emailShell, sendEmail } from '@/lib/subcontractors/server';
import { addSourceTask } from '@/lib/surveys/server';
import { sendSystem } from '@/lib/whatsapp/inbox';
import { getSettings as getWaSettings } from '@/lib/whatsapp/settings';
import { libraryGaps, loadHandover, slotDocs, type DocRow, type Loaded, type PackRow } from './facts';
import {
  AGREEMENT_FIELDS,
  agreementInput,
  buildingControlFields,
  completionInput,
  coverInput,
  f78Input,
  g98Input,
  g99Input,
  installedLines,
  longDay,
  midFields,
  modelsOf,
  receiptInput,
  scheduleInput,
  shadingInput,
  SWITCH_FIELDS,
  switchInput,
  warrantyInput,
  type CopyField,
  type HandoverFacts,
  type Made,
  type Payment,
  type SlotData,
} from './inputs';
import { approved, type DraftKey } from './settings-shared';
import { customerState, headline, sendCheck, slotDef, slotStates, type GenNeed, type Headline, type SlotCode, type SlotView } from './slots';
import { ensureHandoverTasks } from './tasks';

/**
 * The handover pack on the server (SPEC 4.2–4.10): what each item's state is on a job, making the
 * pack's own documents as their data lands (and only when it changed), the product library's files
 * attached by model, the combined PDF, sending it to the customer (released into their portal, the
 * message held by the evening rule, the job moved on, the final invoice next), recorded payments and
 * the customer's own signatures from their portal.
 */

export const HANDOVER_NOT_READY = 'Run handover.sql from your to-do list';
export const handoverReady = async () => (await schemaReady()).handover;

/* ── The pack's own generators ───────────────────────────────────────────── */

type Gen = {
  key: string;
  /** The pack item it fills (null: an office helper, kept out of the pack). */
  slot: SlotCode | null;
  label: string;
  title: string;
  category: string;
  input: (f: HandoverFacts, views: SlotView[]) => Made<unknown>;
  make: (input: never, load: Loader) => Promise<Uint8Array>;
  /** Kept current even after the customer has it: references arriving, payments recorded. */
  live?: boolean;
};

const GENS: Gen[] = [
  { key: 'F78', slot: 'F78', label: 'F78', title: F78_TITLE, category: 'handover', input: (f) => f78Input(f), make: makeF78 as Gen['make'] },
  { key: 'F19I', slot: 'F19I', label: 'F19I', title: F19I_TITLE, category: 'warranty', input: (f) => warrantyInput(f), make: makeWarranty as Gen['make'], live: true },
  { key: 'F16E', slot: 'F16E', label: 'F16E', title: F16E_TITLE, category: 'handover', input: (f) => completionInput(f), make: makeCompletion as Gen['make'] },
  { key: 'CC4', slot: 'CC4', label: 'CC4', title: CC4_TITLE, category: 'handover', input: (f) => switchInput(f), make: makeSwitchOff as Gen['make'] },
  { key: 'F48I', slot: 'F48I', label: 'F48I', title: F48I_TITLE, category: 'handover', input: (f) => shadingInput(f), make: makeShading as Gen['make'] },
  { key: 'F49', slot: 'F49', label: 'F49', title: F49_TITLE, category: 'handover', input: (f) => scheduleInput(f), make: makeSchedule as Gen['make'] },
  { key: 'F49A', slot: 'F49A', label: 'F49A', title: F49A_TITLE, category: 'handover', input: (f) => agreementInput(f), make: makeAgreement as Gen['make'] },
  // The G98 and G99 data sheets: office helpers for the DNO's forms (F47, F76), never in the pack.
  { key: 'F47', slot: null, label: 'F47', title: F47_TITLE, category: 'dno', input: (f) => g98Input(f), make: makeG98Sheet as Gen['make'] },
  { key: 'F76_SHEET', slot: null, label: 'F76', title: F76_SHEET_TITLE, category: 'dno', input: (f) => g99Input(f), make: makeG99Sheet as Gen['make'] },
  { key: 'CC13_RECEIPT', slot: 'CC13', label: 'CC13', title: RECEIPT_TITLE, category: 'receipt', input: (f) => receiptInput(f), make: makeReceipt as Gen['make'], live: true },
  // Last: its contents list is every other item's state.
  { key: 'F07BI', slot: 'F07BI', label: 'F07BI', title: COVER_TITLE, category: 'handover', input: (f, v) => coverInput(f, v), make: makeCoverLetter as Gen['make'], live: true },
];

/** Does a generator apply to this job? (The catalogue's applies for its item; the data sheets on their DNO route.) */
function genApplies(g: Gen, l: Loaded, views: SlotView[]): boolean {
  const pvOrBattery = l.facts.job.products.some((x) => x === 'solar' || x === 'battery');
  if (g.key === 'F76_SHEET') return l.facts.job.dno.route === 'g99' && pvOrBattery;
  if (g.key === 'F47') return l.facts.job.dno.route === 'g98' && pvOrBattery && !views.find((x) => x.code === 'F47')?.office?.na;
  const v = views.find((x) => x.code === g.slot);
  return !!v && !(v.state === 'na' && !v.office) && !v.office?.na;
}

/**
 * What a document's inputs hash is taken over: everything it's made from except the day it's made
 * (`issued`), so it's made again only when its data changes, not every morning. The PDF itself is
 * still dated the day it's made (g.make gets the whole input), and its print version the same day.
 */
const hashed = (g: Gen, input: unknown) => ({ key: g.key, input: { ...(input as object), issued: undefined } });
const hashOf = (g: Gen, input: unknown) => inputsHash(hashed(g, input));

/** The states, with each generator's need (its inputs hashed, or what it's missing). */
export function statesOf(l: Loaded): { views: SlotView[]; made: Map<string, Made<unknown>> } {
  const made = new Map<string, Made<unknown>>();
  const gen: Partial<Record<SlotCode, GenNeed>> = {};
  const need = (g: Gen, m: Made<unknown>): GenNeed => (m.ok ? { ready: true, hash: hashOf(g, m.input) } : { ready: false, state: m.state, why: m.why, fix: m.fix, due: m.due ?? null });
  for (const g of GENS) {
    if (g.key === 'F07BI') continue;
    const m = g.input(l.facts, []);
    made.set(g.key, m);
    if (g.slot && g.slot !== 'CC13') gen[g.slot] = need(g, m);
  }
  const ctx = stateCtx(l, gen);
  const first = slotStates(ctx);
  const cover = GENS.find((g) => g.key === 'F07BI')!;
  const m = cover.input(l.facts, first);
  made.set('F07BI', m);
  gen.F07BI = need(cover, m);
  return { views: slotStates({ ...ctx, gen }), made };
}

function stateCtx(l: Loaded, gen: Partial<Record<SlotCode, GenNeed>>) {
  const f = l.facts;
  const docs = slotDocs(l).filter((d) => !(d.slot === 'CC4' && d.source === 'library'));
  return {
    products: f.job.products,
    dnoRoute: f.job.dno.route,
    pas63100: f.design.pas63100,
    maintenancePlan: f.design.maintenance_plan,
    docs,
    marks: Object.fromEntries([...l.slots].map(([k, s]) => [k, { na: s.na, reason: s.na_reason, by: s.updated_by ? (l.people.get(s.updated_by) ?? null) : null, at: s.updated_at }])),
    gen,
    electrician: l.electrician,
    electricianName: f.electrician?.name ?? null,
    partPBy: f.electrician?.partPBy ?? null,
    certWaits: f.electrician?.certWaits ?? null,
    commissioned: f.job.commissionedOn,
    paperwork: f.paperwork,
    dnoSubmitted: !!f.job.dno.submittedAt,
    dnoNotified: f.job.dno.notified,
    due: l.due,
    invoicePaid: l.invoicePaid,
    libraryGaps: libraryGapsOf(l),
    models: modelsOf(f),
    designDoc: l.docs.some((d) => d.category === 'design' && !d.archived_at && !d.handover_slot),
    sent: !!l.pack?.sent_at,
  };
}

/** Models on the job with no manual or datasheet in the library (CC5's gaps). */
const libraryGapsOf = (l: Loaded) => libraryGaps(l.libraryAll, modelsOf(l.facts));

/* ── Reading and storing files ───────────────────────────────────────────── */

const loaderFor =
  (db: Db): Loader =>
  async (bucket, path) => {
    const { data } = await db.storage.from(bucket === 'docs' ? DOCS_BUCKET : CRM_BUCKET).download(path);
    return data ? new Uint8Array(await data.arrayBuffer()) : null;
  };

/** The library's files for this job (CC4 procedures, CC5 manuals and datasheets, guides for every pack), copied into its folder once. */
async function attachLibrary(db: Db, l: Loaded, by: string | null): Promise<number> {
  const sent = !!l.pack?.sent_at;
  let n = 0;
  for (const item of l.facts.library) {
    const key = `LIB-${item.id}`;
    // Once on the job (even archived by the office) it isn't added again.
    if (l.docs.some((d) => d.generated_key === key)) continue;
    const slot = item.slot === 'CC4' || item.slot === 'CC5' || item.slot === 'CCMH' ? item.slot : item.kind === 'procedure' ? 'CC4' : item.kind === 'guide' ? 'CCMH' : 'CC5';
    const from = item.compact_path || item.storage_path;
    const ext = from.split('.').pop() || 'pdf';
    const to = `projects/${l.facts.job.id}/handover/lib-${item.id}-${safeName(item.name)}.${ext}`;
    await ensureDocsBucket();
    const copied = await db.storage.from(DOCS_BUCKET).copy(from, to);
    if (copied.error && !/exists/i.test(copied.error.message)) continue;
    const { error } = await db.from('crm_documents').insert({
      project_id: l.facts.job.id,
      category: 'handover',
      name: item.name,
      storage_path: to,
      mime: item.mime,
      size: item.size,
      visible: sent,
      uploaded_by: by,
      source: 'library',
      generated_key: key,
      version: 1,
      handover_slot: slot,
      release: sent ? 'now' : 'with_pack',
    });
    if (!error) n++;
  }
  return n;
}

export type RefreshResult = { made: string[]; stale: string[]; attached: number; released: number; rebuilt: boolean; archived: number };

/** A generator's current (not archived) document on the job, the newest version. */
const currentOf = (l: Loaded, key: string) => l.docs.filter((d) => d.generated_key === key && !d.archived_at).sort((a, b) => Number(b.version) - Number(a.version))[0];

/**
 * Make what can be made now (SPEC 2.13 item 6, 4.5): each of the pack's own documents whose inputs
 * changed, as a new version (saveGenerated keeps the old one, archived). One the customer already
 * has is left alone and shows Out of date, unless the office pressed Regenerate (`force`) or it's
 * one that should follow its data (the cover letter, warranty and receipt). One made for an item that
 * has stopped applying since (marked Not needed, the DNO route changed) is archived before the
 * customer has it, so it never goes out with the pack. Then the library's files, and once the pack
 * has gone, anything new is released straight into the portal and the combined PDF rebuilt.
 */
export async function refreshHandover(db: Db, projectId: string, opts: { by?: string | null; force?: string[]; rebuild?: boolean } = {}): Promise<RefreshResult> {
  const out: RefreshResult = { made: [], stale: [], attached: 0, released: 0, rebuilt: false, archived: 0 };
  let l = await loadHandover(db, projectId);
  if (!l) return out;
  out.attached = await attachLibrary(db, l, opts.by ?? null);
  if (out.attached) l = (await loadHandover(db, projectId))!;
  const load = loaderFor(db);
  const sent = !!l.pack?.sent_at;
  const make = async (g: Gen, at: Loaded) => {
    const { views, made } = statesOf(at);
    const m = made.get(g.key);
    const cur = currentOf(at, g.key);
    const applies = genApplies(g, at, views);
    if (g.slot && cur && !cur.visible && !applies) {
      // It stopped applying before the customer had it: out of the pack (kept, archived). Needed after all: made again.
      await db.from('crm_documents').update({ archived_at: new Date().toISOString(), archived_by: opts.by ?? null }).eq('id', cur.id);
      out.archived++;
      return;
    }
    if (!m?.ok || !applies) return;
    const hash = hashOf(g, m.input);
    if (cur?.inputs_hash === hash) return;
    const force = !!opts.force?.includes(g.key) || !!(g.slot && opts.force?.includes(g.slot)) || !!g.live;
    if (cur?.visible && !force) {
      out.stale.push(g.key);
      return;
    }
    const bytes = await g.make(m.input as never, load);
    const r = await saveGenerated(db, projectId, {
      key: g.key,
      name: docFileName(at.facts.job.ref, g.label, g.title),
      bytes,
      inputs: hashed(g, m.input),
      category: g.category,
      slot: g.slot,
      release: g.slot ? 'with_pack' : 'now',
      visible: sent && !!g.slot,
      force,
      by: opts.by ?? null,
    });
    if (r.status === 'saved') out.made.push(g.key);
  };
  for (const g of GENS) if (g.key !== 'F07BI') await make(g, l);
  // The cover letter lists every other item's state, so it's made from what's there now.
  if (out.made.length || out.archived) l = (await loadHandover(db, projectId))!;
  await make(GENS.find((g) => g.key === 'F07BI')!, l);
  if (sent) {
    // After the pack has gone, anything new for it goes straight into the portal.
    const { data } = await db
      .from('crm_documents')
      .update({ visible: true, release: 'now' })
      .eq('project_id', projectId)
      .eq('release', 'with_pack')
      .not('handover_slot', 'is', null)
      .is('archived_at', null)
      .select('id');
    out.released = data?.length ?? 0;
  }
  if (out.made.length || out.attached || out.released || out.archived) l = (await loadHandover(db, projectId))!;
  if ((sent || opts.rebuild) && l.pack?.version && packKey(l) !== currentPack(l)?.inputs_hash) {
    await buildHandover(db, projectId, { by: opts.by ?? null, auto: true });
    out.rebuilt = true;
    l = (await loadHandover(db, projectId))!;
  }
  await ensureHandoverTasks(db, l, statesOf(l).views);
  return out;
}

/* ── The Handover tab ────────────────────────────────────────────────────── */

export type ViewDoc = SlotView['docs'][number];
export type HandoverView = {
  slots: SlotView[];
  headline: Headline;
  send: { ok: boolean; blocking: { code: string; title: string; why: string | null }[]; following: { code: string; title: string }[] };
  pack: {
    version: number;
    built_at: string | null;
    sent_at: string | null;
    sent_via: string[];
    document_id: string | null;
    size: number | null;
    pages: number | null;
    separate: { slot: string; title: string; why: string }[];
    queued: { at: string; words: string } | null;
    /** The pack would be different if built now (new or changed documents since). */
    behind: boolean;
  } | null;
  /** "Target: Wed 4 Nov (the morning after switching on) · MCS Customer Duty: by Thu 3 Dec". */
  target: string;
  copy: { mid: CopyField[]; bc: CopyField[] };
  /** Values the office types per item, with what's there now. */
  forms: {
    F49A: { key: string; label: string; hint?: string; value: string }[];
    CC4: { key: string; label: string; hint: string; value: string; from?: string | null }[];
    F78: { key: string; label: string; value: string }[];
    F47: { key: string; label: string; value: string }[];
    F16E: { text: string; by: string | null }[];
  };
  f78Design: { name: string; signed_at: string } | null;
  /** Unresolved site flags, to copy onto F16E as still to put right. */
  flags: { text: string; trade: string }[];
  customer: { first: string; email: boolean; mobile: boolean; portal: string | null };
  payments: (Payment & { recorded_by?: string | null })[];
  deposit: { amount: number | null; paidAt: string | null };
  /** "Job £8,500 · deposit paid £500 · balance £8,000" only when both are recorded. */
  money: string | null;
  library: { id: string; name: string; kind: string | null; models: string[]; slot: string | null }[];
  gaps: string[];
  models: string[];
  designDocs: { id: string; name: string }[];
  /** The office's data sheets for the DNO's forms (not in the pack). */
  helpers: { f76Sheet: string | null; f47Sheet: string | null };
  invoice: { prompted: boolean; uploaded: boolean; paid: boolean };
  approvals: Record<DraftKey, boolean>;
  /** When a message sent now would go ("now", or "07:00"). */
  sendsAt: string;
  prep: { label: string; done: boolean }[];
  stage: string;
  /** Something can be made, attached, released or rebuilt now: the tab asks for a refresh. */
  dirty: boolean;
  /** "Tell the customer" ticked by default on uploads (CRM settings). */
  tellDefault: boolean;
};

const SEPARATE_WORDS: Record<string, string> = {
  signed: 'Digitally signed: kept as it is',
  protected: 'Password-protected',
  damaged: 'Couldn’t be opened to merge',
  not_pdf: 'Word, Excel or a photo type that can’t be merged',
  size: 'Too big to merge (the pack stays under 20 MB)',
  missing: 'The file couldn’t be read',
};

const currentPack = (l: Loaded) => l.docs.find((d) => d.generated_key === 'PACK' && !d.archived_at) ?? null;
/** What the combined PDF is made from: every current pack document and its version. */
const packKey = (l: Loaded) =>
  inputsHash(
    slotDocs(l)
      .map((d) => `${d.id}:${d.version}`)
      .sort()
  );

export async function handoverView(db: Db, projectId: string): Promise<HandoverView | null> {
  const l = await loadHandover(db, projectId);
  if (!l) return null;
  const { views, made } = statesOf(l);
  const f = l.facts;
  const check = sendCheck(views);
  const pack = currentPack(l);
  const contents = (Array.isArray(l.pack?.contents) ? l.pack!.contents : []) as PackEntry[];
  const wa = await getWaSettings();
  const at = sendAfter(new Date(), wa);
  const hols = await ukBankHolidays();
  const commissioned = f.job.commissionedOn;
  const { data: flagRows } = await db.from('site_assignments').select('trade, flags').eq('project_id', projectId).neq('status', 'cancelled');
  const flags = ((flagRows ?? []) as { trade: string; flags: { text: string; resolved_at?: string | null }[] | null }[]).flatMap((a) => (a.flags ?? []).filter((x) => !x.resolved_at).map((x) => ({ text: x.text, trade: a.trade })));
  const value = Number(l.project.value) || 0;
  const dep = f.job.deposit;
  const v = (slot: SlotCode, k: string) => f.data[slot]?.values?.[k] ?? '';
  const dcSite = Array.isArray(f.electrician?.values.f43_iso_loc) ? String((f.electrician!.values.f43_iso_loc as unknown[])[0] ?? '') : '';
  const portalToken = (l.project.portal_token as string | null) ?? null;
  const queued = (Array.isArray(l.pack?.queued) ? l.pack.queued : []).map((q) => q.at).filter(Boolean).sort()[0];
  return {
    slots: views,
    headline: headline(views),
    send: { ok: check.ok, blocking: check.blocking.map((x) => ({ code: x.code, title: x.title, why: x.why })), following: check.following.map((x) => ({ code: x.code, title: x.title })) },
    pack: l.pack
      ? {
          version: l.pack.version,
          built_at: l.pack.built_at,
          sent_at: l.pack.sent_at,
          sent_via: l.pack.sent_via ?? [],
          document_id: pack?.id ?? null,
          size: pack?.size ?? null,
          pages: contents.reduce((n, c) => Math.max(n, (c.first_page ?? 0) + (c.pages ?? 0) - 1), 0) || null,
          separate: contents.filter((c) => c.separate).map((c) => ({ slot: c.slot, title: c.title, why: SEPARATE_WORDS[c.separate!] ?? 'Separate file' })),
          queued: queued ? { at: queued, words: sendTimeWords(queued) } : null,
          behind: !!pack && packKey(l) !== pack.inputs_hash,
        }
      : null,
    target: commissioned
      ? `Target: ${shortDay(addWorkingDays(commissioned, 1, hols))}, the morning after switching on · MCS Customer Duty: within 30 days, by ${shortDay(addDays(commissioned, 30))}`
      : 'Target: the morning after the electrician signs off · MCS Customer Duty: within 30 days of completion',
    copy: { mid: midFields(f), bc: buildingControlFields(f) },
    forms: {
      F49A: AGREEMENT_FIELDS.map((x) => ({ ...x, value: v('F49A', x.key) })),
      CC4: SWITCH_FIELDS.filter((x) => !x.for || f.job.products.includes(x.for)).map((x) => ({ key: x.key, label: x.label, hint: x.hint, value: v('CC4', x.key), from: x.key === 'dc' && dcSite ? dcSite : null })),
      F78: [
        { key: 'kind', label: 'Initial or periodic verification (initial / periodic)', value: v('F78', 'kind') },
        { key: 'cert_ref', label: 'Electrical certificate number', value: v('F78', 'cert_ref') },
        { key: 'p_loc', label: 'PV location (roof faces)', value: v('F78', 'p_loc') },
        { key: 'p_desc', label: 'PV description (leave empty to use the job’s products)', value: v('F78', 'p_desc') },
        { key: 'e_desc', label: 'Battery description (leave empty to use the job’s products)', value: v('F78', 'e_desc') },
        { key: 'circuits', label: 'Circuits tested', value: v('F78', 'circuits') },
        { key: 'comments', label: 'Comments', value: v('F78', 'comments') },
      ],
      F47: [{ key: 'isolator', label: 'Lockable isolation switch: where it is', value: v('F47', 'isolator') }],
      F16E: f.data.F16E?.outstanding ?? [],
    },
    f78Design: f.data.F78?.design ? { name: f.data.F78.design.name, signed_at: f.data.F78.design.signed_at } : null,
    flags,
    customer: {
      first: f.customer.first,
      email: !!f.customer.email,
      mobile: !!f.customer.phone,
      portal: portalToken ? portalUrl(portalToken) : null,
    },
    payments: f.payments,
    deposit: { amount: dep.amount, paidAt: dep.paidAt },
    money:
      value > 0 && dep.amount && dep.paidAt
        ? `Job £${value.toLocaleString('en-GB', { minimumFractionDigits: 2 })} · deposit paid £${dep.amount.toLocaleString('en-GB', { minimumFractionDigits: 2 })} · balance £${(value - dep.amount).toLocaleString('en-GB', { minimumFractionDigits: 2 })} (from the job’s recorded value)`
        : null,
    library: f.library.map((x) => ({ id: x.id, name: x.name, kind: x.kind, models: x.models, slot: x.slot })),
    gaps: libraryGapsOf(l),
    models: modelsOf(f),
    designDocs: l.docs.filter((d) => d.category === 'design' && !d.archived_at && !d.handover_slot).map((d) => ({ id: d.id, name: d.name })),
    helpers: { f76Sheet: l.docs.find((d) => d.generated_key === 'F76_SHEET' && !d.archived_at)?.id ?? null, f47Sheet: l.docs.find((d) => d.generated_key === 'F47' && !d.archived_at)?.id ?? null },
    invoice: { prompted: !!l.pack?.invoice_prompted_at, uploaded: l.docs.some((d) => d.handover_slot === 'CC13' && !d.archived_at && d.generated_key !== 'CC13_RECEIPT'), paid: l.invoicePaid },
    approvals: { cover: approved(f.settings, 'cover'), completion: approved(f.settings, 'completion'), shutdown: approved(f.settings, 'shutdown') },
    sendsAt: at.getTime() <= Date.now() + 60_000 ? 'now' : sendTimeWords(at),
    prep: prepList(l, views),
    stage: f.job.stage,
    dirty: isDirty(l, views, made),
    tellDefault: f.settings.tellOnUpload,
  };
}

/** Would a refresh change anything? (A document to make, a library file to attach, something to release, the pack to rebuild.) */
function isDirty(l: Loaded, views: SlotView[], made: Map<string, Made<unknown>>): boolean {
  const sent = !!l.pack?.sent_at;
  const pack = currentPack(l);
  const behindGen = GENS.some((g) => {
    const m = made.get(g.key);
    const cur = currentOf(l, g.key);
    const applies = genApplies(g, l, views);
    // Made for an item that has stopped applying, not with the customer yet: to archive.
    if (g.slot && cur && !cur.visible && !applies) return true;
    if (!m?.ok || !applies) return false;
    return cur?.inputs_hash !== hashOf(g, m.input) && (!cur?.visible || !!g.live);
  });
  return (
    behindGen ||
    l.facts.library.some((item) => !l.docs.some((d) => d.generated_key === `LIB-${item.id}`)) ||
    (sent && !!pack && packKey(l) !== pack.inputs_hash) ||
    (sent && l.docs.some((d) => d.release === 'with_pack' && d.handover_slot && !d.archived_at && !d.visible))
  );
}
/** Handover prep at Ready (SPEC 4.11, HANDOVER 2.9): what can be done before the install day. */
function prepList(l: Loaded, views: SlotView[]): { label: string; done: boolean }[] {
  const f = l.facts;
  const by = (c: SlotCode) => views.find((v) => v.code === c);
  const ok = (c: SlotCode) => {
    const v = by(c);
    return !v || v.hidden || v.state === 'complete' || v.state === 'na';
  };
  const solar = f.job.products.includes('solar');
  const battery = f.job.products.includes('battery');
  const figures = [solar && f.design.est_kwh_year === null, solar && f.design.shade_factor === null, solar && !f.system.kwp, battery && f.design.eess_class === null, battery && f.design.battery_kw === null].some(Boolean);
  const out = [
    { label: 'Design figures on the job (estimate, shade factor, system class, battery power)', done: !figures },
    { label: 'F48I made and F49 drafted', done: ok('F48I') && l.docs.some((d) => d.generated_key === 'F49' && !d.archived_at) },
    { label: 'Manuals and datasheets in the library for every product', done: !libraryGapsOf(l).length && modelsOf(f).length > 0 },
    { label: 'Schematic and design calculations uploaded', done: ok('CC10') && ok('CC15') },
  ];
  if (f.job.dno.route === 'g99') out.push({ label: 'G99 paperwork uploaded', done: ok('F76') });
  out.push({ label: 'Warranty and cover letter drafted', done: ['F19I', 'F07BI'].every((k) => l.docs.some((d) => d.handover_slot === k && !d.archived_at)) });
  if (f.design.maintenance_plan) out.push({ label: 'Maintenance agreement made', done: ok('F49A') });
  return out;
}

/** The Overview card (D13): the headline and the one next step. */
export async function handoverSummary(db: Db, projectId: string): Promise<{ words: string; next: string; complete: number; total: number; sent: boolean } | null> {
  const l = await loadHandover(db, projectId);
  if (!l) return null;
  const { views } = statesOf(l);
  const h = headline(views);
  const check = sendCheck(views);
  const sent = !!l.pack?.sent_at;
  const cc13 = views.find((v) => v.code === 'CC13');
  const prep = prepList(l, views);
  const early = !sent && ['won', 'design', 'ready', 'install_booked'].includes(l.facts.job.stage);
  const next = early
    ? `Before the install day: ${prep.filter((x) => x.done).length} of ${prep.length} ready`
    : sent
    ? cc13 && cc13.state !== 'complete' && cc13.state !== 'na'
      ? 'Send the final invoice'
      : check.following.length
        ? `${check.following.length} on ${check.following.length === 1 ? 'its' : 'their'} way to the customer`
        : 'All in the customer’s portal'
    : check.ok
      ? 'Send the pack to the customer'
      : `Waiting on ${check.blocking[0].title}`;
  return { words: h.words, next, complete: h.complete, total: h.total, sent };
}

/* ── Build ───────────────────────────────────────────────────────────────── */

/** What changed since the last pack ("Adds your MCS certificate"). */
function changesSince(prev: PackEntry[], now: { slot: string; title: string }[]): string[] {
  const had = new Set<string>(prev.filter((p) => !p.separate || p.separate === 'signed').map((p) => p.slot));
  const added = [...new Set(now.filter((n) => !had.has(n.slot)).map((n) => n.title))];
  return added.map((t) => `Adds your ${t.replace(/^(the|your) /i, '')}`);
}

/**
 * Build the combined PDF (SPEC 4.7): stale unsent documents made first, then the cover letter, the
 * contents and every document in customer order. Stored as the next version (PACK, with_pack), the
 * previous one archived. `auto`: rebuilt by itself after a send, when a document was added.
 */
export async function buildHandover(db: Db, projectId: string, opts: { by: string | null; auto?: boolean }): Promise<{ version: number; pages: number; separate: number }> {
  if (!opts.auto) await refreshHandover(db, projectId, { by: opts.by });
  const l = await loadHandover(db, projectId);
  if (!l) throw new Error('Not found');
  const load = loaderFor(db);
  const { parts, coverRow, follow, system } = await packSources(db, l);
  const cover = coverRow ? await load('docs', coverRow.storage_path) : null;
  const f = l.facts;
  const version = (l.pack?.version ?? 0) + 1;
  const prev = (Array.isArray(l.pack?.contents) ? l.pack!.contents : []) as PackEntry[];
  const built = await buildPack({
    ref: f.job.ref,
    issued: f.today,
    customer: f.customer.name,
    address: f.job.addressLines,
    version,
    changes: version > 1 ? changesSince(prev, parts.map((p) => ({ slot: p.slot, title: p.title }))) : [],
    system,
    cover,
    parts,
    follow,
    deadline: Date.now() + 40_000,
  });

  await ensureDocsBucket();
  const path = `projects/${projectId}/handover/pack-v${version}.pdf`;
  const up = await db.storage.from(DOCS_BUCKET).upload(path, built.bytes, { contentType: 'application/pdf', upsert: true });
  if (up.error) throw new Error(`Couldn’t store the pack: ${up.error.message}`);
  const old = currentPack(l);
  const sent = !!l.pack?.sent_at;
  const { data: row, error } = await db
    .from('crm_documents')
    .insert({
      project_id: projectId,
      category: 'handover',
      name: docFileName(f.job.ref, '', `Handover pack${version > 1 ? ` v${version}` : ''}`),
      storage_path: path,
      mime: 'application/pdf',
      size: built.bytes.length,
      visible: sent,
      uploaded_by: opts.by,
      source: 'generated',
      generated_key: 'PACK',
      version,
      inputs_hash: packKey(l),
      handover_slot: 'PACK',
      release: sent ? 'now' : 'with_pack',
    })
    .select('id')
    .single();
  if (error || !row) throw new Error(`Couldn’t save the pack: ${error?.message ?? 'no row'}`);
  if (old) await db.from('crm_documents').update({ archived_at: new Date().toISOString(), archived_by: opts.by, visible: false }).eq('id', old.id);
  const pack = { project_id: projectId, version, document_id: row.id, contents: built.contents, built_at: new Date().toISOString(), built_by: opts.by };
  await db.from('handover_packs').upsert(pack, { onConflict: 'project_id' });
  if (opts.auto) await logActivity({ enquiryId: String(l.project.enquiry_id), projectId, kind: 'system', body: `Handover pack rebuilt (version ${version}): a new document went in`, byId: opts.by }).catch(() => null);
  return { version, pages: built.pages, separate: built.contents.filter((c) => c.separate).length };
}

/**
 * What the combined PDF is built from now: every pack document in customer order (with its file), the
 * cover letter's row, what's still to follow (the contents says so) and the "Your system" box.
 */
async function packSources(db: Db, l: Loaded) {
  const { views } = statesOf(l);
  const load = loaderFor(db);
  const docs = slotDocs(l);
  const rowOf = new Map(l.docs.map((d) => [d.id, d]));
  const parts: PackPart[] = [];
  const multi: SlotCode[] = ['CC5', 'CCMH', 'CC21', 'F76', 'CC13'];
  for (const v of views) {
    if (v.code === 'F07BI' || (v.state === 'na' && !v.docs.length)) continue;
    const def = slotDef(v.code)!;
    for (const d of docs.filter((x) => x.slot === v.code)) {
      const row = rowOf.get(d.id)!;
      parts.push({
        slot: v.code,
        title: multi.includes(v.code) && v.docs.length > 1 ? `${def.title}: ${d.name.replace(/\.[a-z0-9]+$/i, '')}` : def.title,
        group: def.group === 'cover' ? 'other' : def.group,
        order: def.order + (d.key === 'CC13_RECEIPT' ? 0.5 : 0),
        docId: d.id,
        name: d.name,
        mime: d.mime,
        manual: d.source === 'library' && (v.code === 'CC5' || v.code === 'CC4'),
        bytes: await load('docs', row.storage_path),
      });
    }
  }
  const coverRow = l.docs.find((d) => d.generated_key === 'F07BI' && !d.archived_at) ?? null;
  const follow = views
    .filter((v) => customerState(v) === 'coming' && !docs.some((d) => d.slot === v.code) && v.code !== 'F07BI')
    .map((v) => ({ slot: v.code, title: v.title, group: (v.group === 'cover' ? 'other' : v.group) as Exclude<typeof v.group, 'cover'>, order: v.order }));
  const f = l.facts;
  const system: [string, string][] = [];
  if (f.system.kwp) system.push(['System size', `${f.system.kwp} kWp`]);
  if (f.system.battery_kwh) system.push(['Battery', `${f.system.battery_kwh} kWh usable`]);
  if (f.system.inverter_model) system.push(['Inverter', f.system.inverter_model]);
  if (f.job.commissionedOn) system.push(['Switched on', longDay(f.job.commissionedOn)]);
  if (f.paperwork.mcs_cert_no) system.push(['MCS certificate', f.paperwork.mcs_cert_no]);
  return { parts, coverRow, follow, system, rowOf };
}

/* ── Print versions (documents/print.ts) ─────────────────────────────────── */

/**
 * The print version of one of the pack's own documents (F78, the warranty, the cover letter…): made
 * again from the job as it was the day the stored copy was made, while that's what it's made from.
 */
export async function handoverDocPrint(db: Db, ref: StoredRef): Promise<Reprint> {
  const g = GENS.find((x) => x.key === ref.key);
  if (!g) return null;
  const l = await loadHandover(db, ref.projectId);
  if (!l) return null;
  // Dated as the stored copy was made (the day isn't part of what's hashed).
  const m = statesOf({ ...l, facts: { ...l.facts, today: ukDay(new Date(ref.madeAt)) } }).made.get(g.key);
  if (m?.ok && hashOf(g, m.input) === ref.hash) return g.make({ ...(m.input as object), variant: 'print' } as never, loaderFor(db));
  return 'changed';
}

/**
 * The print version of the combined pack: built again as the stored one was (the same documents,
 * version, day and what was left as separate files), with the cover letter, the contents page and
 * each document Heliaxis makes in its print version (`printOf`, documents/print.ts); uploads,
 * manuals and anything that can't be made again go in as they are. 'changed' once the pack is behind
 * its documents (build it again first).
 */
export async function packPrint(db: Db, ref: StoredRef, printOf: (row: DocRow) => Promise<Reprint>): Promise<Reprint> {
  const l = await loadHandover(db, ref.projectId);
  if (!l?.pack?.version) return null;
  if (packKey(l) !== ref.hash) return 'changed';
  const { parts, coverRow, follow, system, rowOf } = await packSources(db, l);
  const stored = (Array.isArray(l.pack.contents) ? l.pack.contents : []) as PackEntry[];
  const separate = new Map(stored.filter((e) => e.separate).map((e) => [e.document_id, e.separate!]));
  for (const p of parts) {
    const row = rowOf.get(p.docId);
    if (!row || separate.has(p.docId) || row.source !== 'generated') continue;
    const b = await printOf(row).catch(() => null);
    if (b instanceof Uint8Array) p.bytes = b;
  }
  const load = loaderFor(db);
  const coverPrint = coverRow ? await printOf(coverRow).catch(() => null) : null;
  const cover = coverPrint instanceof Uint8Array ? coverPrint : coverRow ? await load('docs', coverRow.storage_path) : null;
  // "What's new in this version", as the stored pack has it.
  const packRow = currentPack(l);
  const storedBytes = packRow ? await load('docs', packRow.storage_path) : null;
  const f = l.facts;
  const built = await buildPack({
    ref: f.job.ref,
    issued: ukDay(new Date(l.pack.built_at ?? ref.madeAt)),
    customer: f.customer.name,
    address: f.job.addressLines,
    version: l.pack.version,
    changes: storedBytes ? await packChanges(storedBytes) : [],
    system,
    cover,
    parts,
    follow,
    separate,
    deadline: Date.now() + 40_000,
    variant: 'print',
  });
  return built.bytes;
}

/* ── Send ────────────────────────────────────────────────────────────────── */

export type Via = 'whatsapp' | 'email';
type Message = { kind: 'pack' | 'added'; what?: string | null };

const packWords = (first: string, link: string) => `Hi ${first || 'there'}, your Heliaxis handover pack is ready. Your certificates, warranties and guides are all in one place here: ${link} Any questions, just reply here.`;
const addedWords = (first: string, what: string, link: string) => `Hi ${first || 'there'}, we’ve added your ${what} to your Heliaxis handover pack: ${link} Any questions, just reply here.`;

/** The message itself, now: WhatsApp (in the 24-hour window as text, otherwise the approved template) and/or email. */
async function deliverMessage(db: Db, projectId: string, via: Via[], m: Message): Promise<string[]> {
  const notes: string[] = [];
  const { data: p } = await db.from('crm_projects').select('enquiry_id, owner_id').eq('id', projectId).maybeSingle();
  if (!p) return ['The job has gone.'];
  const { data: c } = await db.from('enquiries').select('name, email').eq('id', p.enquiry_id).maybeSingle();
  const token = await ensurePortalToken(projectId);
  if (!token) return ['The customer’s portal isn’t open yet.'];
  const link = portalUrl(token);
  const first = String(c?.name ?? '').split(/\s+/)[0];
  const { data: owner } = p.owner_id ? await db.from('profiles').select('full_name').eq('id', p.owner_id).maybeSingle() : { data: null };
  if (via.includes('whatsapp')) {
    const text = m.kind === 'pack' ? packWords(first, link) : addedWords(first, m.what ?? 'document', link);
    const r = await sendSystem(String(p.enquiry_id), { text, template: 'handover_pack_ready', params: [first || 'there', link] }, 'handover').catch((e) => ({ ok: false as const, error: String(e) }));
    notes.push(r.ok ? 'Sent by WhatsApp.' : `WhatsApp didn’t go: ${r.error}.`);
  }
  if (via.includes('email')) {
    const to = c?.email as string | null;
    if (!to) notes.push('No email address for the customer.');
    else {
      const subject = m.kind === 'pack' ? 'Your Heliaxis handover pack' : `We’ve added your ${m.what ?? 'document'} to your handover pack`;
      const body =
        m.kind === 'pack'
          ? `Hi ${first || 'there'},\n\nYour handover pack is ready. It has your certificates, warranties and guides, all in one place:\n${link}\n\nOne of the team will be in touch to go through it with you.\n\nAny questions, just reply to this email.\n\nThanks,\n${(owner as { full_name?: string } | null)?.full_name || 'The Heliaxis team'}\nHeliaxis`
          : `Hi ${first || 'there'},\n\nWe’ve added your ${m.what ?? 'document'} to your handover pack:\n${link}\n\nThanks,\nThe Heliaxis team`;
      try {
        if (msConfigured()) {
          await sendMail({ to, subject, text: body });
          notes.push('Emailed.');
        } else {
          const r = await sendEmail({
            to,
            subject,
            text: body,
            from: 'Heliaxis <noreply@heliaxis.co.uk>',
            replyTo: 'hello@heliaxis.co.uk',
            html: emailShell(subject, body.split('\n\n').map((x) => `<p>${x.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]!).replace(/\n/g, '<br>')}</p>`).join(''), { href: link, label: 'Open your handover pack' }, 'Handover'),
          });
          notes.push(r.ok ? 'Emailed.' : `Email didn’t go: ${r.error}`);
        }
      } catch (e) {
        notes.push(`Email didn’t go: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  await logActivity({ enquiryId: String(p.enquiry_id), projectId, kind: 'system', body: `${m.kind === 'pack' ? 'Handover pack' : `Handover pack: ${m.what}`} sent to the customer${notes.length ? ` (${notes.join(' ')})` : ''}`, byId: null }).catch(() => null);
  return notes;
}

/** Send now, or hold it for the evening rule (D19): stored on the pack, sent by the cron. */
async function sendOrHold(db: Db, projectId: string, via: Via[], m: Message, by: string | null, now = new Date()): Promise<{ notes: string[]; at: string | null }> {
  if (!via.length) return { notes: [], at: null };
  const at = sendAfter(now, await getWaSettings());
  if (at.getTime() > now.getTime() + 60_000) {
    const { data } = await db.from('handover_packs').select('queued').eq('project_id', projectId).maybeSingle();
    const list = Array.isArray(data?.queued) ? (data!.queued as unknown[]) : data?.queued ? [data.queued] : [];
    await db.from('handover_packs').update({ queued: [...list, { at: at.toISOString(), via, kind: m.kind, what: m.what ?? null, by }] }).eq('project_id', projectId);
    return { notes: [`Goes at ${sendTimeWords(at)}.`], at: at.toISOString() };
  }
  return { notes: await deliverMessage(db, projectId, via, m), at: null };
}

/** Messages held overnight, sent once their time comes (the cron). */
export async function sendQueuedHandover(db: Db, now = new Date()): Promise<number> {
  const { data } = await db.from('handover_packs').select('project_id, queued').not('queued', 'is', null);
  let n = 0;
  for (const row of (data ?? []) as { project_id: string; queued: unknown }[]) {
    const list = (Array.isArray(row.queued) ? row.queued : row.queued ? [row.queued] : []) as { at: string; via: Via[]; kind: Message['kind']; what: string | null }[];
    const due = list.filter((q) => Date.parse(q.at) <= now.getTime());
    if (!due.length) continue;
    const left = list.filter((q) => !due.includes(q));
    // Taken off first, so a second run can't send them twice.
    const { data: claimed } = await db.from('handover_packs').update({ queued: left.length ? left : null }).eq('project_id', row.project_id).eq('queued', JSON.stringify(row.queued)).select('project_id');
    if (!claimed?.length) continue;
    for (const q of due) {
      await deliverMessage(db, row.project_id, q.via, { kind: q.kind, what: q.what });
      n++;
    }
  }
  return n;
}

/**
 * Send the pack to the customer (SPEC 4.8, D23): built if it's behind, every held document and the
 * pack released into their portal, sent_at and handover_at set, the job moved to Paperwork &
 * handover, the message (now or at 07:00), and the final invoice next. `override`: an admin sending
 * with site documents still missing.
 */
export async function sendHandover(db: Db, projectId: string, opts: { via: Via[]; by: string | null; byName: string; override?: boolean; now?: Date }): Promise<{ ok: true; notes: string[]; at: string | null } | { ok: false; error: string; blocking?: string[] }> {
  let l = await loadHandover(db, projectId);
  if (!l) return { ok: false, error: 'Not found' };
  const check = sendCheck(statesOf(l).views);
  if (!check.ok && !opts.override) return { ok: false, error: `Still to come from site: ${check.blocking.map((b) => b.title).join(', ')}.`, blocking: check.blocking.map((b) => b.code) };
  if (!l.pack?.version || packKey(l) !== currentPack(l)?.inputs_hash) {
    await buildHandover(db, projectId, { by: opts.by });
    l = (await loadHandover(db, projectId))!;
  }
  const now = (opts.now ?? new Date()).toISOString();
  await db.from('crm_documents').update({ visible: true, release: 'now' }).eq('project_id', projectId).eq('release', 'with_pack').not('handover_slot', 'is', null).is('archived_at', null);
  const via = [...new Set([...(l.pack?.sent_via ?? []), ...opts.via])];
  await db
    .from('handover_packs')
    .update({ sent_at: l.pack?.sent_at ?? now, sent_by: opts.by, sent_via: via, invoice_prompted_at: l.pack?.invoice_prompted_at ?? now })
    .eq('project_id', projectId);
  await db.from('crm_projects').update({ handover_at: now }).eq('id', projectId).is('handover_at', null);
  await moveStage(projectId, 'handover', { byId: opts.by, note: 'handover pack sent', onlyFrom: ['won', 'design', 'ready', 'install_booked', 'installing', 'commissioning'] });
  await logActivity({ enquiryId: String(l.project.enquiry_id), projectId, kind: 'system', body: `Handover pack sent to the customer by ${opts.byName}${opts.override && !check.ok ? ` (sent before ${check.blocking.map((b) => b.code).join(', ')} came in)` : ''}`, byId: opts.by }).catch(() => null);
  // The final invoice is the next thing (SPEC 4.9): a task due the next working day.
  const tomorrow = addWorkingDays(ukDay(opts.now ?? new Date()), 1, await ukBankHolidays());
  await addSourceTask(db, { projectId, key: 'final-invoice', title: 'Send the final invoice', notes: 'Upload it on the Handover tab: it goes into their portal and the pack.', assigneeId: (l.project.owner_id as string | null) ?? null, createdBy: opts.by, dueDate: tomorrow });
  const msg = await sendOrHold(db, projectId, opts.via, { kind: 'pack' }, opts.by, opts.now);
  return { ok: true, notes: msg.notes, at: msg.at };
}

/** "We've added your MCS certificate to your handover pack" (the Tell the customer toggle on an upload). */
export async function tellCustomer(db: Db, projectId: string, slot: string, via: Via[], by: string | null) {
  const what = (slotDef(slot)?.pick ?? slotDef(slot)?.title ?? 'document').replace(/^Something else$/, 'document');
  return sendOrHold(db, projectId, via, { kind: 'added', what: what.charAt(0).toLowerCase() + what.slice(1) }, by);
}

/* ── The office's actions on an item ─────────────────────────────────────── */

/** One item's office data, merged (handover_slots.data). */
export async function patchSlotData(db: Db, projectId: string, slot: string, patch: Partial<SlotData>, by: string | null) {
  const { data } = await db.from('handover_slots').select('*').eq('project_id', projectId).eq('slot', slot).maybeSingle();
  const cur = ((data?.data ?? {}) as SlotData) || {};
  const next: SlotData = { ...cur, ...patch, ...(patch.values ? { values: { ...(cur.values ?? {}), ...patch.values } } : {}), ...(patch.parts ? { parts: { ...(cur.parts ?? {}), ...patch.parts } } : {}) };
  if (next.values) for (const [k, v] of Object.entries(next.values)) if (!String(v ?? '').trim()) delete next.values[k];
  await db.from('handover_slots').upsert({ project_id: projectId, slot, na: data?.na ?? false, na_reason: data?.na_reason ?? null, note: data?.note ?? null, data: next, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: 'project_id,slot' });
}

export async function markNotNeeded(db: Db, projectId: string, slot: string, na: boolean, reason: string | null, by: string | null, byName: string) {
  const { data } = await db.from('handover_slots').select('*').eq('project_id', projectId).eq('slot', slot).maybeSingle();
  await db
    .from('handover_slots')
    .upsert({ project_id: projectId, slot, na, na_reason: na ? reason : null, note: data?.note ?? null, data: data?.data ?? {}, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: 'project_id,slot' });
  const { data: p } = await db.from('crm_projects').select('enquiry_id').eq('id', projectId).maybeSingle();
  if (p) await logActivity({ enquiryId: String(p.enquiry_id), projectId, kind: 'system', body: na ? `Handover pack: ${slotDef(slot)?.title ?? slot} not needed (${reason}), ${byName}` : `Handover pack: ${slotDef(slot)?.title ?? slot} needed again`, byId: by }).catch(() => null);
}

/** A signature image from the browser (data:image/png;base64,…), stored in crm-docs. */
async function storeSignature(db: Db, path: string, png: string) {
  await ensureDocsBucket();
  const up = await db.storage.from(DOCS_BUCKET).upload(path, Buffer.from(png.split(',')[1] ?? '', 'base64'), { contentType: 'image/png', upsert: true });
  if (up.error) throw new Error('The signature didn’t save. Try again.');
}

/** F78's design part, signed in the office (SPEC 4.5). */
export async function signF78Design(db: Db, projectId: string, s: { name: string; signature: string; by: string | null }) {
  const at = new Date().toISOString();
  const path = `signatures/${projectId}/f78-design-${Date.now()}.png`;
  await storeSignature(db, path, s.signature);
  await patchSlotData(db, projectId, 'F78', { design: { name: s.name, signed_at: at, path, by: s.by } }, s.by);
}

/**
 * The customer signs in their portal (C2): the completion record (F16E) or, on G98 jobs, Form B.
 * Each its own signature (D15), kept on the item; the document follows at once.
 */
export async function customerSign(db: Db, projectId: string, s: { kind: 'f16e' | 'g98'; name: string; signature: string; declaration: string; ip: string | null }): Promise<{ again: boolean }> {
  const slot = s.kind === 'f16e' ? 'F16E' : 'F47';
  const { data } = await db.from('handover_slots').select('data').eq('project_id', projectId).eq('slot', slot).maybeSingle();
  if ((data?.data as SlotData | null)?.customer) return { again: true };
  const at = new Date().toISOString();
  const path = `signatures/${projectId}/portal-${s.kind}-${Date.now()}.png`;
  await storeSignature(db, path, s.signature);
  await patchSlotData(db, projectId, slot, { customer: { name: s.name, signed_at: at, path, via: 'portal', declaration: s.declaration } }, null);
  const { data: p } = await db.from('crm_projects').select('enquiry_id, owner_id, title').eq('id', projectId).maybeSingle();
  if (p) {
    const what = s.kind === 'f16e' ? 'the completion record' : 'the G98 form';
    await logActivity({ enquiryId: String(p.enquiry_id), projectId, kind: 'system', body: `${s.name} signed ${what} in their portal`, meta: { ip: s.ip }, byId: null }).catch(() => null);
    if (p.owner_id) await notify({ userId: String(p.owner_id), kind: 'crm_handover', title: `${s.name} signed ${what}`, body: String(p.title ?? ''), href: `/admin/projects/${projectId}?tab=handover`, tag: `handover-${projectId}` }).catch(() => null);
  }
  return { again: false };
}

/** A payment typed from the invoice (SPEC 4.9). A final payment ticks "Final invoice paid". */
export async function recordPayment(
  db: Db,
  projectId: string,
  b: { kind: Payment['kind']; amount_pence: number; paid_on: string; method: Payment['method']; reference: string | null; by: string | null; byName: string }
) {
  const { error } = await db.from('crm_payments').insert({ project_id: projectId, kind: b.kind, amount_pence: b.amount_pence, paid_on: b.paid_on, method: b.method, reference: b.reference, recorded_by: b.by });
  if (error) throw new Error(error.message);
  if (b.kind === 'final') {
    const value = { done_at: new Date().toISOString(), by_id: b.by, by: b.byName };
    await db.rpc('crm_checklist_set', { p_project: projectId, p_key: 'x_paid', p_value: value }).then(
      () => null,
      () => null
    );
  }
  const { data: p } = await db.from('crm_projects').select('enquiry_id').eq('id', projectId).maybeSingle();
  if (p)
    await logActivity({
      enquiryId: String(p.enquiry_id),
      projectId,
      kind: 'system',
      body: `Payment recorded: £${(b.amount_pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })} on ${longDay(b.paid_on)} (${b.kind === 'final' ? 'final' : b.kind === 'stage' ? 'stage' : 'other'}), ${b.byName}`,
      byId: b.by,
    }).catch(() => null);
}

/** "Sent to DNO" for the G98 data sheet ticks the checklist's G98 item (c_dno_notified). */
export async function markDnoSent(db: Db, projectId: string, by: string | null, byName: string) {
  const value = { done_at: new Date().toISOString(), by_id: by, by: byName };
  const r = await db.rpc('crm_checklist_set', { p_project: projectId, p_key: 'c_dno_notified', p_value: value }).then(
    (x) => x,
    () => ({ error: { message: 'missing' } })
  );
  if (r.error) throw new Error('Run crm-v3.sql first (it’s on your to-do list), then try again.');
}

/** The words for "What we installed", for the portal's handover section. */
export { installedLines };
export type { DocRow, Loaded, PackRow };
