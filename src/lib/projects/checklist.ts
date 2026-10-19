import type { StageKey } from '../crm/stages';

/**
 * The short checklist for each stage of a job (spec 4.6). An item is done when the app can see it's
 * done (`auto`: a date, a document, a survey), when someone ticked it, or when someone marked it
 * "Not needed". Key items are the only ones that make "Move to the next stage" ask first; everything
 * else is a reminder. Manual moves are always allowed.
 *
 * Pure apart from types, so scripts/test-projects.mjs loads it straight into node. The server builds
 * the CheckCtx (src/lib/projects/server.ts) and ticks go through crm_checklist_set (crm-v3.sql).
 */

export type ChecklistMark = { done_at?: string; by_id?: string; by?: string; na?: boolean };

/** A crm_projects row (select('*')), with the crm-v3.sql columns filled in when they're missing. */
export type ProjectRow = Record<string, unknown> & {
  id: string;
  stage: string;
  products: string[];
  checklist: Record<string, ChecklistMark>;
  paperwork: Record<string, string>;
  system: Record<string, unknown>;
  reminders_sent: string[];
};

export type CheckCtx = {
  p: ProjectRow;
  docs: { category: string; visible: boolean; needs_signature: boolean; signed_outside_at: string | null }[];
  photoCounts: Record<string, number>;
  surveys: { type: 'solar' | 'ashp'; status: string; simpliheat_url: string | null; hasDoc: boolean }[];
  subcontracts: { status: string }[];
  /** Microsoft 365 is connected, so installs can be in Outlook. */
  outlook: boolean;
  /** YYYY-MM-DD, UK. */
  today: string;
};

export type CheckGroup = StageKey | 'sales';

export type CheckItem = {
  key: string;
  stage: CheckGroup;
  label: string;
  help?: string;
  /** Only for jobs with one of these products. */
  products?: string[];
  /** Only when this is true (e.g. the DNO route is G99). */
  when?: (c: CheckCtx) => boolean;
  /** Done without anyone ticking it. */
  auto?: (c: CheckCtx) => boolean;
  key_item?: boolean;
};

export type CheckView = { key: string; label: string; help?: string; done: boolean; auto: boolean; na: boolean; by?: string; at?: string; key_item: boolean };

/** The pipeline in order. Keep in step with STAGES in src/lib/crm/stages.ts (test-projects.mjs checks it). */
export const STAGE_ORDER = [
  'lead',
  'contacted',
  'survey_booked',
  'surveyed',
  'quote_sent',
  'won',
  'design',
  'ready',
  'install_booked',
  'installing',
  'commissioning',
  'handover',
  'complete',
  'lost',
] as const;

/** The checklist's groups in order: the short sales list, then one per project stage. */
export const CHECK_GROUPS: CheckGroup[] = ['sales', 'won', 'design', 'ready', 'install_booked', 'installing', 'commissioning', 'handover', 'complete'];

const SALES = new Set<string>(['lead', 'contacted', 'survey_booked', 'surveyed', 'quote_sent']);

/** Which group a stage's checklist is: 'sales' before Won, the stage itself from Won on, null when Lost. */
export function checkGroupFor(stage: string): CheckGroup | null {
  if (SALES.has(stage)) return 'sales';
  return (CHECK_GROUPS as string[]).includes(stage) ? (stage as CheckGroup) : null;
}

/* ── Reading the job ─────────────────────────────────────────────────────────── */

const order = (s: string) => (STAGE_ORDER as readonly string[]).indexOf(s);
/** Has the job got as far as `key`? A Lost job hasn't got anywhere. */
const reached = (c: CheckCtx, key: StageKey) => c.p.stage !== 'lost' && order(c.p.stage) >= order(key);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const field = (c: CheckCtx, k: string) => text(c.p[k]);
const paper = (c: CheckCtx, k: string) => text(c.p.paperwork?.[k]);
const sys = (c: CheckCtx, k: string) => text(c.p.system?.[k]);
const hasAny = (c: CheckCtx, list: string[]) => c.p.products.some((p) => list.includes(p));
const route = (c: CheckCtx) => paper(c, 'dno_route');
const designed = (c: CheckCtx) => !!(field(c, 'opensolar_url') || field(c, 'simpliheat_url') || c.docs.some((d) => d.category === 'design'));
const signedOutside = (c: CheckCtx, cats?: string[]) => c.docs.some((d) => !!d.signed_outside_at && (!cats || cats.includes(d.category)));

/** Solar, battery or EV jobs need a finished solar survey; heat pump jobs a SimpliHeat survey with its link or PDF. */
function surveyLinked(c: CheckCtx): boolean {
  const solar = hasAny(c, ['solar', 'battery', 'ev']);
  const heat = hasAny(c, ['heatpump']);
  if (!solar && !heat) return false;
  const solarOk = !solar || c.surveys.some((s) => s.type === 'solar' && s.status === 'complete');
  const heatOk = !heat || c.surveys.some((s) => s.type === 'ashp' && s.status !== 'cancelled' && (!!s.simpliheat_url || s.hasDoc));
  return solarOk && heatOk;
}

/** The system size (solar) and heat pump model (heat pumps) are filled in. */
function kitKnown(c: CheckCtx): boolean {
  const solar = hasAny(c, ['solar']);
  const heat = hasAny(c, ['heatpump']);
  if (!solar && !heat) return false;
  return (!solar || !!sys(c, 'kwp')) && (!heat || !!sys(c, 'heat_pump_model'));
}

/** Booked with RAMS, and every firm on it (apart from cancelled bookings) has confirmed its crew. */
function tradesConfirmed(c: CheckCtx): boolean {
  const live = c.subcontracts.filter((s) => s.status !== 'cancelled');
  return !!field(c, 'rams_project_id') && live.length > 0 && live.every((s) => s.status === 'crew_confirmed');
}

const SOLAR_BATTERY = ['solar', 'battery'];
const HEAT = ['heatpump'];

/* ── The list ────────────────────────────────────────────────────────────────── */

export const CHECKLIST: CheckItem[] = [
  // Sales (opportunities)
  { key: 's_contacted', stage: 'sales', label: 'First contact made', auto: (c) => !!field(c, 'first_contact_at') || reached(c, 'contacted') },
  { key: 's_survey_booked', stage: 'sales', label: 'Survey booked', auto: (c) => !!field(c, 'survey_at') || reached(c, 'survey_booked') },
  { key: 's_survey_done', stage: 'sales', label: 'Survey done', auto: (c) => c.surveys.some((s) => s.status === 'complete') || reached(c, 'surveyed') },
  { key: 's_design', stage: 'sales', label: 'Design attached', help: 'An OpenSolar or SimpliHeat link, or a design document.', auto: designed },
  { key: 's_quote_sent', stage: 'sales', label: 'Quote sent for signing', auto: (c) => reached(c, 'quote_sent') || c.docs.some((d) => d.needs_signature) },
  { key: 's_signed', stage: 'sales', label: 'Quote signed', auto: (c) => !!field(c, 'accepted_at') || signedOutside(c) },

  // Won
  {
    key: 'w_contract',
    stage: 'won',
    label: 'Contract or quote signed',
    help: 'Signed in their portal, or a quote or contract marked as signed in Docs.',
    auto: (c) => !!field(c, 'accepted_at') || signedOutside(c, ['quote', 'contract']),
    key_item: true,
  },
  { key: 'w_deposit', stage: 'won', label: 'Deposit paid', when: (c) => Number(c.p.deposit_amount) > 0, auto: (c) => !!field(c, 'deposit_paid_at'), key_item: true },
  { key: 'w_deposit_cover', stage: 'won', label: 'Deposit insurance cover issued' },
  { key: 'w_survey', stage: 'won', label: 'Survey complete and linked', auto: surveyLinked },

  // Design & approvals
  { key: 'd_design', stage: 'design', label: 'Final design attached', auto: designed },
  { key: 'd_kit', stage: 'design', label: 'System size and kit confirmed', auto: kitKnown },
  {
    key: 'd_ena',
    stage: 'design',
    label: 'Inverter and battery on the ENA Type Test Register',
    help: 'Check each model on the ENA register before ordering, or the DNO can refuse it.',
    products: SOLAR_BATTERY,
  },
  { key: 'd_dno_route', stage: 'design', label: 'DNO route decided (G98 / G99)', products: ['solar', 'battery', 'heatpump', 'ev'], auto: (c) => !!route(c), key_item: true },
  {
    key: 'd_g99_applied',
    stage: 'design',
    label: 'G99 applied for',
    when: (c) => route(c) === 'g99',
    auto: (c) => ['submitted', 'approved'].includes(field(c, 'dno_status')),
    key_item: true,
  },
  { key: 'd_heat_loss', stage: 'design', label: 'Heat loss and MCS 020 noise check done', products: HEAT },
  { key: 'd_bus_applied', stage: 'design', label: 'BUS grant voucher applied for', products: HEAT, auto: (c) => !!paper(c, 'bus_applied_on'), key_item: true },
  { key: 'd_planning', stage: 'design', label: 'Planning checked (permitted development, conservation area, listed)' },
  { key: 'd_told', stage: 'design', label: 'Customer told what happens next' },

  // Ready to book
  { key: 'r_g99_ok', stage: 'ready', label: 'G99 approved', when: (c) => route(c) === 'g99', auto: (c) => field(c, 'dno_status') === 'approved', key_item: true },
  {
    key: 'r_bus_ok',
    stage: 'ready',
    label: 'BUS voucher issued and in date',
    products: HEAT,
    auto: (c) => !!paper(c, 'bus_issued_on') && !!paper(c, 'bus_expires_on') && paper(c, 'bus_expires_on') >= c.today,
    key_item: true,
  },
  { key: 'r_kit', stage: 'ready', label: 'Kit ordered and delivery date known' },
  { key: 'r_scaffold', stage: 'ready', label: 'Scaffold booked', auto: (c) => !!field(c, 'scaffold_up_on'), key_item: true },
  { key: 'r_trades', stage: 'ready', label: 'Electrician and subcontractors confirmed, RAMS issued', auto: tradesConfirmed },

  // Install booked
  { key: 'i_dates', stage: 'install_booked', label: 'Install day(s) set', auto: (c) => !!field(c, 'install_at'), key_item: true },
  {
    key: 'i_outlook',
    stage: 'install_booked',
    label: 'In Outlook',
    when: (c) => c.outlook,
    auto: (c) => Array.isArray(c.p.install_event_ids) && c.p.install_event_ids.length > 0,
  },
  { key: 'i_scaffold_dates', stage: 'install_booked', label: 'Scaffold up and down dates set', auto: (c) => !!field(c, 'scaffold_up_on') && !!field(c, 'scaffold_down_on') },
  { key: 'i_access', stage: 'install_booked', label: 'Access and parking notes checked (from the survey)' },

  // Installing
  { key: 'n_progress', stage: 'installing', label: 'Progress photos', auto: (c) => (c.photoCounts.progress ?? 0) >= 1 },
  { key: 'n_snags', stage: 'installing', label: 'Snags logged (or none)' },
  { key: 'n_checks', stage: 'installing', label: 'Install-day checks: isolation, labels, cable route as surveyed' },

  // Commissioning
  { key: 'c_tests', stage: 'commissioning', label: 'BS EN 62446 tests and EIC done', products: SOLAR_BATTERY, auto: (c) => !!paper(c, 'eic_on') },
  {
    key: 'c_commissioned',
    stage: 'commissioning',
    label: 'Inverter and battery commissioned, monitoring set up',
    products: SOLAR_BATTERY,
    auto: (c) => !!field(c, 'commissioned_at'),
    key_item: true,
  },
  { key: 'c_ashp', stage: 'commissioning', label: 'Heat pump commissioning record (Benchmark)', products: HEAT },
  {
    key: 'c_dno_notified',
    stage: 'commissioning',
    label: 'G98 notice or G99 commissioning form sent to the DNO',
    help: 'G98: within 28 days of switching on.',
    products: SOLAR_BATTERY,
  },
  { key: 'c_photos', stage: 'commissioning', label: 'Completion photos', auto: (c) => (c.photoCounts.completion ?? 0) >= 1 },

  // Paperwork & handover
  {
    key: 'h_mcs',
    stage: 'handover',
    label: 'MCS certificate registered',
    help: 'Within 10 working days of commissioning.',
    products: ['solar', 'battery', 'heatpump'],
    auto: (c) => !!paper(c, 'mcs_cert_no'),
    key_item: true,
  },
  { key: 'h_regs', stage: 'handover', label: 'Building Regs notified (NICEIC / NAPIT)', help: 'Within 30 days of the work.', auto: (c) => !!paper(c, 'building_regs_ref') },
  {
    key: 'h_warranty',
    stage: 'handover',
    label: 'Warranties and insurance-backed guarantee registered',
    auto: (c) => !!paper(c, 'ibg_registered_on') && !!paper(c, 'warranties_registered_on'),
  },
  { key: 'h_pack', stage: 'handover', label: 'Handover pack in the customer’s portal', auto: (c) => c.docs.some((d) => d.category === 'handover' && d.visible) },
  { key: 'h_seg', stage: 'handover', label: 'Smart Export Guarantee guidance sent', products: ['solar'], auto: (c) => !!paper(c, 'seg_info_sent_on') },
  { key: 'h_bus_redeemed', stage: 'handover', label: 'BUS voucher redeemed', products: HEAT, auto: (c) => !!paper(c, 'bus_redeemed_on'), key_item: true },

  // Complete
  { key: 'x_paid', stage: 'complete', label: 'Final invoice paid' },
  { key: 'x_scaffold_down', stage: 'complete', label: 'Scaffold removed', auto: (c) => !!field(c, 'scaffold_down_on') && field(c, 'scaffold_down_on').slice(0, 10) <= c.today },
  { key: 'x_review', stage: 'complete', label: 'Review request sent', auto: (c) => c.p.reminders_sent.includes('review') },
];

const BY_KEY = new Map(CHECKLIST.map((i) => [i.key, i]));

/** The item with this key, or undefined (an unknown key from a request). */
export const checklistItem = (key: string): CheckItem | undefined => BY_KEY.get(key);

/** Does this item belong on this job (its products and its condition)? */
function applies(i: CheckItem, c: CheckCtx): boolean {
  return (!i.products || hasAny(c, i.products)) && (!i.when || i.when(c));
}

function view(i: CheckItem, c: CheckCtx): CheckView {
  const mark = c.p.checklist?.[i.key];
  const auto = !!i.auto?.(c);
  const na = !auto && !!mark?.na;
  const ticked = !!mark?.done_at;
  return {
    key: i.key,
    label: i.label,
    ...(i.help ? { help: i.help } : {}),
    done: auto || ticked || na,
    auto,
    na,
    ...(!auto && mark?.by ? { by: mark.by } : {}),
    ...(!auto && mark?.done_at ? { at: mark.done_at } : {}),
    key_item: !!i.key_item,
  };
}

/** Every group that has items for this job, in pipeline order. */
export function checklistView(c: CheckCtx): { stage: string; items: CheckView[] }[] {
  return CHECK_GROUPS.map((g) => ({ stage: g as string, items: CHECKLIST.filter((i) => i.stage === g && applies(i, c)).map((i) => view(i, c)) })).filter(
    (g) => g.items.length > 0
  );
}

/** How far through a stage's checklist the job is. Sales stages share the one sales list; Lost has none. */
export function stageProgress(c: CheckCtx, stage: string): { done: number; total: number; keyMissing: number } {
  const g = checkGroupFor(stage);
  const items = g ? CHECKLIST.filter((i) => i.stage === g && applies(i, c)).map((i) => view(i, c)) : [];
  return {
    done: items.filter((i) => i.done).length,
    total: items.length,
    keyMissing: items.filter((i) => i.key_item && !i.done).length,
  };
}
