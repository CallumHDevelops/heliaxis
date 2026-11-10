/**
 * Browser preview of the admin screens: the real components, wired to an
 * in-memory stand-in for the database and server actions. For looking at the
 * screens and clicking through flows; the real actions are covered by the
 * end-to-end tests. Hash routes: #/letters #/new #/packages #/estimator #/settings #/letter
 */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminShell, type AdminTab } from '@/components/prospectpv/admin/AdminShell';
import { Estimator } from '@/components/prospectpv/admin/Estimator';
import { LetterDetail } from '@/components/prospectpv/admin/LetterDetail';
import { LettersView } from '@/components/prospectpv/admin/LettersView';
import { NewLetterForm } from '@/components/prospectpv/admin/NewLetterForm';
import { PackagesManager } from '@/components/prospectpv/admin/PackagesManager';
import { SettingsPanels } from '@/components/prospectpv/admin/SettingsPanels';
import { LETTER_CSS } from '@/components/prospectpv/letters/letterCss';
import { LetterPages } from '@/components/prospectpv/letters/registry';
import { SAMPLE_EXTRAS, SAMPLE_PACKAGE } from '@/lib/prospectpv/fixtures/sample';
import { estimateSavings, typicalHome } from '@/lib/prospectpv/estimates';
import { buildLetterData, LetterDataError, type AssetUrls } from '@/lib/prospectpv/letterData';
import { manualLetterInputs, maxPanelsOnRoof, parseManualLetter, roofCapacity, scaffoldInputFor } from '@/lib/prospectpv/manualLetter';
import { formToRow, parsePackageForm } from '@/lib/prospectpv/packageForm';
import { readiness } from '@/lib/prospectpv/readiness';
import { estimateScaffolding } from '@/lib/prospectpv/scaffolding';
import type { ActionResult } from '@/lib/prospectpv/server/actionTypes';
import type { ExtraAdminRow, LetterDetail as Letter, LetterListRow } from '@/lib/prospectpv/server/data';
import { coerceSection, SETTINGS_SECTIONS } from '@/lib/prospectpv/settingsSchema';
import { calculatorReady, parseAdminSettings } from '@/lib/prospectpv/settings';
import type { PackageRow } from '@/lib/prospectpv/types';

const ready = new URLSearchParams(location.search).get('demo') === 'ready';
const fontCss = (window as unknown as { __fontCss?: string }).__fontCss ?? '';
const testAccred = (window as unknown as { __accred?: string }).__accred ?? '';

const mkPkg = (over: Partial<PackageRow>): PackageRow => ({ ...SAMPLE_PACKAGE, id: crypto.randomUUID(), ...over });
const blank: Partial<PackageRow> = { panel_model: null, panel_watts: null, esa_inverter_model: null, usable_kwh: null, price_inc_vat: null, monitoring_app: null, warranty_panel_yrs: null, warranty_battery_yrs: null, active: false, battery_module_model: null, battery_module_count: null, mounting: null, warranty_workmanship_yrs: null, short_description: null };

const db = {
  packages: [
    mkPkg({ ...blank, name: 'Essential', min_panels: 8, max_panels: 9, display_order: 1 }),
    mkPkg({ name: 'Home', min_panels: 10, max_panels: 12, display_order: 2 }),
    mkPkg({ ...blank, name: 'Home Plus', min_panels: 13, max_panels: 16, display_order: 3 }),
    mkPkg({ ...blank, name: 'Max', min_panels: 17, max_panels: null, display_order: 4 }),
  ] as PackageRow[],
  extras: SAMPLE_EXTRAS.map((e, i): ExtraAdminRow => ({ id: `x${i}`, key: e.key, name: e.name, description: e.description, price: ready ? e.price : null, active: ready, display_order: i })),
  settings: {
    company: { phone: '01633 965205', website: 'heliaxis.co.uk', registered_details: ready ? 'registered in England and Wales, company no. 00000000, Example House, Newport NP00 0XX' : null, business_address: null, opt_out_url: ready ? 'heliaxis.co.uk/optout' : null, privacy_url: ready ? 'https://heliaxis.co.uk/privacy' : null },
    sender: { name: ready ? 'Sam Example' : null, role: 'Director' },
    'calc.assumptions': ready ? { seg_rate_gbp_per_kwh: 0.15, off_peak_spread_gbp_per_kwh: 0.15, standing_charge_gbp_per_year: 200 } : { seg_rate_gbp_per_kwh: null, off_peak_spread_gbp_per_kwh: null, standing_charge_gbp_per_year: null },
    generation: { yield_kwh_per_kwp: ready ? 890 : null },
    scaffolding: { rate_per_m2_gbp: ready ? 12 : null, fixed_fee_gbp: ready ? 150 : null, min_charge_gbp: ready ? 400 : null, end_return_m: 1, storey_height_m: 2.6, top_lift_m: 1 },
    battery: { module_kwh: 5, module_price_gbp: ready ? 2000 : null, max_kwh: ready ? 30 : null },
    finance: { enabled: false, lender_name: null, fca_wording: null },
    landing: {}, letters: { default_template: 5, remail_window_months: 6, bleed_mm: 0 }, codes: { expiry_months: 12 },
  } as Record<string, Record<string, unknown>>,
  assets: ready ? { accreditations: testAccred } : ({} as Record<string, string>),
  letters: [] as Letter[],
};
const templates = [1, 2, 3, 4, 5].map((n) => ({ template_key: n, name: ['Classic', 'Bold Dark', 'Personal Letter', 'Roof Report', 'Brand Hero'][n - 1]! }));
const settings = () => parseAdminSettings(db.settings);
const assetUrls = () => db.assets as AssetUrls;
const sameDir: ActionResult = { ok: true };

function docHtml(data: Parameters<typeof LetterPages>[0]['data'], key: 1 | 2 | 3 | 4 | 5, sides: ('front' | 'back')[], flex = false) {
  const body = renderToStaticMarkup(<LetterPages data={data} templateKey={key} preview sides={sides} />);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}</style><style>${LETTER_CSS}${flex ? 'html,body{background:#E9E4D8}body{display:flex;gap:24px;width:max-content}' : ''}</style></head><body>${body}</body></html>`;
}

function prepare(raw: Record<string, unknown>) {
  const active = db.packages.filter((p) => p.active);
  const parsed = parseManualLetter(raw, { packageIds: active.map((p) => p.id), templateKeys: [1, 2, 3, 4, 5] });
  if (!parsed.ok) return { ok: false as const, errors: parsed.errors as Record<string, string> };
  const form = parsed.value;
  const pkg = active.find((p) => p.id === form.packageId)!;
  if (form.panelCount < pkg.min_panels) return { ok: false as const, errors: { panelCount: `${pkg.name} starts at ${pkg.min_panels} panels. Choose a smaller package, or check the panel count.` } };
  if (!roofCapacity(form).fits) return { ok: false as const, errors: { panelCount: `A roof of ${form.widthM} × ${form.depthM} m only fits about ${maxPanelsOnRoof(form)} panels. Check the size, or lower the panel count.` } };
  return { ok: true as const, form, pkg };
}
const inputs = (p: { form: Parameters<typeof manualLetterInputs>[0]; pkg: PackageRow }, code: string, mode: 'print' | 'preview') =>
  manualLetterInputs(p.form, { pkg: p.pkg, letterCode: code, baseUrl: 'https://heliaxis.co.uk', now: new Date(), settings: settings(), assets: assetUrls(), mode });

const actions = {
  preview: async (raw: Record<string, unknown>) => {
    const p = prepare(raw);
    if (!p.ok) return p;
    const { data } = buildLetterData(inputs(p, 'PREVIEW2', 'preview'));
    return { ok: true as const, html: docHtml(data, p.form.templateKey, ['front', 'back'], true), missing: readiness({ settings: settings(), hasAccreditations: !!db.assets.accreditations }).blocking };
  },
  create: async (raw: Record<string, unknown>) => {
    const p = prepare(raw);
    if (!p.ok) return p;
    const addr = `${p.form.line1.toLowerCase()}|${p.form.postcode}`;
    if (db.letters.some((l) => `${l.data.address.line1.toLowerCase()}|${l.data.address.postcode}` === addr)) {
      return { ok: false as const, message: 'A letter was already created for this address on today (code ' + db.letters[0]!.code + '). We only write to an address once every 6 months.' };
    }
    try {
      const code = 'K2' + Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[01OI]/g, '7');
      const built = buildLetterData(inputs(p, code, 'print'));
      const id = crypto.randomUUID();
      db.letters.unshift({
        id, code, uprn: -(db.letters.length + 1), templateKey: p.form.templateKey, templateVersion: 1, createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 365 * 864e5).toISOString(), source: 'manual', views: 0, firstViewedAt: null, lastViewedAt: null,
        campaignName: 'Manual letters', data: built.data, packageName: p.pkg.name,
        assessment: { storeys: p.form.storeys, elevation_width_m: scaffoldInputFor(p.form).elevationWidthM, scaffold_est: estimateScaffolding(scaffoldInputFor(p.form), settings().scaffolding).cost, panel_count: p.form.panelCount }, responses: [],
      });
      return { ok: true as const, id, code };
    } catch (e) {
      if (e instanceof LetterDataError) return { ok: false as const, message: 'Some details are still missing, so this letter can’t be created yet.', blocking: readiness({ settings: settings(), hasAccreditations: !!db.assets.accreditations }).blocking };
      throw e;
    }
  },
};

const pkgActions = {
  save: async (raw: Record<string, unknown>): Promise<ActionResult> => {
    const r = parsePackageForm(raw);
    if (!r.ok) return { ok: false, errors: r.errors as Record<string, string> };
    if (db.packages.some((p) => p.name === r.value.name && p.id !== r.value.id)) return { ok: false, message: 'That name is already used. Choose another.' };
    const row = { ...formToRow(r.value), id: r.value.id ?? crypto.randomUUID() } as unknown as PackageRow;
    const i = db.packages.findIndex((p) => p.id === row.id);
    if (i >= 0) db.packages[i] = row; else db.packages.push(row);
    return sameDir;
  },
  duplicate: async (id: string): Promise<ActionResult> => { const p = db.packages.find((x) => x.id === id)!; db.packages.push({ ...p, id: crypto.randomUUID(), name: `${p.name} (copy)`, active: false }); return sameDir; },
  remove: async (id: string): Promise<ActionResult> => { db.packages = db.packages.filter((p) => p.id !== id); return sameDir; },
  saveExtra: async (raw: { id: string; name: string; description: string; price: string | number | null; active: boolean }): Promise<ActionResult> => {
    const price = raw.price === null || raw.price === '' ? null : Number(String(raw.price).replace(/[£,]/g, ''));
    if (raw.active && price === null) return { ok: false, errors: { price: 'Set a price before switching this extra on.' } };
    Object.assign(db.extras.find((x) => x.id === raw.id)!, { name: raw.name, description: raw.description, price, active: raw.active });
    return sameDir;
  },
};

const settingsActions = {
  saveSection: async (id: string, raw: Record<string, unknown>): Promise<ActionResult> => {
    const section = SETTINGS_SECTIONS.find((s) => s.id === id)!;
    const r = coerceSection(section, raw);
    if (!r.ok) return { ok: false, errors: r.errors };
    for (const [k, patch] of Object.entries(r.patches)) db.settings[k] = { ...(db.settings[k] ?? {}), ...patch };
    return sameDir;
  },
  upload: async (fd: FormData): Promise<ActionResult<{ url: string }>> => {
    const f = fd.get('file') as File; const slot = String(fd.get('slot'));
    const url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
    db.assets[slot] = url; return { ok: true, url };
  },
  remove: async (slot: string): Promise<ActionResult> => { delete db.assets[slot]; return sameDir; },
};

function seedLetters() {
  if (!ready) return;
  const addrs = [['12 Transton Road', 'NP19 7AB', 'Home', 5, 2, true], ['3 Moy Road', 'CF24 4HA', 'Home', 2, 0, false], ['88 Alpha Street', 'NP20 4DD', 'Home', 5, 1, false], ['5 Clarence Place', 'NP20 4EH', 'Home', 3, 4, true]] as const;
  addrs.forEach(([line1, postcode, , t, views, booked], i) => {
    const pkg = db.packages.find((p) => p.name === 'Home')!;
    const form = { batchName: '', line1, line2: '', town: 'Newport', postcode, uprn: '', panelCount: 12, packageId: pkg.id, templateKey: t, aspect: 'S' as const, roofShape: 'Pitched' as const, widthM: 9.4, depthM: 7.6, rotationDeg: 0, storeys: 2, annualKwh: 4810, usableAreaM2: null };
    const built = buildLetterData(inputs({ form, pkg }, `K2K${i}M2XA`.replace(/[01OI]/g, '7'), 'print'));
    db.letters.push({
      id: `0000000${i}-0000-0000-0000-000000000000`, code: built.data.letterCode, uprn: -(i + 1), templateKey: t, templateVersion: 1,
      createdAt: new Date(Date.now() - i * 86400e3 * 2).toISOString(), expiresAt: new Date(Date.now() + 300 * 864e5).toISOString(), source: 'manual',
      views, firstViewedAt: views ? new Date(Date.now() - 86400e3).toISOString() : null, lastViewedAt: views ? new Date().toISOString() : null,
      campaignName: 'Manual letters', data: built.data, packageName: 'Home',
      assessment: { storeys: 2, elevation_width_m: 9.4, scaffold_est: 998.16, panel_count: 12 },
      responses: booked ? [{ id: 'r1', type: 'booking', createdAt: new Date().toISOString(), payload: { name: 'Alex Jones', phone: '07700900123', email: 'alex@example.com', best_time: 'Morning', quoted_total: 11450, battery_kwh: 15, extras: [{ name: 'Hot water diverter' }], usage_kwh: 4200, monthly_bill: 140, home_pattern: 'all' } }, { id: 'r0', type: 'qr_scan', createdAt: new Date(Date.now() - 3600e3).toISOString(), payload: {} }] : views ? [{ id: 'r0', type: 'qr_scan', createdAt: new Date().toISOString(), payload: {} }] : [],
    });
  });
}
seedLetters();

const routes: Record<string, AdminTab> = { letters: 'letters', letter: 'letters', new: 'new', packages: 'packages', estimator: 'estimator', settings: 'settings' };

function App() {
  const [, bump] = useState(0);
  const [route, setRoute] = useState(location.hash.replace('#/', '') || 'letters');
  useEffect(() => {
    const h = () => setRoute(location.hash.replace('#/', '') || 'letters');
    addEventListener('hashchange', h);
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a');
      const href = a?.getAttribute('href') ?? '';
      const m = href.match(/^\/admin\/prospectpv\/?([a-z]*)/);
      if (a && m) { e.preventDefault(); location.hash = '#/' + (href.includes('/letters/') ? 'letter' : m[1] || 'letters'); }
    };
    document.addEventListener('click', click);
    return () => { removeEventListener('hashchange', h); document.removeEventListener('click', click); };
  }, []);
  const changed = () => bump((n) => n + 1);
  const s = settings();
  const tab = routes[route.split('?')[0]!] ?? 'letters';
  const rows: LetterListRow[] = db.letters.map((l) => ({ id: l.id, code: l.code, uprn: l.uprn, address: { line1: l.data.address.line1, line2: null, town: l.data.address.town, postcode: l.data.address.postcode }, packageName: l.packageName, panels: l.data.estimate.panelCount, templateKey: l.templateKey, createdAt: l.createdAt, views: l.views, booked: l.responses.some((r) => r.type === 'booking'), source: l.source }));
  const letter = db.letters[0];
  const detail = letter && (() => {
    const savings = estimateSavings(typicalHome(s.inputs), { generationKwh: letter.data.estimate.annualKwh, batteryKwh: letter.data.estimate.batteryKwh, price: letter.data.package.priceIncVat }, s);
    const a = letter.assessment;
    return <LetterDetail letter={letter} previewTemplate={letter.templateKey} frontHtml={docHtml(letter.data, letter.templateKey as 1, ['front'])} backHtml={docHtml(letter.data, letter.templateKey as 1, ['back'])}
      scaffold={a?.elevation_width_m ? estimateScaffolding({ storeys: a.storeys ?? 2, elevationWidthM: a.elevation_width_m, elevations: 1 }, s.scaffolding) : null} savings={savings} generationKwh={letter.data.estimate.annualKwh} calculatorHint={!calculatorReady(s.assumptions)} />;
  })();
  return (
    <AdminShell active={tab}>
      {route.startsWith('letters') || route === '' ? <LettersView rows={rows} total={rows.length} page={1} pageSize={40} filters={{}} hasLetters={rows.length > 0} /> : null}
      {route === 'letter' ? detail : null}
      {route === 'new' ? (
        <>
          <div className="pva-head"><div><h1>New letter</h1><p>Enter an address and roof details. You get a print-ready letter with its own QR code and landing page.</p></div></div>
          <NewLetterForm packages={db.packages.filter((p) => p.active)} templates={templates} settings={s} readiness={readiness({ settings: s, hasAccreditations: !!db.assets.accreditations })} actions={actions} onCreated={() => { location.hash = '#/letter'; }} />
        </>
      ) : null}
      {route === 'packages' ? <PackagesManager packages={db.packages} extras={db.extras} actions={pkgActions} onChanged={changed} canEdit /> : null}
      {route === 'estimator' ? <Estimator key={String(db.settings.scaffolding?.rate_per_m2_gbp)} packages={db.packages} settings={s} canEdit onChanged={changed} actions={{ saveRates: (raw) => settingsActions.saveSection('scaffolding', raw) }} /> : null}
      {route === 'settings' ? <SettingsPanels rawSettings={db.settings} assetUrls={Object.fromEntries(Object.entries(db.assets))} actions={settingsActions} onChanged={changed} canEdit /> : null}
    </AdminShell>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
