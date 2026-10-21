// Fixtures for the electrician's pack tests (test-site-electrician.mjs, test-site-forms-coverage.mjs):
// a solar + battery job with its design and the roofer's answers, the rules' context for it, and
// fillAll(), which answers everything a form asks as a careful electrician would (the gate then has
// nothing left). Not a test itself. The caller passes in the modules it loaded (with its own stubs).

export const SYSTEM = { kwp: 7.2, panel_count: 16, panel_model: 'Aiko Neostar 2P 450W', inverter_model: 'Sigenergy SigenStor EC 6.0 SP', battery_model: 'Sigenergy SigenStor BAT 8.0' };
export const DESIGN = { strings_design: [8, 8], optimisers: false, mounting: 'on_roof', roof_faces: 'Rear roof', battery_backup: false };
export const ROOFER = { RF10: 2, RF11: [8, 8], RF13: 'Aiko Neostar 2P 450W', RF14: 49.4, RF7: 'no', RX5: 16, RX1: 'yes', RX2: 'yes', RX4: 'yes' };
export const wrap = (vals, src = 'typed') => Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, { v, src, at: '2026-11-03T10:00:00Z' }]));
export const PNG = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'));

export const facts = (over = {}) => ({
  cert_route: 'own',
  customer_first: 'Jane',
  dno_route: 'g98',
  dno_ref: 'G98-12345',
  export_limit_kw: null,
  inverter_kw: 6,
  battery_kwh: 8,
  ev_model: null,
  heat_pump_model: null,
  survey_battery_spot: 'attached_garage_fire',
  roofer: {
    status: 'done',
    values: ROOFER,
    reads: [{ key: 'RF12', status: 'read', result: { readable: true, problem: null, kind: 'panel', make: 'Aiko', model: 'AIKO-A450', serials: [], panel: { pmax_w: 450, voc_v: 49.4, isc_a: 13.92, vmp_v: 41.2, imp_a: 13.1, max_system_v: 1500 }, battery: null, inverter: null, meter: null } }],
    photos: { RF2: 2, RF3: 3, RX4p: 1 },
  },
  voc_tolerance: 10,
  instruments: 'Megger MFT1741+ s/n 1234567',
  name: 'Sam Sparks',
  scheme: 'NAPIT',
  scheme_number: '12345',
  ...over,
});

/** Per-string answers (the string tests), by string. */
export const PER = {
  pvt_panel: () => 'Aiko Neostar 2P 450W',
  pvt_panels: () => 8,
  pvt_voc_stc: () => 395.2,
  pvt_isc_stc: () => 13.92,
  pvt_fuse: () => 'None fitted',
  pvt_fuse_a: () => 'na',
  pvt_fuse_v: () => 'na',
  pvt_fuse_ka: () => 'na',
  pvt_cable: (i) => (i ? null : 'H1Z2Z2-K'),
  pvt_cable_mm2: () => 6,
  pvt_earth_mm2: () => 'na',
  pvt_voc: (i) => [394.8, 396.1, 395.5][i] ?? 395,
  pvt_isc: (i) => [12.71, 12.69, 12.7][i] ?? 12.7,
  pvt_irr: (i) => (i ? null : 820),
  pvt_polarity: () => 'pass',
  pvt_ir_v: (i) => (i ? null : 500),
  pvt_ir_pos: () => '>999',
  pvt_ir_neg: () => '>999',
  pvt_frame_earth: () => 'na',
  pvt_iso_a: (i) => (i ? null : 25),
  pvt_iso_v: (i) => (i ? null : 1000),
  pvt_iso_where: (i) => (i ? null : 'Built into inverter'),
  pvt_iso_ok: () => 'pass',
  pvt_inv: (i) => (i ? null : 'Sigenergy SigenStor EC 6.0 SP'),
  pvt_inv_serial: (i) => (i ? null : '110B6002SP0001'),
  pvt_inv_ok: () => 'pass',
};
/** Answers where the first choice isn't the careful one. */
export const ONE = {
  pvt_kind: 'initial',
  pvt_strings: 2,
  pvt_tester: 'Megger MFT1741+ s/n 1234567',
  pvi_mount: 'on_roof',
  // Connected metal rails, but none of the three conditions: a functional earth only where asked.
  pvi_frame_metal: 'yes',
  pvi_frame_ext: 'no',
  pvi_frame_exp: 'no',
  pvi_frame_lp: 'no',
  eess_backup: 'no',
  // No back-up on this battery: its back-up rows are N/A (one tap on the phone).
  ...Object.fromEntries(['bat_bu_isolate', 'bat_bu_electrode', 'bat_bu_rcd', 'bat_bu_spd', 'bat_bu_load'].map((k) => [k, 'na'])),
  bat_inv_sep: 'no',
  SN_METER: 'yes',
  EF2: 'yes',
  EP26r: 1234.5,
  ev_earthing: 'tncs_pme',
  ev_openpen: 'device_charger',
  ev_rcd: 'Type A RCD, 6 mA DC detection (RDC-DD) in the charger',
  ev_spd: 'assessed',
  ev_load: 'no',
  ev_maxdemand: 52,
  ev_fuse: 80,
  ev_online: 'yes',
  ev_dno: 'notify',
  hp_phase: 'single',
  hp_ir_le: '>999',
  hp_ir_ln: '>999',
  hp_csa: 6,
  CERT_TYPE: 'eic',
  CERT_NO: '00123456',
  CERT_SCHEME: 'NAPIT 12345',
};

export function makeFixtures({ R, F, designOf }) {
  const ctxOf = (products, values = {}, photos = {}, el = {}, design = DESIGN) =>
    R.makeCtx({ trade: 'electrician', answers: wrap(values), design: designOf(design), system: SYSTEM, products, sides: [], photos, reads: [], address: '12 High Street, Maindee, Newport, NP20 4AB', signed: [], el: facts(el) });
  const formFor = (products, design = DESIGN) => F.schemaFor({ trade: 'electrician', forms: F.formsFor(products, designOf(design)) })[0];
  let serial = 0;
  function valueFor(f, c) {
    if (f.key in ONE) return ONE[f.key];
    // Which certificate: the office's choice, as offered (the EIC's own tests cover changing it).
    if (f.key === 'eic_route') return f.suggest(c).v;
    if (f.perString) return Array.from({ length: R.stringsOf(f, c) }, (_, i) => (PER[f.key] ? PER[f.key](i) : 'x'));
    switch (f.type) {
      case 'TICK':
        return 'done';
      case 'PFN':
      case 'PF':
        return 'pass';
      case 'YNN':
      case 'YN':
        return 'yes';
      case 'CONFIRM':
        return true;
      case 'SEL':
        return f.options[0].key;
      case 'MULTI':
        return [f.options[0].key];
      case 'SCAN':
        return [{ s: `SER${String(++serial).padStart(6, '0')}`, src: 'scan' }];
      case 'NUM':
        return f.unit === 'V' ? 240.1 : f.unit === 'MΩ' ? '>999' : f.unit === 'Ω' ? 0.42 : Math.max(1, f.min ?? 1) + 1;
      default:
        return `Answer for ${f.key}`;
    }
  }
  /** Answer every must and should the form asks (photos to their minimum); worked-out rows work themselves out. */
  function fillAll(form, products, el = {}, start = {}, design = DESIGN) {
    const values = { ...start };
    const photos = {};
    for (let round = 0; round < 8; round++) {
      const c = ctxOf(products, values, photos, el, design);
      let changed = false;
      const later = [];
      for (const { f } of R.allVisible(form, c)) {
        if (f.level === 'optional' || f.type === 'SIG' || f.type === 'AUTO') continue;
        if (f.type === 'PHOTOS') {
          for (const slot of R.slotsOf(f, c)) {
            const need = Math.max(1, R.needOf(f, c));
            if ((photos[slot] ?? 0) < need) {
              photos[slot] = need;
              changed = true;
            }
          }
          continue;
        }
        if (values[f.key] !== undefined) continue;
        // Worked out (or waiting to be): left to the form.
        if (f.auto) {
          if (!f.autoWaits?.(c) && f.auto(c) === undefined) later.push(f);
          continue;
        }
        values[f.key] = valueFor(f, c);
        changed = true;
      }
      // A row worked out only sometimes (the roof's fire performance, on a roof): answered once the rest is.
      if (!changed)
        for (const f of later) {
          values[f.key] = valueFor(f, c);
          changed = true;
        }
      if (!changed) break;
    }
    return { values, photos };
  }
  const input = (ctx) => ({ jobRef: 'HX-0042', address: ['12 High Street', 'Maindee', 'Newport', 'NP20 4AB'], customer: 'Jane Smith', engineer: 'Sam Sparks', company: 'Sparks Electrical', date: '2026-11-03', signedAt: '2026-11-03T17:41:00Z', signature: PNG, ctx });
  return { ctxOf, formFor, fillAll, input };
}

/** A PDF's text, page by page (pdf.js). */
export async function textOf(pdfjs, bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) pages.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' '));
  return pages;
}
export const flat = (pages) => pages.join(' ').replace(/\s+/g, ' ');
