import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { ukDay } from '@/lib/bank-holidays';
import { logActivity } from '@/lib/crm/server';
import { docFileName } from '@/lib/documents/pdf-kit';
import { saveGenerated } from '@/lib/documents/store';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkDesign } from '@/lib/pvdesign/check';
import { renderDesignPack, DESIGN_CODE } from '@/lib/pvdesign/design-pdf';
import { layoutPanels } from '@/lib/pvdesign/layout';
import { buildHouse, DEFAULT_PITCH_DEG, DEFAULT_STOREYS } from '@/lib/pvdesign/house3d';
import { buildScene, sceneSvg } from '@/lib/pvdesign/render3d';
import { roofFromFootprint } from '@/lib/pvdesign/footprint';
import { osBuildingOutline } from '@/lib/estimator/os-buildings';
import { findPlaces, OsError } from '@/lib/prospectpv/server/osPlaces';
import { loadBook, loadSettings, type BookRow } from '@/lib/pvdesign/server';
import { buildSld } from '@/lib/pvdesign/sld';
import { toBatterySpec, toInverterSpec, toPanelSize, toPanelSpec } from '@/lib/pvdesign/specs';
import { draftQuoteContent, quoteTitle, unsupportedVat } from '@/lib/quotes/from-design';
import { customerRefOf, readQuote, renderQuote } from '@/lib/quotes/server';
import { totalsOf } from '@/lib/quotes/types';
import { gbp, n, priceFromInput, product, s, DESIGN_TOOLS } from './design-tools';
import type { AssistantAction } from './tools';

/**
 * Metis creates the design pack and the draft quote. Both only ever create or version documents: a quote is a draft
 * (status 'draft'), nothing is sent, and every figure comes from the tested design and pricing code.
 */

const str = { type: 'string' } as const;
const nullable = (description: string, type: 'string' | 'number' = 'string') => ({ type: [type, 'null'], description }) as const;
const obj = (properties: Record<string, unknown>) => ({ type: 'object' as const, properties, required: Object.keys(properties), additionalProperties: false });

const designProps = {
  panel_sku: str,
  panel_count: { type: ['integer', 'null'], description: 'Panels to use, or null for as many as fit.' },
  inverter_sku: str,
  battery_sku: nullable('Battery SKU, or null.'),
  battery_count: { type: 'integer', description: 'Battery units/modules (1 if none).' },
  system_type: { type: 'string', enum: ['grid-tied', 'off-grid'] },
  daily_load_kwh: nullable('Off-grid daily use in kWh, or null.', 'number'),
  peak_load_kw: nullable('Off-grid peak load in kW, or null.', 'number'),
  generator_backup: { type: 'boolean' },
};

const pricingProps = (DESIGN_TOOLS.find((t) => t.name === 'price_quote')!.input_schema as { properties: Record<string, unknown> }).properties;

export const QUOTE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'create_design_pack',
    description:
      'Lay out the panels, run the design checks and save a design pack (layout drawing, single-line diagram, checks and one-page specification) to the customer’s job as a document. Always marked indicative, subject to site survey. Use real SKUs from find_product. Report every warning it returns.',
    input_schema: obj({
      project_id: str,
      roof_width_m: { type: 'number', description: 'Usable roof width along the eaves, metres.' },
      roof_height_m: { type: 'number', description: 'Roof height up the slope, metres.' },
      roof_notes: nullable('Roof covering, orientation and pitch as the user gave them, or null.'),
      pitch_deg: nullable('Roof pitch in degrees if the user or a survey gave it, or null to assume 35 (and say it is assumed).', 'number'),
      storeys: { type: ['integer', 'null'], description: 'Storeys of the building if known, or null to assume 2.' },
      face_azimuth_deg: nullable('Compass bearing the panel roof slope faces (180 = south), if known, or null to assume south (and say it is assumed).', 'number'),
      ...designProps,
    }),
  },
  {
    name: 'roof_from_map',
    description:
      'Estimate the roof from Ordnance Survey map data: finds the customer address, reads the building outline and returns the building length and depth, the ridge direction, the direction the best roof slope faces and an estimated slope length for an assumed gable roof. Use this first when the customer has an address, so you can offer the user sizes measured from the map instead of asking for them. The result is an estimate to confirm with the user, not a survey.',
    input_schema: obj({ project_id: str }),
  },
  {
    name: 'create_quote',
    description:
      'Create a DRAFT quote on the customer’s job from priced items (same inputs as price_quote), with the quote PDF saved to the job. Totals and VAT come from the pricing code. Items with no price stay as PRICE REQUIRED lines. The quote is never sent: the user presses Send in HAP. Pass the design inputs too so the design warnings are put in the quote.',
    input_schema: obj({
      project_id: str,
      scope: { type: 'string', description: 'What the job covers, in plain words, from what the user asked for (panels, electrics, installation, etc.).' },
      design_document_id: nullable('The document_id returned by create_design_pack, or null.'),
      panel_sku: nullable('Panel SKU for the design warnings, or null.'),
      panel_count: { type: ['integer', 'null'] },
      inverter_sku: nullable('Inverter SKU, or null.'),
      battery_sku: nullable('Battery SKU, or null.'),
      battery_count: { type: 'integer' },
      system_type: { type: 'string', enum: ['grid-tied', 'off-grid'] },
      daily_load_kwh: nullable('Off-grid daily use in kWh, or null.', 'number'),
      peak_load_kw: nullable('Off-grid peak load in kW, or null.', 'number'),
      generator_backup: { type: 'boolean' },
      ...pricingProps,
    }),
  },
  {
    name: 'get_accessory_kit',
    description: 'The standard accessory kit saved for a product (what "etc." means for that inverter or battery): 4G/comms, CTs and meter, isolators, cabling, mounting, labels. Returns the items with SKUs and whether each has a price. If none is saved, ask the user what to include.',
    input_schema: obj({ primary_sku: str }),
  },
  {
    name: 'save_accessory_kit',
    description: 'Save the standard accessory kit for a product, using only the SKUs and quantities the USER has confirmed. Admins only.',
    input_schema: obj({ primary_sku: str, items: { type: 'array', items: obj({ sku: str, qty: { type: 'number' } }) } }),
  },
];

export const QUOTE_NAMES = new Set(QUOTE_TOOLS.map((t) => t.name));

type ProjectInfo = { id: string; enquiry_id: string; title: string; address: string | null; postcode: string | null; project_ref: string | null; customer: string; email: string | null };

async function loadProject(id: string): Promise<ProjectInfo | string> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return 'Unknown project_id: search for the customer first.';
  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('id, enquiry_id, title, address, postcode, project_ref').eq('id', id).maybeSingle();
  if (!p) return 'Unknown project_id: search for the customer first.';
  const { data: c } = await db.from('enquiries').select('name, email').eq('id', p.enquiry_id as string).maybeSingle();
  return { ...(p as Omit<ProjectInfo, 'customer' | 'email'>), customer: (c?.name as string) || p.title, email: (c?.email as string | null) ?? null };
}

/** A survey that has been completed on this job: until then everything is indicative. */
async function surveyLinked(projectId: string): Promise<boolean> {
  const { data } = await createAdminClient().from('crm_surveys').select('id').eq('project_id', projectId).not('completed_at', 'is', null).limit(1);
  return !!data?.length;
}

type Resolved = { panel: BookRow; inv: BookRow; bat: BookRow | null };
async function resolveProducts(panelSku: string, invSku: string, batSku: string): Promise<Resolved | string> {
  const book = await loadBook([panelSku, invSku, batSku]);
  if ('error' in book) return book.error;
  const panel = product(book.rows, panelSku, 'panel');
  if (typeof panel === 'string') return panel;
  const inv = product(book.rows, invSku, 'inverter');
  if (typeof inv === 'string') return inv;
  let bat: BookRow | null = null;
  if (batSku) {
    const b = product(book.rows, batSku, 'battery');
    if (typeof b === 'string') return b;
    bat = b;
  }
  return { panel, inv, bat };
}

const label = (r: BookRow) => `${r.make} ${r.model}`.trim();

function checkFor(r: Resolved, input: Record<string, unknown>, panelCount: number, minTempC: number) {
  return checkDesign({
    panel: toPanelSpec(r.panel.specs),
    panelCount,
    inverter: toInverterSpec(r.inv.specs),
    battery: r.bat ? toBatterySpec(r.bat.specs) : null,
    batteryCount: Math.max(1, Math.round(n(input.battery_count) ?? 1)),
    systemType: input.system_type === 'off-grid' ? 'off-grid' : 'grid-tied',
    dailyLoadKwh: n(input.daily_load_kwh),
    peakLoadKw: n(input.peak_load_kw),
    generatorBackup: input.generator_backup === true,
    minTempC,
  });
}

export async function runQuoteTool(name: string, input: Record<string, unknown>, me: { id: string; name: string }, actions: AssistantAction[]): Promise<string> {
  const db = createAdminClient();
  switch (name) {
    case 'roof_from_map': {
      const proj = await loadProject(s(input.project_id));
      if (typeof proj === 'string') return proj;
      const query = [proj.address, proj.postcode].filter(Boolean).join(', ');
      if (query.length < 5) return 'This job has no site address or postcode yet, so there is no map to read. Ask the user for the address, or for the roof size.';
      try {
        const hit = (await findPlaces(query))[0];
        if (!hit) return `OS could not find "${query}". Ask the user to confirm the address, or give the roof size.`;
        const ring = await osBuildingOutline({ lat: hit.lat, lng: hit.lng });
        if (!ring) return `No building outline was found on the OS map at ${hit.address}. Ask the user for the roof size.`;
        const est = roofFromFootprint(ring);
        return JSON.stringify({
          source: 'Ordnance Survey building outline',
          matched_address: hit.address,
          building_length_m: est.lengthM,
          building_depth_m: est.depthM,
          ridge_bearing_deg: est.ridgeBearingDeg,
          best_slope_faces_deg: est.faceAzimuthDeg,
          assumed_pitch_deg: est.pitchDeg,
          estimated_roof_face_width_m: est.lengthM,
          estimated_roof_face_slope_length_m: est.slopeLengthM,
          footprint_area_m2: est.footprintAreaM2,
          outline_rectangularity: est.rectangularity,
          warnings: est.warnings,
          note: 'This is an estimate from the map. Tell the user the sizes and direction, say the roof shape and pitch are assumed, and ask them to confirm or correct before using them (the usable panel area is usually less than the whole slope).',
        });
      } catch (e) {
        if (e instanceof OsError && e.kind === 'no_key') return 'Ordnance Survey data is not connected in HAP (no OS key), so I cannot read the building outline. Ask the user for the roof size.';
        return `I could not read the OS map just now (${e instanceof Error ? e.message : 'unknown error'}). Ask the user for the roof size.`;
      }
    }

    case 'create_design_pack': {
      const proj = await loadProject(s(input.project_id));
      if (typeof proj === 'string') return proj;
      const w = n(input.roof_width_m);
      const h = n(input.roof_height_m);
      if (w == null || h == null || w <= 0 || h <= 0) return 'roof_width_m and roof_height_m must be positive numbers (metres).';
      const r = await resolveProducts(s(input.panel_sku), s(input.inverter_sku), s(input.battery_sku));
      if (typeof r === 'string') return r;
      const size = toPanelSize(r.panel.specs);
      if (!size) return `${label(r.panel)} has no panel dimensions (width_mm, height_mm) in the price book, so it can't be laid out. Ask the user for them.`;
      const { design } = await loadSettings();
      const lay = layoutPanels({ roofWidthMm: Math.round(w * 1000), roofHeightMm: Math.round(h * 1000), panel: size, edgeMm: design.edgeMm, gapXMm: design.gapMm, gapYMm: design.gapMm });
      if (lay.best.count === 0) return `No panels fit a ${w} x ${h} m roof once the ${design.edgeMm} mm edge clearance is allowed for. Check the roof size, or the usable area.`;
      const wanted = n(input.panel_count);
      const count = wanted != null && wanted > 0 ? Math.round(wanted) : lay.best.count;
      if (count > lay.best.count) return `Only ${lay.best.count} panels fit, not ${count}. Say so, and ask whether to use ${lay.best.count}.`;
      // Fewer panels than fit: keep the first `count` of the best layout so the drawing shows exactly those.
      const layout = count === lay.best.count ? lay.best : { ...lay.best, count, panels: lay.best.panels.slice(0, count) };
      const check = checkFor(r, input, count, design.minTempC);
      const wp = toPanelSpec(r.panel.specs).wp;
      const kwp = wp != null ? Math.round(wp * count) / 1000 : null;
      const batteryCount = Math.max(1, Math.round(n(input.battery_count) ?? 1));
      const systemType = input.system_type === 'off-grid' ? 'off-grid' : 'grid-tied';
      const sld = buildSld({ systemType, panelCount: count, panelLabel: label(r.panel), kwp, panelsPerString: check.plan?.panelsPerString ?? [], inverterLabel: label(r.inv), batteryLabel: r.bat ? label(r.bat) : null, batteryCount, generator: input.generator_backup === true });
      const inv = toInverterSpec(r.inv.specs);
      const spec: [string, string][] = [
        ['System type', systemType === 'off-grid' ? 'Off-grid (non-MCS)' : 'Grid-tied (MCS)'],
        ['Roof face', `${w} m (eaves) × ${h} m (up the slope)${s(input.roof_notes) ? `; ${s(input.roof_notes)}` : ''}`],
        ['Solar panels', `${count} × ${label(r.panel)}${wp != null ? ` (${wp} W)` : ''}`],
        ['Array size', kwp != null ? `${kwp} kWp` : 'Not known: panel power missing from the price book'],
        ['Layout', layout.kind === 'mixed' ? 'Portrait and landscape rows' : layout.kind],
        ['String configuration', check.plan ? `${check.plan.panelsPerString.length} string${check.plan.panelsPerString.length === 1 ? '' : 's'} of ${check.plan.panelsPerString.join(' + ')} panels` : 'Not confirmed (see checks)'],
        ['Inverter', `${label(r.inv)}${inv.acKw != null ? ` (${inv.acKw} kW AC)` : ''}`],
        ...(r.bat ? ([['Battery', `${batteryCount > 1 ? `${batteryCount} × ` : ''}${label(r.bat)}${check.metrics.usableKwh != null ? ` (${check.metrics.usableKwh} kWh usable)` : ''}`]] as [string, string][]) : []),
        ...(systemType === 'off-grid' ? ([['Generator backup', input.generator_backup === true ? 'Yes' : 'No'], ['Days of autonomy', check.metrics.autonomyDays != null ? `${check.metrics.autonomyDays} (battery only, no solar)` : 'Not stated: daily load not given']] as [string, string][]) : []),
        ['DC/AC ratio', check.metrics.dcAcRatio != null ? String(check.metrics.dcAcRatio) : 'Not calculated'],
      ];
      const linked = await surveyLinked(proj.id);
      const ref = await customerRefOf(proj.enquiry_id);
      // The mock 3D building: a gable roof from the roof face given. What was assumed is said, never hidden.
      const pitchIn = n(input.pitch_deg);
      const pitch = pitchIn != null && pitchIn > 5 && pitchIn < 70 ? pitchIn : DEFAULT_PITCH_DEG;
      const storeysIn = n(input.storeys);
      const storeys = storeysIn != null && storeysIn >= 1 ? Math.round(storeysIn) : DEFAULT_STOREYS;
      const azIn = n(input.face_azimuth_deg);
      const azimuth = azIn != null ? ((azIn % 360) + 360) % 360 : 180;
      const assumed = [
        'Gable roof assumed.',
        pitchIn == null ? `Pitch assumed at ${DEFAULT_PITCH_DEG}°.` : `Pitch ${pitch}° as given.`,
        storeysIn == null ? `${DEFAULT_STOREYS} storeys assumed.` : `${storeys} storey${storeys === 1 ? '' : 's'} as given.`,
        azIn == null ? 'Panel slope assumed to face south.' : `Panel slope faces ${Math.round(azimuth)}° as given.`,
        'Walls, windows and doors are drawn for effect only.',
      ];
      const model = buildHouse({ lengthM: w, slopeLengthM: h, pitchDeg: pitch, storeys, panels: layout.panels });
      const bytes = await renderDesignPack({ house: { model, faceAzimuthDeg: azimuth, assumptions: assumed }, jobRef: ref, customerName: proj.customer, address: [proj.address, proj.postcode].filter(Boolean).join(', ') || null, issued: ukDay(new Date()), systemType, layout, roofWidthMm: Math.round(w * 1000), roofHeightMm: Math.round(h * 1000), panelLabel: label(r.panel), kwp, check, sld, spec, surveyLinked: linked });
      const saved = await saveGenerated(db, proj.id, {
        key: DESIGN_CODE,
        name: docFileName(ref, 'Design pack', 'Indicative system design'),
        bytes,
        inputs: { w, h, pitch, storeys, azimuth, count, panel: r.panel.sku, inv: r.inv.sku, bat: r.bat?.sku ?? null, batteryCount, systemType, load: n(input.daily_load_kwh), peak: n(input.peak_load_kw), gen: input.generator_backup === true, edge: design.edgeMm, gap: design.gapMm, linked },
        category: 'design',
        visible: false,
        by: me.id,
      });
      await logActivity({ enquiryId: proj.enquiry_id, projectId: proj.id, kind: 'system', body: `Design pack drafted by Metis: ${count} panels${kwp != null ? `, ${kwp} kWp` : ''}`, byId: me.id });
      const flagged = check.issues.filter((x) => x.severity !== 'info');
      actions.push({
        kind: 'design',
        label: `Design pack: ${count} panels${kwp != null ? `, ${kwp} kWp` : ''}`,
        href: `/admin/crm/${proj.id}`,
        detail: [linked ? 'Survey linked.' : INDICATIVE_LINE, ...flagged.map((x) => `${x.severity === 'error' ? 'Problem' : 'Warning'}: ${x.message}`)],
        preview: sceneSvg(buildScene(model, { camera: { yawDeg: -32, elevDeg: 24 }, faceAzimuthDeg: azimuth }), { caption: `${count} panels${kwp != null ? `, ${kwp} kWp` : ''} · mock-up`, indicative: !linked }),
        buttons: [{ label: 'Open file', documentId: saved.doc.id }, { label: 'Open in HAP', href: `/admin/crm/${proj.id}` }],
      });
      return JSON.stringify({
        saved: true,
        document_id: saved.doc.id,
        project_id: proj.id,
        panel_count: count,
        max_panels_that_fit: lay.best.count,
        layout: layout.kind,
        kwp,
        design_ok: check.ok,
        issues: check.issues,
        string_plan: check.plan?.panelsPerString ?? null,
        indicative: !linked,
        assumptions: assumed,
        note: 'Report every issue to the user, and say what was assumed for the 3D mock-up (roof shape, pitch, storeys, direction). The design pack is saved on the job, not sent.',
      });
    }

    case 'create_quote': {
      const proj = await loadProject(s(input.project_id));
      if (typeof proj === 'string') return proj;
      const pr = await priceFromInput(input);
      if ('error' in pr) return pr.error;
      const priced = pr.result;
      if (!priced.lines.length) return 'There is nothing to quote: add items, labour or scaffolding.';
      const bad = unsupportedVat(priced);
      if (bad.length) return `The quote builder only supports VAT rates of 0, 5 and 20 per cent, not ${bad.join(', ')}. Ask the user which of those applies.`;

      // Design warnings come from the checking code, so they can't be dropped on the way.
      const { design } = await loadSettings();
      let issues: { severity: 'error' | 'warn' | 'info'; message: string }[] = [];
      let kwp: number | null = null;
      let count: number | null = null;
      if (s(input.panel_sku) && s(input.inverter_sku)) {
        const r = await resolveProducts(s(input.panel_sku), s(input.inverter_sku), s(input.battery_sku));
        if (typeof r === 'string') return r;
        count = Math.max(0, Math.round(n(input.panel_count) ?? 0));
        const check = checkFor(r, input, count, design.minTempC);
        issues = check.issues;
        const wp = toPanelSpec(r.panel.specs).wp;
        kwp = wp != null && count ? Math.round(wp * count) / 1000 : null;
      }
      const linked = await surveyLinked(proj.id);
      const systemType = input.system_type === 'off-grid' ? 'off-grid' : 'grid-tied';
      const first = proj.customer.trim().split(/\s+/)[0] ?? '';
      const content = draftQuoteContent({ customerFirstName: first, systemType, priced, scope: s(input.scope), panelCount: count || null, kwp, designIssues: issues, surveyLinked: linked });
      const validUntil = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
      const { data: row, error } = await db.from('crm_quotes').insert({ project_id: proj.id, enquiry_id: proj.enquiry_id, title: quoteTitle({ systemType, kwp }, proj.customer), content, valid_until: validUntil, created_by: me.id }).select('id, number').single();
      if (error || !row) return `The quote wasn't created: ${error?.message ?? 'no row'}`;
      const q = await readQuote(row.id as string);
      let docId: string | null = null;
      let pdfNote: string | undefined;
      if (q) {
        try {
          const ref = await customerRefOf(proj.enquiry_id);
          const saved = await saveGenerated(db, proj.id, { key: q.number, name: docFileName(ref, 'Quote', q.number), bytes: await renderQuote(q), inputs: { content: q.content, valid_until: q.valid_until, title: q.title }, category: 'quote', visible: false, by: me.id });
          docId = saved.doc.id;
          await db.from('crm_quotes').update({ document_id: docId }).eq('id', q.id);
        } catch (e) {
          pdfNote = `The quote was created but its PDF could not be made yet: ${e instanceof Error ? e.message : 'unknown error'}. Open it in HAP and it will be made when you send it.`;
        }
      }
      await logActivity({ enquiryId: proj.enquiry_id, projectId: proj.id, kind: 'system', body: `Quote ${row.number} drafted by Metis`, byId: me.id });
      const totals = totalsOf(content);
      const missing = priced.lines.filter((l) => l.priceRequired).length;
      const designDoc = s(input.design_document_id);
      actions.push({
        kind: 'quote',
        label: `Quote ${row.number} (draft): ${gbp(totals.gross)} inc VAT`,
        href: `/admin/sales/quotes/${row.id}`,
        detail: [
          [count ? `${count} panels` : null, kwp != null ? `${kwp} kWp` : null, `${gbp(totals.gross)} inc VAT`].filter(Boolean).join(' · '),
          ...(missing ? [`Warning: ${missing} item${missing === 1 ? ' needs' : 's need'} a price (PRICE REQUIRED). Do not send until priced.`] : []),
          ...priced.warnings.map((x) => `Warning: ${x}`),
          ...issues.filter((x) => x.severity !== 'info').map((x) => `${x.severity === 'error' ? 'Problem' : 'Warning'}: ${x.message}`),
          ...(linked ? [] : ['Indicative — subject to site survey.']),
          'Draft only: nothing has been sent.',
        ],
        buttons: [
          { label: 'Open quote', href: `/admin/sales/quotes/${row.id}` },
          ...(docId ? [{ label: 'Open file', documentId: docId }] : []),
          ...(/^[0-9a-f-]{36}$/i.test(designDoc) ? [{ label: 'Open design', documentId: designDoc }] : []),
          { label: 'Generate contract pack', prompt: `Generate the contract pack for quote ${row.number}` },
        ],
      });
      return JSON.stringify({
        created: true,
        status: 'draft',
        quote_number: row.number,
        quote_id: row.id,
        total_inc_vat: gbp(totals.gross),
        net: gbp(totals.net),
        vat: gbp(totals.vat),
        margin_percent: priced.marginPct,
        lines_needing_a_price: missing,
        needs: priced.needs,
        warnings: priced.warnings,
        design_issues: issues.filter((x) => x.severity !== 'info'),
        pdf_saved: !!docId,
        ...(pdfNote ? { pdf_note: pdfNote } : {}),
        note: 'It is a draft. Nothing has been sent to the customer: the user presses Send in HAP. Tell the user the total, panels and kWp, and every warning and missing price.',
      });
    }

    case 'get_accessory_kit': {
      const sku = s(input.primary_sku);
      const { data } = await db.from('pv_settings').select('value').eq('key', 'kits').maybeSingle();
      const kits = (data?.value && typeof data.value === 'object' ? data.value : {}) as Record<string, { sku: string; qty: number }[]>;
      const kit = Array.isArray(kits[sku]) ? kits[sku] : null;
      if (!kit?.length) return `No accessory kit is saved for ${sku}. Ask the user what the standard kit should include (comms/4G dongle, CTs/meter, AC and DC isolators, cabling, mounting, labels), find each with find_product, and offer to save it with save_accessory_kit.`;
      const book = await loadBook(kit.map((k) => k.sku));
      if ('error' in book) return book.error;
      return JSON.stringify(kit.map((k) => ({ sku: k.sku, qty: k.qty, in_price_book: book.rows.has(k.sku), has_price: book.rows.get(k.sku)?.sellPence != null, name: book.rows.get(k.sku) ? label(book.rows.get(k.sku)!) : null })));
    }

    case 'save_accessory_kit': {
      const { data: prof } = await db.from('profiles').select('role, status').eq('id', me.id).maybeSingle();
      if (prof?.role !== 'admin' || prof?.status !== 'approved') return 'Only a HAP admin can save a standard kit. I have used it for this quote; ask an admin to save it so it is there next time.';
      const sku = s(input.primary_sku);
      const raw = Array.isArray(input.items) ? input.items : [];
      const items = raw.map((i) => ({ sku: s((i as Record<string, unknown>)?.sku), qty: n((i as Record<string, unknown>)?.qty) ?? 0 })).filter((i) => i.sku && i.qty > 0);
      if (!sku || !items.length) return 'Give the product and at least one kit item with a quantity.';
      const book = await loadBook([sku, ...items.map((i) => i.sku)]);
      if ('error' in book) return book.error;
      const unknown = [sku, ...items.map((i) => i.sku)].filter((k) => !book.rows.has(k));
      if (unknown.length) return `These are not in the price book, so the kit was not saved: ${unknown.join(', ')}. Add them first.`;
      const { data } = await db.from('pv_settings').select('value').eq('key', 'kits').maybeSingle();
      const kits = (data?.value && typeof data.value === 'object' ? data.value : {}) as Record<string, unknown>;
      const { error } = await db.from('pv_settings').upsert({ key: 'kits', value: { ...kits, [sku]: items }, description: 'Standard accessory kits by primary product SKU (Metis)', updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) return `Not saved: ${error.message}`;
      return JSON.stringify({ saved: true, primary_sku: sku, items: items.length });
    }
  }
  return `Unknown tool ${name}`;
}

const INDICATIVE_LINE = 'Indicative — subject to site survey.';
