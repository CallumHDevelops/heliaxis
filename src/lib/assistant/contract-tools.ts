import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { answersFor, buildSchedule, OG_CODES, type DesignFacts, type OgCode, type PackFacts } from '@/lib/contracts/offgrid';
import { logActivity } from '@/lib/crm/server';
import { saveGenerated } from '@/lib/documents/store';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadSettings } from '@/lib/pvdesign/server';
import { outstanding } from '@/lib/templates/answers';
import { openForm, saveAnswers, type Who } from '@/lib/templates/forms';
import { readApprovals } from '@/lib/templates/approval';
import { legalStatus } from '@/lib/templates/legal';
import { formPdf } from '@/lib/templates/pdf';
import { templateByCode } from '@/lib/templates/registry';
import { formsReady, supabaseStore } from '@/lib/templates/store';
import { readQuote } from '@/lib/quotes/server';
import { totalsOf } from '@/lib/quotes/types';
import { n, s } from './design-tools';
import { checkFor, label, loadProject, resolveProducts, surveyLinked } from './quote-tools';
import type { AssistantAction } from './tools';

/**
 * Metis fills in the off-grid (non-MCS) contract pack: HX-OG-01 to 06. The wording of each document is fixed and awaits
 * legal review; she supplies only the variables (names, address, system, price, payment schedule, dates), through the same
 * forms HAP already has, so the signature lines are HAP's own. She cannot sign, approve or send anything.
 */

const str = { type: 'string' } as const;
const nullable = (description: string, type: 'string' | 'number' = 'string') => ({ type: [type, 'null'], description }) as const;
const obj = (properties: Record<string, unknown>) => ({ type: 'object' as const, properties, required: Object.keys(properties), additionalProperties: false });

export const CONTRACT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'create_offgrid_contract_pack',
    description:
      'Fill in the off-grid (non-MCS) contract pack HX-OG-01 to HX-OG-06 for a quote and save the documents to the customer’s job. Only for a system with NO grid connection: you must have asked the user and confirmed it. The wording is fixed and awaiting legal review (the documents say so and cannot be signed until an admin approves them in HAP); you only supply the variables. The customer signs HX-OG-02 separately. Grid-tied (MCS) jobs use HAP’s existing MCS documents instead; this tool is not for them.',
    input_schema: obj({
      project_id: str,
      quote_number: { type: 'string', description: 'The quote this contract is for, e.g. Q-1042.' },
      confirmed_no_grid_connection: { type: 'boolean', description: 'true only if the user has confirmed that no part of the system connects to the grid or to a grid-connected installation.' },
      customer_type: { type: 'string', enum: ['Consumer', 'Business'] },
      payments: { type: 'array', description: 'The payment schedule, 1 to 4 payments, percentages adding up to 100. Only what the user gave you.', items: obj({ label: str, percent: { type: 'number' }, due: { type: 'string', description: 'When it is due, e.g. "On acceptance", "On delivery" or a date.' } }) },
      panel_sku: str,
      panel_count: { type: 'integer' },
      inverter_sku: str,
      battery_sku: str,
      battery_count: { type: 'integer' },
      daily_load_kwh: nullable('The daily use the system is sized for, kWh, or null.', 'number'),
      peak_load_kw: nullable('Peak load kW, or null.', 'number'),
      generator_backup: { type: 'boolean' },
      design_assumptions: nullable('What the design assumed (from create_design_pack), or null.'),
      panel_warranty_years: nullable('Manufacturer panel warranty, years, if the user told you, else null.', 'number'),
      inverter_warranty_years: nullable('Manufacturer inverter warranty, years, or null.', 'number'),
      battery_warranty_years: nullable('Manufacturer battery warranty, years, or null.', 'number'),
      workmanship_years: nullable('Heliaxis workmanship warranty, years, or null to use HAP’s setting.', 'number'),
      start_early: { type: ['boolean', 'null'], description: 'Consumers only: true/false only if the customer has told the user whether they want work to start within the 14 days; otherwise null.' },
    }),
  },
];

export const CONTRACT_NAMES = new Set(CONTRACT_TOOLS.map((t) => t.name));

export const GRID_WARNING =
  'I can’t make the off-grid pack unless it is confirmed that nothing connects to the grid. If any part of this system connects to a grid-connected installation, it is not off-grid: it needs the grid-tied (MCS) rules (G98/G99 and the DNO), and HAP’s existing MCS documents, which I have not changed. Warn the user plainly, and do not describe it as off-grid.';

export async function runContractTool(name: string, input: Record<string, unknown>, me: { id: string; name: string }, actions: AssistantAction[]): Promise<string> {
  if (name !== 'create_offgrid_contract_pack') return `Unknown tool ${name}`;
  if (input.confirmed_no_grid_connection !== true) return GRID_WARNING;
  const db = createAdminClient();
  if (!(await formsReady(db))) return 'Forms are not set up in HAP yet (supabase/template-documents.sql), so I cannot save the pack.';
  const proj = await loadProject(s(input.project_id));
  if (typeof proj === 'string') return proj;

  // The quote the contract is for.
  const number = s(input.quote_number);
  const { data: qrow } = await db.from('crm_quotes').select('id').eq('project_id', proj.id).eq('number', number).maybeSingle();
  const quote = qrow ? await readQuote(qrow.id as string) : null;
  if (!quote) return `There is no quote ${number || '(none given)'} on this customer’s job. Check the quote number.`;
  const totals = totalsOf(quote.content);
  if (totals.gross <= 0) return `Quote ${number} has no price yet.`;
  const unpriced = quote.content.blocks.flatMap((b) => (b.type === 'items' ? b.lines : [])).filter((l) => /^PRICE REQUIRED\b/i.test(l.description.trim()));
  if (unpriced.length) return `Quote ${number} still has ${unpriced.length} line${unpriced.length === 1 ? '' : 's'} marked PRICE REQUIRED. Price them first: a contract must not be made for an unpriced quote.`;

  // The payment schedule.
  const stages = (Array.isArray(input.payments) ? input.payments : []).map((p) => p as Record<string, unknown>).map((p) => ({ label: s(p.label), percent: n(p.percent) ?? 0, due: s(p.due) }));
  const sched = buildSchedule(totals.gross, stages);
  if (!sched.ok) return `${sched.error} Ask the user for the payment stages (what, what percentage, when).`;

  // The design, recomputed by the checking code so the summary and its warnings are not taken on trust.
  const r = await resolveProducts(s(input.panel_sku), s(input.inverter_sku), s(input.battery_sku));
  if (typeof r === 'string') return r;
  const { design: ds, pricing } = await loadSettings();
  const count = Math.max(0, Math.round(n(input.panel_count) ?? 0));
  const check = checkFor(r, { ...input, system_type: 'off-grid' }, count, ds.minTempC);
  const wp = typeof r.panel.specs.wp === 'number' ? (r.panel.specs.wp as number) : null;
  const batCount = Math.max(1, Math.round(n(input.battery_count) ?? 1));
  const linked = await surveyLinked(proj.id);
  const kwp = wp != null && count ? Math.round(wp * count) / 1000 : null;
  const points = check.issues.filter((i) => i.severity !== 'info').map((i) => i.message).join(' ');
  const designFacts: DesignFacts = {
    panels: `${count} × ${label(r.panel)}`,
    arrayKwp: kwp != null ? `${kwp} kWp` : '',
    layout: 'Indicative: see the design pack',
    strings: check.plan ? `${check.plan.panelsPerString.length} string${check.plan.panelsPerString.length === 1 ? '' : 's'}: ${check.plan.panelsPerString.join(' + ')} panels` : '',
    inverter: label(r.inv),
    battery: r.bat ? `${batCount > 1 ? `${batCount} × ` : ''}${label(r.bat)}` : 'None',
    batteryUsable: check.metrics.usableKwh != null ? `${check.metrics.usableKwh} kWh` : '',
    generator: input.generator_backup === true ? 'Yes: generator input' : 'No',
    dcAc: check.metrics.dcAcRatio != null ? String(check.metrics.dcAcRatio) : '',
    dailyLoad: n(input.daily_load_kwh) != null ? `${n(input.daily_load_kwh)} kWh a day` : '',
    autonomy: check.metrics.autonomyDays != null ? `${check.metrics.autonomyDays} (battery only, no solar)` : '',
    assumptions: s(input.design_assumptions),
    designPoints: points,
    designRef: 'Design pack HX-DS-01 (see the job’s documents)',
    surveyStatus: linked ? 'Survey linked to the job' : 'Not yet surveyed: indicative',
  };
  const facts: PackFacts = {
    customerType: input.customer_type === 'Business' ? 'Business' : 'Consumer',
    quoteRef: quote.number,
    totalPence: totals.gross,
    vatPence: totals.vat,
    schedule: sched.lines,
    design: designFacts,
    warranty: { panelYears: n(input.panel_warranty_years), inverterYears: n(input.inverter_warranty_years), batteryYears: n(input.battery_warranty_years), workmanshipYears: n(input.workmanship_years) ?? (await workmanshipYears()) },
    startEarly: typeof input.start_early === 'boolean' ? input.start_early : null,
  };
  void pricing;

  // One form per document, through HAP's own forms, so the signature lines are HAP's own.
  const store = supabaseStore(db);
  const by: Who = { id: me.id, name: me.name };
  const approvals = await readApprovals(db);
  const now = new Date().toISOString();
  const docs: { code: OgCode; title: string; documentId: string | null; status: string; missing: string[]; note?: string }[] = [];
  for (const code of OG_CODES) {
    const t = templateByCode(code)!;
    await openForm(store, t, proj.id, by);
    const answers = answersFor(code, facts);
    let note: string | undefined;
    if (Object.keys(answers).length) {
      const saved = await saveAnswers(store, t, proj.id, answers, by, 'hap', now);
      if (!saved.ok) note = `Already signed, so not changed: ${saved.why}. Start a revision in HAP to change it.`;
      else if (saved.problems.length) note = saved.problems.join('; ');
    }
    const row = await store.live(proj.id, code);
    const missing = outstanding(t, row?.answers ?? {}).map((f) => f.label);
    let documentId: string | null = null;
    const pdf = await formPdf(db, proj.id, code);
    if (pdf.ok) {
      const saved = await saveGenerated(db, proj.id, { key: code, name: pdf.fileName.replace(/\.pdf$/i, ''), bytes: pdf.bytes, inputs: { answers: row?.answers ?? {}, status: row?.status, legal: legalStatus(t, approvals), revision: row?.revision }, category: 'contract', visible: false, by: me.id });
      documentId = saved.doc.id;
    } else note = [note, pdf.error].filter(Boolean).join(' ');
    docs.push({ code, title: t.title, documentId, status: legalStatus(t, approvals), missing, ...(note ? { note } : {}) });
  }

  await logActivity({ enquiryId: proj.enquiry_id, projectId: proj.id, kind: 'system', body: `Off-grid contract pack (HX-OG-01 to 06) drafted by Metis for quote ${quote.number}`, byId: me.id });
  const draft = docs.some((d) => d.status !== 'approved');
  actions.push({
    kind: 'contract',
    label: `Off-grid contract pack for ${quote.number}${draft ? ': DRAFT, awaiting legal review' : ''}`,
    href: `/admin/crm/${proj.id}`,
    detail: [
      ...(draft ? ['Warning: the wording is awaiting legal review, so the documents are marked DRAFT and cannot be signed until an admin approves them (Legal templates in HAP).'] : []),
      'HX-OG-02 (the Non-MCS Disclosure) is signed separately by the customer.',
      ...docs.filter((d) => d.missing.length).map((d) => `Warning: ${d.code} still needs: ${d.missing.slice(0, 4).join(', ')}${d.missing.length > 4 ? '…' : ''}.`),
      ...docs.filter((d) => d.note).map((d) => `Warning: ${d.code}: ${d.note}`),
      'Drafts only: nothing has been sent or signed.',
    ],
    buttons: [...docs.filter((d) => d.documentId).map((d) => ({ label: d.code, documentId: d.documentId as string })), { label: 'Open in HAP', href: `/admin/crm/${proj.id}` }],
  });
  return JSON.stringify({
    saved: true,
    quote: quote.number,
    total_inc_vat: totals.gross / 100,
    payments: sched.lines.map((l) => ({ what: l.label, percent: l.percent, pence: l.amountPence, due: l.due })),
    documents: docs.map((d) => ({ code: d.code, title: d.title, document_id: d.documentId, legal_status: d.status, still_needs: d.missing, ...(d.note ? { note: d.note } : {}) })),
    design_points: points || null,
    note: 'Tell the user: the pack is saved on the job as drafts marked awaiting legal review; it cannot be signed until an admin approves the wording; the customer signs HX-OG-02 separately; list what each document still needs (for example warranty years, payment details, or the acknowledgements the customer ticks). Nothing has been sent or signed.',
  });
}

/** HAP's setting for the workmanship warranty (pv_settings "pricing", workmanship_warranty_years), or null: never assumed. */
async function workmanshipYears(): Promise<number | null> {
  const { data } = await createAdminClient().from('pv_settings').select('value').eq('key', 'pricing').maybeSingle();
  const v = (data?.value as Record<string, unknown> | null)?.workmanship_warranty_years;
  return typeof v === 'number' && v >= 0 ? v : null;
}
