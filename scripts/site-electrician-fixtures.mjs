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
    photos: { RF2: 2, RX4p: 1 },
  },
  serials_elsewhere: [],
  voc_tolerance: 10,
  instruments: 'Megger MFT1741+ s/n 1234567',
  name: 'Sam Sparks',
  scheme: 'NAPIT',
  scheme_number: '12345',
  ...over,
});

/** Per-string answers (F43), by string. */
export const PER = {
  f43_module: () => 'Aiko Neostar 2P 450W',
  f43_qty: () => 8,
  f43_spec_voc: () => 395.2,
  f43_spec_isc: () => 13.92,
  f43_ocpd_type: () => 'None fitted',
  f43_ocpd_a: () => 'na',
  f43_ocpd_v: () => 'na',
  f43_ocpd_ka: () => 'na',
  f43_wire_type: (i) => (i ? null : 'H1Z2Z2-K'),
  f43_wire_phase: () => 6,
  f43_wire_earth: () => 'na',
  f43_test_voc: (i) => [394.8, 396.1, 395.5][i] ?? 395,
  f43_test_isc: (i) => [12.71, 12.69, 12.7][i] ?? 12.7,
  f43_irr: (i) => (i ? null : 820),
  f43_polarity: () => 'pass',
  f43_ir_v: (i) => (i ? null : 500),
  f43_ir_pos: () => '>999',
  f43_ir_neg: () => '>999',
  f43_earth_cont: () => 'na',
  f43_iso_a: (i) => (i ? null : 25),
  f43_iso_v: (i) => (i ? null : 1000),
  f43_iso_loc: (i) => (i ? null : 'Built into inverter'),
  f43_iso_func: () => 'pass',
  f43_inv_model: (i) => (i ? null : 'Sigenergy SigenStor EC 6.0 SP'),
  f43_inv_serial: (i) => (i ? null : '110B6002SP0001'),
  f43_inv_func: () => 'pass',
};
/** Answers where the first choice isn't the careful one. */
export const ONE = {
  f43_kind: 'initial',
  f43_strings: 2,
  f43_instruments: 'Megger MFT1741+ s/n 1234567',
  f44_20_kind: 'pitched',
  f44_t2: ['d'],
  eess_backup: 'no',
  // No back-up on this battery: its back-up rows are N/A (one tap on the phone).
  ...Object.fromEntries(['f74_1_17', 'f74_1_18', 'f74_1_19', 'f74_1_20', 'f74_1_21'].map((k) => [k, 'na'])),
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
        if (values[f.key] !== undefined || f.auto) continue;
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
