// Test data for the electrician's certificate (scripts/test-site-eic*.mjs): solar PV and a battery added
// to a home's existing consumer unit (PME, 100 A cut-out): two new radial circuits on RCBOs for the
// inverters and a garage ring with an AFDD, a T2 SPD at the board, instruments and both signatures, as
// answers. The readings hang together (Zs = Ze + R1 + R2; a ring's R1 + R2 = (r1 + r2) ÷ 4), the max Zs
// figures are the ones worked out for each device (its source in Remarks, as footnote § asks), and the
// inverters were isolated for the insulation test (Remarks, as the form asks). Test data only, never
// shown to anyone.
import zlib from 'node:zlib';

export const INSPECTIONS_NA = ['5.0', '12.0', '13.0'];

export const a = (v, src = 'typed') => ({ v, src, at: '2026-11-03T15:00:00Z' });
// The existing board's first free way is 7, so the new circuits are 7, 8 and 9.
export const board = { o: 1, ref: 'DB1', loc: 'Under the stairs', from: 'Origin', free: 7, ocpd_bs: '88-3', ocpd_type: 'gG', ocpd_a: 100, spd: ['T2'], rcd: 'no', zdb: 0.23, ipf: 1.8, pol: true, spd_ok: 'yes' };
/** What zsCalculated says for each device (scripts/test-site-eic.mjs checks they still agree). */
export const ZS_SRC = {
  B32: 'Max Zs calculated: U0 × Cmin ÷ Ia = 230 × 0.95 ÷ 160 = 1.37 Ω (type B: Ia = 5 × In)',
  B20: 'Max Zs calculated: U0 × Cmin ÷ Ia = 230 × 0.95 ÷ 100 = 2.19 Ω (type B: Ia = 5 × In)',
};
export const details = (n, desc, extra = {}) => ({
  board: 'b1',
  o: n,
  n: String(n),
  desc,
  wiring: 'A',
  ref: 'C',
  points: 1,
  csa_live: 6,
  csa_cpc: 2.5,
  ocpd_bs: '61009-1',
  ocpd_type: 'B',
  ocpd_a: 32,
  ocpd_ka: 6,
  zs_max: 1.37,
  zs_src: ZS_SRC.B32,
  rcd: 'yes',
  rcd_bs: '61009-1',
  rcd_type: 'A',
  rcd_idn: 30,
  rcd_a: 32,
  afdd: 'no',
  ...extra,
});
export const tests = { ring: 'no', r12: 0.31, ir_v: 500, ir_ll: '>999', ir_le: '>999', pol: true, zs: 0.52, rcd_ms: 21, rcd_btn: 'pass' };
export function full(INSPECTIONS, KEY) {
  return {
    eic_route: a('eic'),
    eic_work: a('addition'),
    eic_earthing: a('tn_c_s_pme'),
    eic_live: a('ac_1p2w'),
    eic_polarity: a(true),
    eic_u0: a(230),
    eic_f: a(50),
    eic_ipf: a(1.9),
    eic_ipf_how: a('measured'),
    eic_ze: a(0.21),
    eic_ze_how: a('measured'),
    eic_sup_bs: a('88-3'),
    eic_sup_type: a('gG'),
    eic_sup_a: a(100),
    eic_sup_ka: a(33),
    eic_other: a('yes'),
    eic_src: a(['Solar PV, 5.28 kWp, inverter GivEnergy Gen 3 5 kW', 'Battery storage, GivEnergy 9.5 kWh']),
    eic_means: a('distributor'),
    eic_md: a(60),
    eic_md_unit: a('A'),
    eic_ec_mat: a('copper'),
    eic_ec_csa: a(16),
    eic_ec_ok: a(true),
    eic_mb_mat: a('copper'),
    eic_mb_csa: a(10),
    eic_mb_ok: a(true),
    eic_b_water: a('yes'),
    eic_b_gas: a('yes'),
    eic_b_oil: a('na'),
    eic_b_steel: a('na'),
    eic_b_lightning: a('na'),
    eic_b_other: a('na'),
    eic_ms_loc: a('Consumer unit, under the stairs'),
    eic_ms_bs: a('60947-3'),
    eic_ms_poles: a(2),
    eic_ms_a: a(100),
    eic_ms_v: a(230),
    eic_ms_ocpd: a('no'),
    eic_ms_rcd: a('no'),
    ...Object.fromEntries(INSPECTIONS.map((it, i) => [KEY(i), a(INSPECTIONS_NA.includes(it.n) ? 'na' : 'done')])),
    'eic_db:b-b1': a(board),
    'eic_db:c-c1': a({ ...details(7, 'Solar PV inverter supply'), ...tests, remarks: 'Inverter isolated for the insulation resistance test' }),
    'eic_db:c-c2': a({
      ...details(8, 'Battery inverter supply', { ocpd_a: 20, csa_live: 4, csa_cpc: 1.5, zs_max: 2.19, zs_src: ZS_SRC.B20, rcd_a: 20 }),
      ...tests,
      r12: 0.34,
      zs: 0.55,
      rcd_ms: 19,
      remarks: 'Battery inverter isolated for the insulation resistance test',
    }),
    'eic_db:c-c3': a({ ...details(9, 'Sockets: garage', { ref: 'C', points: 4, csa_live: 2.5, csa_cpc: 1.5, afdd: 'yes' }), ...tests, ring: 'yes', r1: 0.42, rn: 0.42, r2: 0.7, r12: 0.28, zs: 0.49, rcd_ms: 23, afdd_btn: 'pass' }),
    eic_inst: a({ mft: 'Megger MFT1741 · 101234567' }),
    eic_cmt: a(['no_rcd']),
    eic_client: a('Jane Smith', 'job'),
    eic_client_addr: a('12 High Street, Maindee, Newport, NP20 4AB', 'job'),
    eic_desc: a('Installation of solar PV (5.28 kWp) and battery storage', 'job'),
    eic_extent: a('New circuits: Solar PV inverter supply (DB1 circuit 7); Battery inverter supply (DB1 circuit 8); Sockets: garage (DB1 circuit 9). A T2 surge protective device added to DB1.'),
    eic_dep: a('no'),
    eic_exc: a('no'),
    eic_sig_name: a('Dave Price', 'job'),
    eic_sig_co: a('Price Electrical Ltd', 'job'),
    eic_sig_addr: a('4 Mill Lane, Cwmbran', 'job'),
    eic_sig_pc: a('NP44 1AA', 'job'),
    eic_sig_tel: a('07700 900123', 'job'),
  };
}
export const FACTS = {
  route: 'eic',
  ref: 'HX-0042-EIC',
  client: 'Jane Smith',
  contact: { name: 'Dave Price', company: 'Price Electrical Ltd', mobile: '07700 900123', email: null, address: '4 Mill Lane, Cwmbran', postcode: 'NP44 1AA', scheme: 'NAPIT', scheme_number: '12345' },
  instruments: { mft: 'Megger MFT1741 · 101234567' },
};

// A signature to print: a scribble drawn into a small PNG (transparent, dark ink), as the pad makes.
export function scribble() {
  const { deflateSync, crc32 } = zlib;
  const w = 300;
  const h = 90;
  const px = new Uint8Array(w * h * 4);
  for (let x = 10; x < w - 10; x++) {
    const y = Math.round(45 + 26 * Math.sin(x / 17) * Math.cos(x / 41));
    for (let t = -1; t <= 1; t++) px.set([26, 26, 58, 255], ((y + t) * w + x) * 4);
  }
  const raw = new Uint8Array(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) raw.set(px.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'latin1');
    Buffer.from(data).copy(out, 8);
    out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'latin1'), Buffer.from(data)])) >>> 0, 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0))]));
}
