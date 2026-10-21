/**
 * What each of the pack's own documents is made from (SPEC 4.5), worked out from the job's facts:
 * the cover letter, warranty, completion record, G98 data sheet, G99 data sheet, shading and
 * performance, maintenance schedule and agreement, F78, the switching-off page and the payment
 * receipt. Each either has everything it needs (its inputs, hashed by the server to spot changes) or
 * says what it's missing or waiting for, in the office's words. Nothing is guessed: a value the job
 * hasn't got stays out, and if the document needs it, it isn't made (D14, "never invent").
 *
 * Pure, so scripts/test-handover-*.mjs build the same inputs from fixtures that the server builds
 * from the database.
 */
import type { Design } from '../site/design';
import { MIS3002_NOTES } from '../site/fixed/mis3002';
import { approved, DRAFTS, warrantyReady, type HandoverSettings, type ScheduleRow } from './settings-shared';
import { contentsGroups, type Fix, type SlotCode, type SlotView, type Tech } from './slots';

/* ── The facts (the server reads them from the database: facts.ts) ──────── */

/** A customer's signature for one document: on the electrician's phone (P15) or in their portal (C2). */
export type CustomerSig = { name: string; signed_at: string; path: string; via: 'phone' | 'portal'; declaration?: string | null };
/** The office's design signature on F78. */
export type OfficeSig = { name: string; signed_at: string; path: string; by: string | null };
/** A payment recorded against the job (crm_payments), typed from the invoice. */
export type Payment = { id: string; kind: 'stage' | 'final' | 'other'; amount_pence: number; paid_on: string; method: 'card' | 'bank_transfer' | 'other'; reference: string | null };
export type LibraryKind = 'datasheet' | 'manual' | 'warranty' | 'procedure' | 'guide';
/** Per model in a library item: the ENA product ID and the service interval with where it came from (both typed from the manufacturer's papers). */
export type ModelDetails = { ena_id?: string; interval?: { every: string; source: string }; aliases?: string[] };
export type LibraryItem = {
  id: string;
  name: string;
  kind: LibraryKind | null;
  models: string[];
  slot: string | null;
  technologies: string[];
  every_pack: boolean;
  details: Record<string, ModelDetails>;
  storage_path: string;
  compact_path: string | null;
  mime: string | null;
  size: number | null;
};
export type Equipment = { what: string; tech: Tech; model: string | null; count: number | null; rating: string | null; serials: string[] };

/** The office's own data on an item (handover_slots.data). */
export type SlotData = {
  /** F16E, F47: signed in the customer's portal. */
  customer?: CustomerSig;
  /** F78: the design part, signed in the office. */
  design?: OfficeSig;
  /** Typed values: F49A's agreement, CC4's switch locations, F78's overrides. */
  values?: Record<string, string>;
  /** F16E: anything still to put right, with the date it will be done by. */
  outstanding?: { text: string; by: string | null }[];
  /** F76: which G99 paper each document is. */
  parts?: Record<string, string>;
  /** Set by the document store: newer inputs than the version the customer has. */
  stale?: { key: string; hash: string; at: string };
};

export type SystemFacts = {
  kwp: number | null;
  panel_count: number | null;
  panel_model: string | null;
  inverter_model: string | null;
  inverter_kw: number | null;
  battery_model: string | null;
  battery_kwh: number | null;
  ev_charger_model: string | null;
  heat_pump_model: string | null;
  heat_pump_kw: number | null;
  mpan: string | null;
  export_limit_kw: number | null;
  monitoring: string | null;
};

export type ElectricianFacts = {
  name: string;
  company: string | null;
  status: string;
  signedAt: string | null;
  /** The UK day they signed. */
  signedOn: string | null;
  /** EF_SIG's image in crm-docs. */
  signaturePath: string | null;
  /** The pack's answers (values only). */
  values: Record<string, unknown>;
  customer: Partial<Record<'f16e' | 'g98', CustomerSig>>;
  partPBy: 'self' | 'heliaxis' | null;
  /** The electrical certificate's reference (the EIC's, or their own scheme's number). */
  certRef: string | null;
  /** "10 years", from the EIC. */
  nextInspection: string | null;
  /** What the certificate still waits for from the office ("Sign the EIC’s design part…"), from site/handover-facts.ts. */
  certWaits?: string | null;
};

export type HandoverFacts = {
  /** YYYY-MM-DD, UK. */
  today: string;
  job: {
    id: string;
    ref: string | null;
    title: string;
    stage: string;
    products: string[];
    /** The site address, one line per part (street, town… then the postcode). */
    addressLines: string[];
    postcode: string | null;
    /** The install days (YYYY-MM-DD), first to last. */
    installDays: string[];
    commissionedOn: string | null;
    handedOverOn: string | null;
    dno: { route: string | null; status: string | null; ref: string | null; submittedAt: string | null; notified: boolean };
    deposit: { amount: number | null; paidAt: string | null; ref: string | null };
  };
  customer: { name: string; first: string; email: string | null; phone: string | null };
  /** Whoever looks after the job (signs the cover letter). */
  owner: { name: string | null };
  system: SystemFacts;
  design: Design;
  paperwork: Record<string, string>;
  electrician: ElectricianFacts | null;
  data: Partial<Record<SlotCode, SlotData>>;
  /** The job's library items (matched by model, plus the ones in every pack). */
  library: LibraryItem[];
  payments: Payment[];
  /** From the solar survey: what shades the roof, and the sun-path photo. */
  survey: { shading: string[]; sunPath: string | null };
  /** Pack items with a current document (F43, F74, F75…): for F78's references and part ticks. */
  made: string[];
  settings: HandoverSettings;
};

/* ── Small helpers ───────────────────────────────────────────────────────── */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "3 November 2026". */
export const longDay = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
/** "3 and 4 November 2026", "30 October to 2 November 2026". */
export function daysWords(days: string[]): string | null {
  if (!days.length) return null;
  if (days.length === 1) return longDay(days[0]);
  const [a, b] = [days[0], days.at(-1)!];
  const sameMonth = a.slice(0, 7) === b.slice(0, 7);
  const first = sameMonth ? String(Number(a.slice(8, 10))) : longDay(a).replace(/ \d{4}$/, a.slice(0, 4) === b.slice(0, 4) ? '' : ` ${a.slice(0, 4)}`);
  return `${first}${days.length === 2 ? ' and ' : ' to '}${longDay(b)}`;
}
const num = (n: number | null | undefined, dp = 2) => (n === null || n === undefined ? null : Number(n.toFixed(dp)).toLocaleString('en-GB'));
const has = (f: HandoverFacts, t: Tech) => f.job.products.includes(t);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const val = (f: HandoverFacts, slot: SlotCode, key: string) => str(f.data[slot]?.values?.[key]);
export const siteAddress = (f: HandoverFacts) => f.job.addressLines.join(', ');
/** "the battery system class, the estimated performance". */
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/** Serial numbers captured on site for one scan key (confirmed ones only; "couldn't read it" left out). */
function serialsOf(values: Record<string, unknown> | undefined, key: string): string[] {
  const v = values?.[key];
  return Array.isArray(v) ? (v as { s?: unknown; unread?: boolean }[]).filter((x) => x && typeof x.s === 'string' && !x.unread).map((x) => String(x.s)) : [];
}

/** The job's equipment, from Job details and the serials the trades scanned. Missing models stay null. */
export function equipmentOf(f: HandoverFacts): Equipment[] {
  const s = f.system;
  const v = f.electrician?.values;
  const out: Equipment[] = [];
  if (has(f, 'solar')) {
    // No panel serials: the roofer doesn't scan them (owner, 21 Oct).
    out.push({ what: 'Solar panels', tech: 'solar', model: s.panel_model, count: s.panel_count, rating: s.kwp ? `${num(s.kwp, 3)} kWp` : null, serials: [] });
    out.push({ what: 'Inverter', tech: 'solar', model: s.inverter_model, count: null, rating: s.inverter_kw ? `${num(s.inverter_kw)} kW` : null, serials: serialsOf(v, 'SN_INV') });
    if (f.design.optimisers) out.push({ what: 'Optimisers', tech: 'solar', model: f.design.optimiser_model, count: serialsOf(v, 'SN_OPT').length || null, rating: null, serials: serialsOf(v, 'SN_OPT') });
  }
  if (has(f, 'battery')) {
    out.push({ what: 'Battery', tech: 'battery', model: s.battery_model, count: null, rating: s.battery_kwh ? `${num(s.battery_kwh)} kWh usable` : null, serials: serialsOf(v, 'SN_BAT') });
    const binv = serialsOf(v, 'SN_BINV');
    if (binv.length) out.push({ what: 'Battery inverter', tech: 'battery', model: null, count: null, rating: null, serials: binv });
  }
  if (has(f, 'ev')) out.push({ what: 'EV charger', tech: 'ev', model: s.ev_charger_model, count: null, rating: null, serials: serialsOf(v, 'SN_EV') });
  if (has(f, 'heatpump')) out.push({ what: 'Heat pump', tech: 'heatpump', model: s.heat_pump_model, count: null, rating: s.heat_pump_kw ? `${num(s.heat_pump_kw)} kW` : null, serials: serialsOf(v, 'SN_HP') });
  return out;
}

/** "12 × JA Solar JAM54S30 solar panels (5.28 kWp)": what was installed, in plain words, from what's recorded. */
export function installedLines(f: HandoverFacts): string[] {
  return equipmentOf(f)
    .filter((e) => e.model || e.rating)
    .map((e) => {
      const what = e.model ? `${e.model} ${e.what === 'Solar panels' ? 'solar panels' : e.what.toLowerCase()}` : e.what;
      const n = e.count && e.count > 1 ? `${e.count} × ` : '';
      return `${n}${what}${e.rating ? ` (${e.rating})` : ''}`;
    });
}

/** Product models on the job (for the library: CC4, CC5). */
export const modelsOf = (f: HandoverFacts) => [...new Set(equipmentOf(f).map((e) => e.model).filter((m): m is string => !!m))];

/** The electrical certificate's reference: the electrician's, or the office's typed one. */
const certRef = (f: HandoverFacts) => val(f, 'F78', 'cert_ref') ?? f.electrician?.certRef ?? null;

/* ── What each document is made from ─────────────────────────────────────── */

export type Made<I> = { ok: true; input: I } | { ok: false; state: 'missing' | 'waiting'; why: string; fix?: Fix; due?: string | null };
const missing = (why: string, fix?: Fix): Made<never> => ({ ok: false, state: 'missing', why, fix });
const waiting = (why: string, fix?: Fix): Made<never> => ({ ok: false, state: 'waiting', why, fix });
const electricianFirst = (f: HandoverFacts) => (f.electrician?.name ? f.electrician.name.split(/\s+/)[0] : null);
const waitElectrician = (f: HandoverFacts) => waiting(electricianFirst(f) ? `Waiting for ${electricianFirst(f)} (electrician) to sign off.` : 'Waiting for the electrician to sign off.');
const signed = (f: HandoverFacts) => !!f.electrician?.signedAt;

/** Every document's header: the job, the customer, the site. */
export type JobHead = { ref: string | null; issued: string; customer: string; address: string[]; postcode: string | null };
const head = (f: HandoverFacts): JobHead => ({ ref: f.job.ref, issued: f.today, customer: f.customer.name, address: f.job.addressLines, postcode: f.job.postcode });

/** F07BI: the cover letter. */
export type CoverInput = JobHead & {
  first: string;
  installed: string[];
  contents: { group: string; items: { title: string; status: string }[] }[];
  refs: [string, string][];
  next: string[];
  owner: string | null;
};

/** How each item reads in the cover letter's contents. */
function coverStatus(v: SlotView): string {
  if (v.state === 'complete' || v.state === 'stale') return 'Enclosed';
  if (v.code === 'CC17') return 'To follow: we register it with MCS within 10 working days of switching your system on';
  if (v.code === 'CC16') return 'To follow, once the MCS certificate is registered';
  if (v.code === 'CC14') return 'To follow from Building Control';
  if (v.code === 'CC13') return 'To follow with your final invoice';
  if (v.code === 'F16E') return 'To follow, once you’ve signed it';
  return 'To follow';
}

export function coverInput(f: HandoverFacts, views: SlotView[]): Made<CoverInput> {
  if (!approved(f.settings, 'cover')) return missing('Approve the cover letter wording in CRM settings.', 'settings');
  const items = views.filter((v) => !v.hidden && v.state !== 'na' && v.code !== 'F07BI');
  const p = f.paperwork;
  const refs: [string, string][] = [];
  if (p.mcs_cert_no) refs.push(['MCS certificate', p.mcs_cert_no]);
  const cert = certRef(f);
  if (cert) refs.push(['Electrical certificate', cert]);
  if (f.job.dno.ref) refs.push(['DNO reference', f.job.dno.ref]);
  if (p.building_regs_ref) refs.push(['Building Control', p.building_regs_ref]);
  if (p.ibg_ref || p.ibg_provider) refs.push(['Guarantee', [p.ibg_provider, p.ibg_ref].filter(Boolean).join(' · ')]);
  const next: string[] = [];
  if (has(f, 'solar'))
    next.push('Apply for the Smart Export Guarantee (SEG) with an energy supplier, so you’re paid for the electricity you export. They’ll ask for your MCS certificate and your export MPAN (your supplier can tell you this).');
  next.push(f.system.monitoring ? `Download the ${f.system.monitoring} app, so you can see what your system is doing.` : 'Download your system’s monitoring app, so you can see what it’s doing. We’ll help you set it up.');
  next.push('Keep this pack safe: you may need it if you sell your home.');
  return {
    ok: true,
    input: {
      ...head(f),
      first: f.customer.first,
      installed: installedLines(f),
      contents: contentsGroups(items).map((g) => ({ group: g.title, items: g.items.map((v) => ({ title: v.title, status: coverStatus(v) })) })),
      refs,
      next,
      owner: f.owner.name,
    },
  };
}

/** F19I: the workmanship warranty, from the owner's term and wording. */
export type WarrantyInput = JobHead & { years: number; start: string; startRule: string; text: string; backedBy: string | null; installed: string[] };
export function warrantyInput(f: HandoverFacts): Made<WarrantyInput> {
  const s = f.settings;
  if (!warrantyReady(s)) return missing('Set the warranty term, start and wording in CRM settings, or upload your own.', 'settings');
  const start = s.warrantyStart === 'commissioning' ? f.job.commissionedOn : f.job.handedOverOn;
  if (!start) return waiting(s.warrantyStart === 'commissioning' ? 'Dated once the system is switched on.' : 'Dated when the pack goes to the customer.');
  const p = f.paperwork;
  return {
    ok: true,
    input: {
      ...head(f),
      years: s.warrantyYears!,
      start,
      startRule: s.warrantyStart,
      text: s.warrantyText,
      backedBy: p.ibg_ref || p.ibg_provider ? [p.ibg_provider, p.ibg_ref ? `policy ${p.ibg_ref}` : null].filter(Boolean).join(', ') : null,
      installed: installedLines(f),
    },
  };
}

/** F16E: the completion of works record, with the customer's own signature. */
export type CompletionInput = JobHead & {
  installDays: string | null;
  commissionedOn: string | null;
  done: string[];
  outstanding: { text: string; by: string | null }[];
  declaration: string;
  signature: CustomerSig;
  installer: string | null;
};
export function completionInput(f: HandoverFacts): Made<CompletionInput> {
  if (!approved(f.settings, 'completion')) return missing('Approve the completion record wording in CRM settings.', 'settings');
  if (!signed(f) && !f.job.commissionedOn) return f.electrician ? waitElectrician(f) : waiting('After the system is switched on.');
  const sig = f.data.F16E?.customer ?? f.electrician?.customer.f16e;
  if (!sig) return waiting(`Waiting for ${f.customer.first || 'the customer'} to sign (on the electrician’s phone or in their portal).`);
  return {
    ok: true,
    input: {
      ...head(f),
      installDays: daysWords(f.job.installDays),
      commissionedOn: f.job.commissionedOn,
      done: installedLines(f),
      outstanding: f.data.F16E?.outstanding ?? [],
      declaration: sig.declaration || DRAFTS.completion.text.replace('{address}', siteAddress(f) || 'my home'),
      signature: sig,
      installer: f.electrician ? [f.electrician.name, f.electrician.company].filter(Boolean).join(', ') : null,
    },
  };
}

/** F47 until Form B's own layout and wording are copied in (D14): the values in the form's order, for copying. */
export type G98Input = JobHead & {
  phone: string | null;
  email: string | null;
  mpan: string;
  isolator: string | null;
  devices: { what: string; model: string | null; installed: string; kw: string | null; kwh: string | null; ena: string | null; serials: string[] }[];
  signature: CustomerSig | null;
};
function enaFor(f: HandoverFacts, model: string | null): string | null {
  if (!model) return null;
  const k = model.toLowerCase().replace(/[\s\-_–—]+/g, '');
  for (const l of f.library) for (const [m, d] of Object.entries(l.details ?? {})) if (m.toLowerCase().replace(/[\s\-_–—]+/g, '') === k && d.ena_id) return d.ena_id;
  return null;
}
export function g98Input(f: HandoverFacts): Made<G98Input> {
  if (!f.job.commissionedOn) return f.electrician && !signed(f) ? waitElectrician(f) : waiting('After the system is switched on.');
  if (!f.system.mpan) return missing('Add the MPAN on Job details.', 'job');
  const devices = equipmentOf(f)
    .filter((e) => e.what === 'Inverter' || e.what === 'Battery' || e.what === 'Battery inverter')
    .map((e) => ({
      what: e.what === 'Inverter' ? 'Solar PV inverter' : e.what === 'Battery' ? 'Battery storage' : 'Battery inverter',
      model: e.model,
      installed: f.job.commissionedOn!,
      kw: e.what === 'Inverter' && f.system.inverter_kw ? `${num(f.system.inverter_kw)} kW` : e.what === 'Battery' && f.design.battery_kw ? `${num(f.design.battery_kw)} kW` : null,
      kwh: e.what === 'Battery' && f.system.battery_kwh ? `${num(f.system.battery_kwh)} kWh` : null,
      ena: enaFor(f, e.model),
      serials: e.serials,
    }));
  return {
    ok: true,
    input: {
      ...head(f),
      phone: f.customer.phone,
      email: f.customer.email,
      mpan: f.system.mpan,
      isolator: val(f, 'F47', 'isolator') ?? str(f.electrician?.values.g98_isolator) ?? null,
      devices,
      signature: f.data.F47?.customer ?? f.electrician?.customer.g98 ?? null,
    },
  };
}

/** The G99 data sheet (an office helper beside F76: never in the customer's pack). */
export type G99Input = JobHead & { phone: string | null; email: string | null; mpan: string | null; exportLimit: string | null; dnoRef: string | null; devices: G98Input['devices'] };
export function g99Input(f: HandoverFacts): Made<G99Input> {
  const devices = equipmentOf(f)
    .filter((e) => e.what === 'Inverter' || e.what === 'Battery')
    .map((e) => ({
      what: e.what === 'Inverter' ? 'Solar PV inverter' : 'Battery storage',
      model: e.model,
      installed: f.job.commissionedOn ?? '',
      kw: e.what === 'Inverter' && f.system.inverter_kw ? `${num(f.system.inverter_kw)} kW` : e.what === 'Battery' && f.design.battery_kw ? `${num(f.design.battery_kw)} kW` : null,
      kwh: e.what === 'Battery' && f.system.battery_kwh ? `${num(f.system.battery_kwh)} kWh` : null,
      ena: enaFor(f, e.model),
      serials: e.serials,
    }));
  return {
    ok: true,
    input: {
      ...head(f),
      phone: f.customer.phone,
      email: f.customer.email,
      mpan: f.system.mpan,
      exportLimit: f.system.export_limit_kw != null ? `${num(f.system.export_limit_kw)} kW` : null,
      dnoRef: f.job.dno.ref,
      devices,
    },
  };
}

/** F48I: shading, performance and maintenance, from the design. The handover never works an estimate out. */
export type ShadingInput = JobHead & { kwh: number; shade: number; note: string; shadingNote: string | null; shading: string[]; sunPath: string | null; source: string };
export function shadingInput(f: HandoverFacts, notes = MIS3002_NOTES): Made<ShadingInput> {
  const need = [f.design.est_kwh_year === null && 'the estimated generation', f.design.shade_factor === null && 'the shade factor'].filter(Boolean) as string[];
  if (need.length) return missing(`Add ${list(need)} from the design on Job details.`, 'job');
  if (!notes.verified) return missing('MIS 3002’s estimate wording has to be copied into the app first. Until then, upload your own F48I.', 'upload');
  return {
    ok: true,
    input: {
      ...head(f),
      kwh: f.design.est_kwh_year!,
      shade: f.design.shade_factor!,
      note: notes.importantNote,
      shadingNote: f.design.shade_factor! < 1 ? notes.shadingNote : null,
      shading: f.survey.shading,
      sunPath: f.survey.sunPath,
      source: `${notes.source} ${notes.issue}`,
    },
  };
}

/** F49: the maintenance schedule. Every interval from somewhere real, or "as the manufacturer's manual says". */
export type ScheduleInput = JobHead & { rows: { item: string; check: string; who: string; often: string; source: string }[] };
export const MANUAL_SAYS = 'As the manufacturer’s manual says (see Manufacturer Information, CC5)';
export function scheduleInput(f: HandoverFacts): Made<ScheduleInput> {
  const rows: ScheduleInput['rows'] = [];
  const next = f.electrician?.nextInspection ?? null;
  rows.push({
    item: 'Electrical installation',
    check: 'Periodic inspection and test of the new circuits',
    who: 'An electrician',
    often: next ? `Within ${next}` : 'As your Electrical Installation Certificate says',
    source: 'Electrical Installation Certificate',
  });
  for (const e of equipmentOf(f)) {
    if (e.tech !== 'solar' && e.tech !== 'battery') continue;
    let found: { every: string; source: string } | null = null;
    if (e.model) {
      const k = e.model.toLowerCase().replace(/[\s\-_–—]+/g, '');
      for (const l of f.library)
        for (const [m, d] of Object.entries(l.details ?? {})) if (!found && d.interval && m.toLowerCase().replace(/[\s\-_–—]+/g, '') === k) found = d.interval;
    }
    rows.push({
      item: e.model ? `${e.what} (${e.model})` : e.what,
      check: e.what === 'Solar panels' ? 'Look for damage, dirt or loose cables (from the ground)' : e.what === 'Battery' ? 'Check it’s charging and discharging in the app' : 'Check it shows no faults',
      who: e.what === 'Solar panels' || e.what === 'Battery' ? 'You' : 'You, then us if there’s a fault',
      often: found ? found.every : MANUAL_SAYS,
      source: found ? found.source : 'Manufacturer',
    });
  }
  for (const r of f.settings.scheduleRows as ScheduleRow[]) rows.push({ ...r, who: r.who || 'Heliaxis', source: 'Heliaxis' });
  return { ok: true, input: { ...head(f), rows } };
}

/** F49A: the maintenance agreement, in the owner's words with the values typed exactly as quoted. */
export const AGREEMENT_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: 'plan', label: 'The plan', hint: 'Its name, as on the quote' },
  { key: 'included', label: 'What’s included' },
  { key: 'visits', label: 'Visits', hint: 'e.g. One a year' },
  { key: 'price', label: 'Price', hint: 'Exactly as quoted' },
  { key: 'starts', label: 'Starts' },
  { key: 'cancel', label: 'How to cancel' },
];
export type AgreementInput = JobHead & { text: string; values: { label: string; value: string }[] };
export function agreementInput(f: HandoverFacts): Made<AgreementInput> {
  if (!f.settings.maintenanceText) return missing('Add your maintenance agreement wording in CRM settings.', 'settings');
  const gaps = AGREEMENT_FIELDS.filter((x) => !val(f, 'F49A', x.key));
  if (gaps.length) return missing(`Type the plan’s details exactly as agreed: ${list(gaps.map((g) => g.label.toLowerCase()))}.`, 'values');
  return { ok: true, input: { ...head(f), text: f.settings.maintenanceText, values: AGREEMENT_FIELDS.map((x) => ({ label: x.label, value: val(f, 'F49A', x.key)! })) } };
}

/** F78: the EESS & PV handover document (FORMS 1.5). */
export type F78Input = JobHead & {
  kind: 'initial' | 'periodic';
  testDate: string;
  eess: { desc: string; cls: number; island: boolean | null; maxKw: number; usableKwh: number; parts: [boolean, boolean, boolean, boolean] } | null;
  pv: { desc: string; kw: number; location: string; est: number; circuits: string | null; insp: string; test: string; f44a: string; f43: string } | null;
  next: string;
  comments: string | null;
  electrician: { name: string; at: string; path: string };
  design: OfficeSig;
};
export const F78_DECLARATION =
  'I/we being the person(s) responsible for the design, construction, inspection and testing of the electrical installation (as indicated by the signatures below), particulars of which are described above, having exercised reasonable skill and care when carrying out the design, construction, inspection and testing, hereby certify that the said work for which I/we have been responsible is, to the best of my/our knowledge and belief, in accordance with MCS Installation Standard MIS 3002 and MIS 3012.';

export function f78Input(f: HandoverFacts): Made<F78Input> {
  const e = f.electrician;
  if (!e?.signedAt || !e.signaturePath) return e ? waitElectrician(f) : missing('Add the electrician on the Site tab: F78 is signed with their sign-off.', 'site');
  const v = e.values;
  const s = f.system;
  const d = f.design;
  const battery = has(f, 'battery');
  const solar = has(f, 'solar');
  const maxKw = d.battery_kw ?? (typeof v.f78_e_kw === 'number' ? v.f78_e_kw : null);
  const need: string[] = [];
  if (battery) {
    if (d.eess_class === null) need.push('the battery system class');
    if (maxKw === null) need.push('the battery’s maximum power output');
    if (!s.battery_kwh) need.push('the battery’s usable capacity');
  }
  if (solar) {
    if (!s.kwp) need.push('the system size (kWp)');
    if (d.est_kwh_year === null) need.push('the estimated performance');
    if (!d.roof_faces && !val(f, 'F78', 'p_loc')) need.push('the roof faces');
  }
  if (need.length) return missing(`Needs ${list(need)} on Job details.`, 'job');
  const made = new Set(f.made);
  if (battery && (!made.has('F74') || !made.has('F75'))) return waiting('Waiting for F74 and F75 from the electrician’s sign-off.');
  if (solar && !made.has('F43')) return waiting('Waiting for F43 from the electrician’s sign-off.');
  const ref = f.job.ref ?? 'HX';
  const cert = certRef(f);
  if (solar && !cert) return missing('Needs the electrical certificate’s number: it’s on the EIC.', 'values');
  const kindRaw = val(f, 'F78', 'kind') ?? str(v.f78_kind);
  if (kindRaw !== 'initial' && kindRaw !== 'periodic') return missing('Say whether it’s an initial or a periodic verification.', 'values');
  // The EIC made in the app gives the next inspection once its design part is signed.
  if (e.certWaits && !e.nextInspection) return missing(e.certWaits, 'site');
  const next = e.nextInspection ?? (f.settings.nextInspectionYears ? `${f.settings.nextInspectionYears} years` : null);
  if (!next) return missing('Set the next inspection (years) in CRM settings: the EIC doesn’t give one.', 'settings');
  const design = f.data.F78?.design;
  if (!design) return missing('Sign the design part.', 'sign-design');
  const optimisers = equipmentOf(f).find((x) => x.what === 'Optimisers');
  const panels = s.panel_model ? `${s.panel_count ? `${s.panel_count} × ` : ''}${s.panel_model}${s.kwp ? ` (${num(s.kwp, 3)} kWp)` : ''}` : null;
  const opt = optimisers ? [optimisers.count ? `${optimisers.count} ×` : null, optimisers.model, 'optimisers'].filter(Boolean).join(' ') : null;
  const pvDesc = val(f, 'F78', 'p_desc') ?? [panels, s.inverter_model, opt].filter(Boolean).join(', ');
  const eDesc = val(f, 'F78', 'e_desc') ?? [s.battery_model ? `${s.battery_model}${s.battery_kwh ? ` (${num(s.battery_kwh)} kWh usable)` : ''}` : null, solar ? null : s.inverter_model].filter(Boolean).join(', ');
  if ((solar && !pvDesc) || (battery && !eDesc)) return missing('Needs the product models on Job details (or type the descriptions).', 'job');
  const island = typeof v.eess_backup === 'string' ? v.eess_backup === 'yes' : (d.battery_backup ?? null);
  return {
    ok: true,
    input: {
      ...head(f),
      kind: kindRaw,
      testDate: f.job.commissionedOn ?? e.signedOn ?? f.today,
      eess: battery ? { desc: eDesc, cls: d.eess_class!, island, maxKw: maxKw!, usableKwh: s.battery_kwh!, parts: [made.has('F74'), made.has('F74'), made.has('F75'), made.has('F75')] } : null,
      pv: solar
        ? {
            desc: pvDesc,
            kw: s.kwp!,
            location: val(f, 'F78', 'p_loc') ?? d.roof_faces!,
            est: d.est_kwh_year!,
            circuits: val(f, 'F78', 'circuits') ?? str(v.f78_p_circuits),
            insp: `${cert}: Schedule of inspections`,
            test: `${cert}: Schedule of test results`,
            f44a: `${ref}-${made.has('F44A') ? 'F44A' : 'F44'}`,
            f43: `${ref}-F43`,
          }
        : null,
      next,
      comments: val(f, 'F78', 'comments'),
      electrician: { name: e.name, at: e.signedAt, path: e.signaturePath },
      design,
    },
  };
}

/** CC4's own page: how to switch this house's system off, from where the switches are. */
export const SWITCH_FIELDS: { key: 'cu' | 'ac' | 'dc' | 'battery'; label: string; hint: string; for?: Tech }[] = [
  { key: 'cu', label: 'Consumer unit circuit', hint: 'Where it is and its label, e.g. Under the stairs, labelled Solar PV' },
  { key: 'ac', label: 'AC isolator', hint: 'e.g. On the wall next to the inverter, in the loft' },
  { key: 'dc', label: 'DC isolator', hint: 'e.g. Built into the inverter', for: 'solar' },
  { key: 'battery', label: 'Battery isolator', hint: 'e.g. On the side of the battery', for: 'battery' },
];
export type SwitchInput = JobHead & { steps: string[]; backup: boolean; procedures: string[] };
export function switchInput(f: HandoverFacts): Made<SwitchInput> {
  if (!approved(f.settings, 'shutdown')) return missing('Approve the switching-off wording in CRM settings.', 'settings');
  const v = f.electrician?.values ?? {};
  const dcSite = Array.isArray(v.f43_iso_loc) ? str((v.f43_iso_loc as unknown[])[0]) : str(v.f43_iso_loc);
  const where: Record<string, string | null> = { cu: val(f, 'CC4', 'cu'), ac: val(f, 'CC4', 'ac'), dc: val(f, 'CC4', 'dc') ?? dcSite, battery: val(f, 'CC4', 'battery') };
  const wanted = SWITCH_FIELDS.filter((x) => !x.for || has(f, x.for));
  const gaps = wanted.filter((x) => !where[x.key]);
  if (gaps.length) {
    if (f.electrician && !signed(f)) return waitElectrician(f);
    return missing(`Say where the switches are: ${list(gaps.map((g) => g.label.toLowerCase()))}.`, 'switches');
  }
  const lines = DRAFTS.shutdown.text.split('\n');
  const steps = lines
    .filter((l) => (!/^3\./.test(l) || has(f, 'solar')) && (!/^4\./.test(l) || has(f, 'battery')))
    .filter((l) => !/back-up power/.test(l) || f.design.battery_backup === true || f.electrician?.values.eess_backup === 'yes')
    .map((l) => l.replace('{cu}', where.cu ?? '').replace('{ac}', where.ac ?? '').replace('{dc}', where.dc ?? '').replace('{battery}', where.battery ?? ''));
  return {
    ok: true,
    input: {
      ...head(f),
      steps,
      backup: f.design.battery_backup === true || f.electrician?.values.eess_backup === 'yes',
      procedures: f.library.filter((l) => l.slot === 'CC4' || l.kind === 'procedure').map((l) => l.name),
    },
  };
}

/** CC13's payment receipt: only the payments recorded, never a balance (D21). */
export type ReceiptInput = JobHead & { lines: { date: string; what: string; method: string; reference: string | null; pence: number }[] };
const METHOD: Record<Payment['method'], string> = { card: 'Card', bank_transfer: 'Bank transfer', other: 'Other' };
const KIND: Record<Payment['kind'], string> = { stage: 'Stage payment', final: 'Final payment', other: 'Payment' };
export function receiptInput(f: HandoverFacts): Made<ReceiptInput> {
  const lines: ReceiptInput['lines'] = [];
  const dep = f.job.deposit;
  if (dep.paidAt && dep.amount && dep.amount > 0) lines.push({ date: dep.paidAt.slice(0, 10), what: 'Deposit', method: 'Card', reference: dep.ref, pence: Math.round(dep.amount * 100) });
  for (const p of [...f.payments].sort((a, b) => (a.paid_on < b.paid_on ? -1 : 1))) lines.push({ date: p.paid_on, what: KIND[p.kind], method: METHOD[p.method], reference: p.reference, pence: p.amount_pence });
  if (!lines.length) return waiting('No payments recorded yet.', 'invoice');
  return { ok: true, input: { ...head(f), lines } };
}

/* ── For copying into other systems (D11): the MCS database and building control ─ */

export type CopyField = { label: string; value: string | null };

/** "Copy for MID": what the MCS Installation Database asks for, in its order, each with a copy button. */
export function midFields(f: HandoverFacts): CopyField[] {
  const eq = equipmentOf(f);
  const out: CopyField[] = [
    { label: 'Installation address', value: siteAddress(f) || null },
    { label: 'Customer', value: f.customer.name || null },
    { label: 'Commissioning date', value: f.job.commissionedOn ? longDay(f.job.commissionedOn) : null },
    { label: 'MPAN', value: f.system.mpan },
  ];
  if (has(f, 'solar')) {
    out.push({ label: 'System size (kWp)', value: f.system.kwp != null ? String(f.system.kwp) : null });
    out.push({ label: 'Estimated generation (kWh a year)', value: f.design.est_kwh_year != null ? String(f.design.est_kwh_year) : null });
  }
  for (const e of eq) {
    out.push({ label: `${e.what}${e.count ? ` (${e.count})` : ''}`, value: e.model });
    if (e.serials.length) out.push({ label: `${e.what}: serial number${e.serials.length > 1 ? 's' : ''}`, value: e.serials.join(', ') });
  }
  return out;
}

/** Notify building control (REGS 1.7): the values the scheme's form asks for. */
export function buildingControlFields(f: HandoverFacts): CopyField[] {
  const what = [has(f, 'solar') && 'solar PV', has(f, 'battery') && 'battery storage', has(f, 'ev') && 'an EV charge point', has(f, 'heatpump') && 'a heat pump supply'].filter(Boolean) as string[];
  return [
    { label: 'Installation address', value: siteAddress(f) || null },
    { label: 'Type of work', value: what.length ? `New circuit for ${list(what)}` : null },
    { label: 'Completion date', value: f.job.commissionedOn ? longDay(f.job.commissionedOn) : null },
    { label: 'Certificate reference', value: certRef(f) },
  ];
}
