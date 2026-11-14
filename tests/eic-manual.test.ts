import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { applyAnswers, makePdf, viewOf, type EicRow, type FieldView, type PropView } from '@/lib/eic-manual/server';

/** A database with nothing in it: the certificate's own answers are all it needs. */
const chain: Record<string, unknown> = {};
for (const m of ['select', 'eq', 'in', 'order', 'limit']) chain[m] = () => chain;
chain.maybeSingle = async () => ({ data: null });
const db = { from: () => chain } as never;
const who = { name: 'Test Electrician' };
// A 1 x 1 PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const row = (over: Partial<EicRow> = {}): EicRow => ({
  id: '11111111-1111-4111-8111-111111111111', number: 'EIC-0001', route: 'eic_single', title: '', enquiry_id: null, project_id: null, address: '9 Test Street, Newport, NP19 7AZ',
  answers: {}, sigs: {}, status: 'draft', issued_on: null, created_at: '', updated_at: '', ...over,
});

const sample = (f: { type: string; options?: { key: string }[]; chips?: number[] }): unknown => {
  switch (f.type) {
    case 'TICK': return 'done';
    case 'YN': case 'YNN': return 'no';
    case 'PF': case 'PFN': return 'pass';
    case 'CONFIRM': return true;
    case 'NUM': return f.chips?.[0] ?? 1;
    case 'SEL': return f.options?.[0]?.key;
    case 'MULTI': return f.options?.[0] ? [f.options[0].key] : [];
    default: return 'x';
  }
};

/** Answer every question the certificate asks, then a board with a circuit, as far as it will go. */
async function fillIn(r: EicRow): Promise<EicRow> {
  let cur = r;
  for (let i = 0; i < 14; i++) {
    const v = await viewOf(db, cur, who);
    const set: Record<string, unknown> = {};
    const fields = v.steps.flatMap((s) => s.fields).filter((f: FieldView) => f.value === undefined && f.type !== 'CUSTOM' && f.type !== 'AUTO');
    for (const f of fields) set[f.key] = sample(f);
    if (v.steps.some((s) => s.key === 'eic-instruments')) set.eic_inst = { mft: 'MFT 123' };
    if (v.boards) {
      if (!v.boards.boards.length) {
        set['eic_db:b-b1'] = { o: 1, ref: 'DB1' };
        set['eic_db:c-c1'] = { board: 'b1', o: 1, n: '1', desc: 'Sockets' };
      }
      for (const b of v.boards.boards) {
        const fillRec = (rec: { id: string; rec: Record<string, unknown>; shown: string[] }, props: PropView[], key: string) => {
          const next = { ...rec.rec } as Record<string, unknown>;
          delete next.id;
          let changed = false;
          for (const p of props) if (rec.shown.includes(p.k) && next[p.k] === undefined) { next[p.k] = sample(p); changed = true; }
          if (changed) set[key] = next;
        };
        fillRec(b, v.boards.props.board, `eic_db:b-${b.id}`);
        for (const c of b.circuits) fillRec(c, [...v.boards.props.details, ...v.boards.props.tests], `eic_db:c-${c.id}`);
      }
    }
    if (!Object.keys(set).length) break;
    cur = { ...cur, answers: applyAnswers(cur.answers, set, []) };
  }
  return cur;
}

describe('manual EIC', () => {
  it('starts with the certificate’s questions and nothing answered', async () => {
    const v = await viewOf(db, row(), who);
    expect(v.steps.map((s) => s.key)).toContain('eic-supply');
    expect(v.complete).toBe(false);
    expect(v.missing.length).toBeGreaterThan(10);
  });

  it('keeps only the certificate’s own keys', () => {
    const a = applyAnswers({}, { eic_earthing: 'tt', other: 'x', 'eic_db:c-ab': { n: '1' } }, []);
    expect(Object.keys(a).sort()).toEqual(['eic_db:c-ab', 'eic_earthing']);
    expect(Object.keys(applyAnswers(a, {}, ['eic_earthing']))).toEqual(['eic_db:c-ab']);
  });

  it('can be completed, signed and made as a final PDF', async () => {
    const done = await fillIn(row());
    const unsigned = await viewOf(db, done, who);
    // Only the signature is left.
    expect(unsigned.missing.map((m) => m.label)).toEqual(['Sign the certificate']);
    const signed = { ...done, sigs: { eic_sig_one: { png: PNG, at: '2026-11-14T10:00:00Z' } } };
    const v = await viewOf(db, signed, who);
    expect(v.complete).toBe(true);
    const made = await makePdf(db, signed, who);
    expect(made.final).toBe(true);
    expect(made.bytes.length).toBeGreaterThan(5000);
    expect(made.name).toContain('EIC-0001');
  });

  it('is a draft PDF while something is missing', async () => {
    const made = await makePdf(db, row(), who);
    expect(made.final).toBe(false);
    expect(made.name).toContain('(draft)');
  });

  it('the three-part certificate also needs its design signed', async () => {
    const done = await fillIn(row({ route: 'eic' }));
    const sigs = { eic_sig_con: { png: PNG, at: '2026-11-14T10:00:00Z' }, eic_sig_ins: { png: PNG, at: '2026-11-14T10:00:00Z' } };
    const v = await viewOf(db, { ...done, sigs }, who);
    expect(v.designNeeded).toBe(true);
    expect(v.complete).toBe(false);
    const design = { name: 'D. Signer', company: 'Heliaxis', address: '1 Road', postcode: 'NP19 7AZ', tel: '01', next_n: 5, next_unit: 'years', departures: null, signed_at: '2026-11-14T10:00:00Z', path: 'manual', by: null };
    const answers = applyAnswers(done.answers, { eic_design: design }, []);
    const full = { ...done, answers, sigs: { ...sigs, eic_design: { png: PNG, at: '2026-11-14T10:00:00Z' } } };
    expect((await viewOf(db, full, who)).complete).toBe(true);
    expect((await makePdf(db, full, who)).final).toBe(true);
  });
});
