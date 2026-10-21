// A solar + battery job as the handover pack sees it, signed off by the electrician and the office, for
// rendering the system summary (HX-HO-02) in test-site-forms-coverage.mjs and test-site-originality.mjs.
// Not a test itself. The caller passes in the modules it loaded.

export function summaryFacts({ H, designOf }, over = {}) {
  const settings = H.cleanHandoverSettings({
    ...H.DEFAULT_HANDOVER_SETTINGS,
    approved: Object.fromEntries(Object.entries(H.DRAFTS).map(([k, d]) => [k, { version: d.version, at: '2026-10-01T09:00:00Z', by: 'Callum' }])),
    nextInspectionYears: 10,
  });
  return {
    today: '2026-11-03',
    job: { id: 'p1', ref: 'HX-0042', title: 'Solar and battery', stage: 'installing', products: ['solar', 'battery'], addressLines: ['12 High Street', 'Maindee', 'Newport', 'NP20 4AB'], postcode: 'NP20 4AB', installDays: ['2026-11-02', '2026-11-03'], commissionedOn: '2026-11-03', handedOverOn: null, dno: { route: 'g98', status: null, ref: null, submittedAt: null, notified: false }, deposit: { amount: 500, paidAt: '2026-10-05T10:00:00Z', ref: 'pi_123' } },
    customer: { name: 'Jane Smith', first: 'Jane', email: 'jane@example.com', phone: '07700 900123' },
    owner: { name: 'Callum Hughes' },
    system: { kwp: 5.28, panel_count: 12, panel_model: 'JA Solar JAM54S30 440', inverter_model: 'GivEnergy Gen 3 5 kW', inverter_kw: 5, battery_model: 'GivEnergy 9.5 kWh', battery_kwh: 9.5, ev_charger_model: null, heat_pump_model: null, heat_pump_kw: null, mpan: '1012345678901', export_limit_kw: null, monitoring: 'GivEnergy' },
    design: designOf({ est_kwh_year: 4620, shade_factor: 0.95, eess_class: 1, battery_kw: 3.6, roof_faces: 'Rear roof', battery_backup: true }),
    paperwork: {},
    electrician: { name: 'Dave Price', company: 'Price Electrical', status: 'done', signedAt: '2026-11-03T17:41:00Z', signedOn: '2026-11-03', signaturePath: 'signatures/p1/site-s1.png', values: { hos_kind: 'initial', eess_backup: 'yes', hos_circuits: '2 PV strings; 1 AC circuit' }, customer: {}, partPBy: 'heliaxis', certRef: 'HX-0042-EIC', nextInspection: null },
    data: { 'HX-HO-02': { design: { name: 'Callum Hughes', signed_at: '2026-11-03T18:00:00Z', path: 'signatures/p1/summary-design.png', by: 'u1' } } },
    library: [],
    payments: [],
    survey: { shading: [], sunPath: null },
    made: ['HX-PV-01', 'HX-PV-02', 'HX-PV-03', 'HX-BAT-01', 'HX-BAT-02', 'HX-HO-04'],
    settings,
    ...over,
  };
}
