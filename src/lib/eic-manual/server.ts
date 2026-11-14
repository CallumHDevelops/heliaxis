import 'server-only';
import { ukDay } from '@/lib/bank-holidays';
import { EIC_REVISION, eicPdf, type SigImage } from '@/lib/documents/eic/eic';
import { docFileName, MissingAnswer, type Variant } from '@/lib/documents/pdf-kit';
import { saveGenerated } from '@/lib/documents/store';
import { createAdminClient } from '@/lib/supabase/admin';
import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';
import { designOf as systemDesign } from '@/lib/site/design';
import { EIC_FLAGS, EIC_STEPS, certMissing, designOf, type DesignSign } from '@/lib/site/forms/electrician/eic';
import { BOARD, DETAILS, TESTS, boardDone, boardName, boardsOf, circuitDone, circuitName, editionOf, propCtx, routeOf, shownProps, type Prop, type PropCtx, type Rec } from '@/lib/site/forms/electrician/eic-model';
import type { Field, FormCtx } from '@/lib/site/forms/types';
import { splitPostcode } from '@/lib/site/eic/facts';
import { makeCtx } from '@/lib/site/rules';
import type { Answer, Answers } from '@/lib/site/types';

/**
 * EIC certificates written up by hand in the office (Operations › EIC certificates). The same certificate the site app makes (its questions,
 * its rules, its PDF), but the answers are typed here, not on a phone, and it can belong to a customer, a job or both. The record is just
 * its answers (the site app's keys: eic_earthing, eic_db:c-… and so on) and the signatures drawn on it.
 */

export type Db = ReturnType<typeof createAdminClient>;
export type SigStore = Record<string, { png: string; at: string } | undefined>;
export type EicRow = {
  id: string;
  number: string;
  route: 'eic' | 'eic_single' | 'meiwc';
  title: string;
  enquiry_id: string | null;
  project_id: string | null;
  address: string;
  answers: Answers;
  sigs: SigStore;
  status: 'draft' | 'issued';
  issued_on: string | null;
  request: InfoRequest | null;
  created_at: string;
  updated_at: string;
};
/** Information asked of an installer: they fill the certificate in at a personal link (/eic/fill/<token>) and send it back. */
export type InfoRequest = { token: string; name: string; email: string; message: string; sent_at: string; submitted_at: string | null };
export const ROUTES = ['eic', 'eic_single'] as const;
export const SIG_KEYS = ['eic_sig_con', 'eic_sig_ins', 'eic_sig_one', 'eic_design'] as const;
/** Keys a record's answers may have: the certificate's (eic_…), nothing else. */
const KEY = /^eic_[A-Za-z0-9_]{1,30}(?::[A-Za-z0-9_-]{1,30})?$/;

export async function readEic(db: Db, id: string): Promise<EicRow | null> {
  const { data } = await db.from('eic_manual').select('*').eq('id', id).maybeSingle();
  return (data as EicRow | null) ?? null;
}

export type Who = { name: string };

/** The rules' context for a record: its answers, who the work is for, and the person signing offered from the staff member's own details. */
export async function ctxOf(db: Db, row: EicRow, who: Who): Promise<FormCtx & { customer: string | null; jobRef: string | null }> {
  const [{ data: cust }, { data: proj }] = await Promise.all([
    row.enquiry_id ? db.from('enquiries').select('name, postcode').eq('id', row.enquiry_id).maybeSingle() : Promise.resolve({ data: null }),
    row.project_id ? db.from('crm_projects').select('project_ref, address, postcode, products').eq('id', row.project_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const customer = ((cust as { name?: string } | null)?.name ?? null) || null;
  const p = (proj ?? {}) as { project_ref?: string | null; address?: string | null; postcode?: string | null; products?: string[] };
  const address = row.address.trim() || [p.address?.split(/\n/).map((l) => l.trim()).filter(Boolean).join(', '), p.postcode ?? (cust as { postcode?: string } | null)?.postcode].filter(Boolean).join(', ');
  const answers: Answers = { ...row.answers, eic_route: { v: row.route, src: 'typed' } };
  const where = splitPostcode(HELIAXIS_COMPANY.addressLines.join(', '));
  const photos: Record<string, number> = {};
  for (const k of SIG_KEYS) if (row.sigs[k]) photos[k] = 1;
  const ctx = makeCtx({
    trade: 'electrician',
    answers,
    design: systemDesign({}),
    system: { kwp: null, panel_count: null, panel_model: null, inverter_model: null, battery_model: null },
    products: Array.isArray(p.products) ? p.products : [],
    sides: [],
    photos,
    reads: [],
    address,
    signed: [],
    eic: {
      route: row.route,
      ref: row.number,
      client: customer,
      contact: { name: who.name, company: HELIAXIS_COMPANY.tradingName, mobile: HELIAXIS_COMPANY.phone, email: HELIAXIS_COMPANY.email, address: where.address, postcode: where.postcode, scheme: null, scheme_number: null },
      instruments: {},
    },
  });
  return Object.assign(ctx, { customer, jobRef: p.project_ref ?? null });
}

/* ── What the editor is given ─────────────────────────────────────────────────── */

export type FieldView = {
  key: string;
  type: Field['type'];
  label: string;
  hint?: string;
  level: Field['level'];
  options?: { key: string; label: string }[];
  unit?: string;
  dp?: number;
  chips?: number[];
  picks?: string[];
  choices?: string[];
  na?: boolean;
  gt?: boolean;
  cant?: string;
  parent?: string;
  widget?: string;
  note?: string | null;
  suggest?: { v: unknown; text: string } | null;
  value: unknown;
  /** Still needed before it can be issued. */
  open: boolean;
};
export type StepView = { key: string; title: string; intro?: string; fields: FieldView[]; open: number };
export type PropView = Pick<Prop, 'k' | 'col' | 'label' | 'head' | 'type' | 'unit' | 'dp' | 'chips' | 'picks' | 'options' | 'gt' | 'level' | 'test' | 'group' | 'hint'>;
export type RecView = { id: string; name: string; done: boolean; rec: Rec; shown: string[]; suggest: Record<string, { v: number | string; text: string; also?: Rec }> };
export type BoardsView = {
  pc: PropCtx;
  props: { board: PropView[]; details: PropView[]; tests: PropView[] };
  boards: (RecView & { circuits: RecView[] })[];
};
export type EicView = {
  id: string;
  number: string;
  route: EicRow['route'];
  title: string;
  address: string;
  status: EicRow['status'];
  issued_on: string | null;
  customer: { id: string; name: string } | null;
  project: { id: string; ref: string | null; title: string | null } | null;
  steps: StepView[];
  boards: BoardsView | null;
  sigs: Record<string, string | null>;
  missing: { label: string; why: string; step: string }[];
  flags: { severity: string; text: string }[];
  complete: boolean;
  /** The three-part certificate also needs the design part signed. */
  designNeeded: boolean;
  design: DesignSign | null;
  request: Omit<InfoRequest, 'token'> | null;
};

const propView = (p: Prop): PropView => ({ k: p.k, col: p.col, label: p.label, head: p.head, type: p.type, unit: p.unit, dp: p.dp, chips: p.chips, picks: p.picks, options: p.options, gt: p.gt, level: p.level, test: p.test, group: p.group, hint: p.hint });

export async function viewOf(db: Db, row: EicRow, who: Who): Promise<EicView> {
  const ctx = await ctxOf(db, row, who);
  const miss = certMissing(ctx);
  const openKeys = new Set(miss.map((m) => m.key));
  const open = (k: string) => openKeys.has(k);
  const steps: StepView[] = EIC_STEPS.filter((s) => !s.show || s.show(ctx)).map((s) => {
    const fields: FieldView[] = s.fields
      .filter((f) => (!f.show || f.show(ctx)) && f.type !== 'PHOTOS' && f.key !== 'eic_route' && f.key !== 'eic_route_why')
      .map((f) => {
        const sug = f.suggest?.(ctx) ?? null;
        return {
          key: f.key,
          type: f.type,
          label: f.label,
          hint: f.hint,
          level: f.level,
          options: f.options,
          unit: f.unit,
          dp: f.dp,
          chips: f.chips,
          picks: f.picks,
          choices: f.choices,
          na: f.na,
          gt: f.gt,
          cant: f.cant,
          parent: f.parent,
          widget: f.widget,
          note: f.note?.(ctx) ?? null,
          suggest: sug ? { v: sug.v, text: sug.text } : null,
          value: ctx.values[f.key],
          open: open(f.key) || miss.some((m) => m.key.startsWith(`${f.key}:`)),
        };
      })
      .filter((f) => f.type !== 'CUSTOM' || ['eic-sources', 'eic-instruments', 'eic-boards', 'eic-sign'].includes(f.widget ?? ''));
    return { key: s.key, title: s.title, intro: s.intro, fields, open: miss.filter((m) => m.step === s.key).length };
  });
  const pc = propCtx(ctx);
  const { boards, circuits } = boardsOf(ctx.values);
  const rec = (o: Rec, name: string, done: boolean, props: Prop[]): RecView => {
    const sugg: RecView['suggest'] = {};
    for (const p of props) {
      const s = p.suggest?.(o, pc);
      if (s) sugg[p.k] = s;
    }
    return { id: String(o.id), name, done, rec: o, shown: shownProps(props, o, pc).map((p) => p.k), suggest: sugg };
  };
  const boardsView: BoardsView | null = steps.some((s) => s.key === 'eic-boards')
    ? {
        pc,
        props: { board: BOARD.map(propView), details: DETAILS.map(propView), tests: TESTS.map(propView) },
        boards: boards.map((b) => ({
          ...rec(b, boardName(b), boardDone(b, pc), BOARD),
          circuits: circuits.filter((x) => x.board === b.id).map((x) => rec(x, circuitName(x, boards), circuitDone(x, pc), [...DETAILS, ...TESTS])),
        })),
      }
    : null;
  const designNeeded = row.route === 'eic';
  const design = designOf(ctx);
  const [{ data: cust }, { data: proj }] = await Promise.all([
    row.enquiry_id ? db.from('enquiries').select('id, name').eq('id', row.enquiry_id).maybeSingle() : Promise.resolve({ data: null }),
    row.project_id ? db.from('crm_projects').select('id, project_ref, title').eq('id', row.project_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const flags = EIC_FLAGS.filter((f) => {
    try {
      return f.when(ctx);
    } catch {
      return false;
    }
  }).map((f) => ({ severity: typeof f.severity === 'function' ? f.severity(ctx) : f.severity, text: f.text(ctx) }));
  const sigs: Record<string, string | null> = {};
  for (const k of SIG_KEYS) sigs[k] = row.sigs[k] ? `data:image/png;base64,${row.sigs[k]!.png}` : null;
  return {
    id: row.id,
    number: row.number,
    route: row.route,
    title: row.title,
    address: ctx.address,
    status: row.status,
    issued_on: row.issued_on,
    customer: cust ? { id: String((cust as { id: string }).id), name: String((cust as { name: string }).name) } : null,
    project: proj ? { id: String((proj as { id: string }).id), ref: ((proj as { project_ref: string | null }).project_ref) ?? null, title: ((proj as { title: string | null }).title) ?? null } : null,
    steps,
    boards: boardsView,
    sigs,
    missing: miss.map((m) => ({ label: m.label, why: m.why, step: m.step })),
    flags,
    complete: miss.length === 0 && (!designNeeded || (!!design && !!row.sigs.eic_design)),
    designNeeded,
    design,
    request: row.request ? { name: row.request.name, email: row.request.email, message: row.request.message, sent_at: row.request.sent_at, submitted_at: row.request.submitted_at } : null,
  };
}

/* ── Changing a record ────────────────────────────────────────────────────────── */

/** { set: { key: value }, unset: [key] } applied to the answers: only the certificate's keys, each at most 4 kB. */
export function applyAnswers(answers: Answers, set: unknown, unset: unknown, opt: { design?: boolean } = { design: true }): Answers {
  const next: Answers = { ...answers };
  const at = new Date().toISOString();
  for (const [k, v] of Object.entries(set && typeof set === 'object' ? (set as Record<string, unknown>) : {})) {
    if (!KEY.test(k) && !(opt.design && k === 'eic_design')) continue;
    if (k === 'eic_design' && !opt.design) continue;
    if (v === undefined || JSON.stringify(v ?? null).length > 4000) continue;
    next[k] = { v, src: 'typed', at } satisfies Answer;
  }
  for (const k of Array.isArray(unset) ? unset : []) if (typeof k === 'string' && (KEY.test(k) || (opt.design && k === 'eic_design'))) delete next[k];
  return next;
}

/* ── The certificate ──────────────────────────────────────────────────────────── */

const sigImage = (s: SigStore[string]): SigImage => (s ? { png: new Uint8Array(Buffer.from(s.png, 'base64')), at: s.at } : { png: null, at: null });

export async function makePdf(db: Db, row: EicRow, who: Who, variant?: Variant): Promise<{ bytes: Uint8Array; name: string; final: boolean; jobRef: string | null; missing: string | null }> {
  const ctx = await ctxOf(db, row, who);
  const design = designOf(ctx);
  const designPart = row.route === 'eic' ? (design && row.sigs.eic_design ? { ...design, png: row.sigs.eic_design ? new Uint8Array(Buffer.from(row.sigs.eic_design.png, 'base64')) : null } : null) : null;
  const input = {
    route: row.route === 'eic' ? ('eic' as const) : ('eic_single' as const),
    ref: row.number,
    jobRef: ctx.jobRef,
    issued: row.issued_on ?? ukDay(new Date()),
    edition: editionOf(ctx),
    values: ctx.values,
    address: ctx.address,
    sig: { con: sigImage(row.sigs.eic_sig_con), ins: sigImage(row.sigs.eic_sig_ins), one: sigImage(row.sigs.eic_sig_one) },
    design: designPart,
    variant,
  };
  let final = !certMissing(ctx).length && (row.route !== 'eic' || !!designPart);
  let missing: string | null = null;
  let bytes: Uint8Array;
  try {
    bytes = await eicPdf({ ...input, draft: !final });
  } catch (e) {
    if (!(e instanceof MissingAnswer)) throw e;
    final = false;
    missing = e.label;
    bytes = await eicPdf({ ...input, draft: true });
  }
  return { bytes, name: docFileName(ctx.jobRef, row.number, `Electrical Installation Certificate${final ? '' : ' (draft)'}`), final, jobRef: ctx.jobRef, missing };
}

/** Issue it: made final, dated today, and (when it belongs to a job) filed in that job's Docs. */
export async function issue(db: Db, row: EicRow, who: Who, by: string | null): Promise<{ ok: true; filed: boolean } | { ok: false; error: string }> {
  const made = await makePdf(db, row, who);
  if (!made.final) return { ok: false, error: made.missing ? `${made.missing} is still to answer.` : 'It isn’t complete yet.' };
  const issued_on = ukDay(new Date());
  let filed = false;
  if (row.project_id) {
    const sealed = await makePdf(db, { ...row, issued_on, status: 'issued' }, who);
    await saveGenerated(db, row.project_id, {
      key: `EICM_${row.number}`,
      name: sealed.name,
      bytes: sealed.bytes,
      inputs: { number: row.number, answers: row.answers, sigs: Object.fromEntries(Object.entries(row.sigs).map(([k, v]) => [k, v?.at ?? null])), issued_on },
      category: 'certificate',
      slot: null,
      release: 'now',
      visible: false,
      force: true,
      by,
    });
    filed = true;
  }
  await db.from('eic_manual').update({ status: 'issued', issued_on, updated_at: new Date().toISOString() }).eq('id', row.id);
  return { ok: true, filed };
}

void EIC_REVISION;
void routeOf;
