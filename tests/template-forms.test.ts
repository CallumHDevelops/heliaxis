import { describe, expect, it } from 'vitest';
import { feedForSimpliHeat, openForm, receiveSimpliHeat, reviseForm, saveAnswers, signLine, type FormRow, type FormStore, type Who } from '@/lib/templates/forms';
import { outstanding } from '@/lib/templates/answers';
import { CYLINDER_COMMISSIONING, HEAT_PUMP_COMMISSIONING } from '@/lib/templates/seed/heat-pump';

const P = '00000000-0000-0000-0000-000000000001';
const T = HEAT_PUMP_COMMISSIONING;
const sam: Who = { id: 'u1', name: 'Sam Patel' };
let clock = 0;
const tick = () => `2026-11-06T10:${String(clock++).padStart(2, '0')}:00.000Z`;

/** An in-memory store with the database's rules, and a hook to simulate someone else saving in between. */
function memory() {
  const rows = new Map<string, FormRow>();
  let n = 0;
  const hooks = { beforeUpdate: null as null | (() => void) };
  const store: FormStore = {
    async live(project, code) {
      return [...rows.values()].find((r) => r.project_id === project && r.template_code === code && r.status !== 'superseded') ?? null;
    },
    async insert(r) {
      if ([...rows.values()].some((x) => x.project_id === r.project_id && x.template_code === r.template_code && x.status !== 'superseded')) return 'exists';
      const row: FormRow = { id: `id-${++n}`, project_id: r.project_id, template_code: r.template_code, issue: r.issue, revision: 1, status: 'draft', answers: {}, provenance: {}, signed: {}, signed_at: null, created_at: tick(), updated_at: tick() };
      rows.set(row.id, row);
      return row;
    },
    async update(id, seen, patch) {
      hooks.beforeUpdate?.();
      hooks.beforeUpdate = null;
      const cur = rows.get(id);
      if (!cur || cur.updated_at !== seen) return null;
      if (cur.status === 'signed' && (patch.answers || patch.provenance)) throw new Error('signed');
      const next = { ...cur, ...patch, updated_at: tick() };
      if (patch.status === 'signed') next.signed_at = tick();
      rows.set(id, next);
      return next;
    },
    async revise(id) {
      const old = rows.get(id)!;
      rows.set(id, { ...old, status: 'superseded' });
      const row: FormRow = { ...old, id: `id-${++n}`, revision: old.revision + 1, status: 'draft', signed: {}, signed_at: null, created_at: tick(), updated_at: tick() };
      rows.set(row.id, row);
      return row.id;
    },
    async get(id) {
      return rows.get(id) ?? null;
    },
  };
  return { store, rows, hooks };
}

/** Answer everything that is asked, going round again as answers open up more questions. */
const answerAll = async (store: FormStore, who = sam) => {
  for (let i = 0; i < 4; i++) {
    const row = await openForm(store, T, P, who);
    const patch = Object.fromEntries(outstanding(T, row.answers).map((f) => [f.key, f.kind === 'number' ? 1 : f.kind === 'yesno' ? 'yes' : f.kind === 'choice' ? f.options![0] : f.kind === 'date' ? '2026-11-06' : 'x']));
    if (!Object.keys(patch).length) return;
    await saveAnswers(store, T, P, patch, who, 'hap', tick());
  }
};

describe('opening a form', () => {
  it('starts one draft per project and form, and gives the same one back', async () => {
    const { store, rows } = memory();
    const a = await openForm(store, T, P, sam);
    const b = await openForm(store, T, P, sam);
    expect(b.id).toBe(a.id);
    expect(rows.size).toBe(1);
    expect(a.status).toBe('draft');
  });
  it('reads the one that was just made when two open it at once', async () => {
    const { store } = memory();
    const [a, b] = await Promise.all([openForm(store, T, P, sam), openForm(store, T, P, { id: null, name: 'SimpliHeat' })]);
    expect(a.id).toBe(b.id);
  });
});

describe('saving answers', () => {
  it('keeps the answer and who entered it', async () => {
    const { store } = memory();
    const r = await saveAnswers(store, T, P, { hpModel: 'EH-8', hpType: 'Air source (ASHP)' }, sam, 'hap', tick());
    expect(r.ok && r.row.answers.hpModel).toBe('EH-8');
    expect(r.ok && r.row.provenance.hpModel.by).toBe('Sam Patel');
    expect(r.ok && r.changed.sort()).toEqual(['hpModel', 'hpType']);
  });
  it('reports what it could not take, and still takes the rest', async () => {
    const { store } = memory();
    const r = await saveAnswers(store, T, P, { hpModel: 'EH-8', maxFlowTemp: 'hot', nope: 1 }, sam, 'hap', tick());
    expect(r.ok && r.row.answers.hpModel).toBe('EH-8');
    expect(r.ok && r.problems.length).toBe(1);
    expect(r.ok && r.unknown).toEqual(['nope']);
  });
  it('does not lose either answer when someone else saves in between', async () => {
    const { store, rows, hooks } = memory();
    const first = await saveAnswers(store, T, P, { hpModel: 'EH-8' }, sam, 'hap', tick());
    const id = first.ok ? first.row.id : '';
    let clashes = 0;
    // After this save has read the form and before it writes, SimpliHeat's push lands: the record moves on under it.
    hooks.beforeUpdate = () => {
      clashes++;
      const cur = rows.get(id)!;
      rows.set(id, { ...cur, answers: { ...cur.answers, hpSerial: 'SN1' }, provenance: { ...cur.provenance, hpSerial: { by: 'SimpliHeat', at: tick(), source: 'simpliheat' } }, updated_at: tick() });
    };
    const r = await saveAnswers(store, T, P, { manufacturer: 'Example' }, sam, 'hap', tick());
    expect(clashes).toBe(1);
    expect(r.ok && r.row.answers).toEqual({ hpModel: 'EH-8', hpSerial: 'SN1', manufacturer: 'Example' });
    expect(rows.get(id)!.answers).toEqual({ hpModel: 'EH-8', hpSerial: 'SN1', manufacturer: 'Example' });
  });
  it('gives up with a clear message if the form keeps moving under it', async () => {
    const { store, rows, hooks } = memory();
    const first = await saveAnswers(store, T, P, { hpModel: 'EH-8' }, sam, 'hap', tick());
    const id = first.ok ? first.row.id : '';
    const original = store.update.bind(store);
    store.update = async (...a) => {
      rows.set(id, { ...rows.get(id)!, updated_at: tick() });
      return original(...a);
    };
    void hooks;
    await expect(saveAnswers(store, T, P, { manufacturer: 'Example' }, sam, 'hap', tick())).rejects.toThrow(/Someone else is saving/);
  });
  it('is locked once signed', async () => {
    const { store } = memory();
    await answerAll(store);
    await signLine(store, T, P, 'technician', { name: 'A. Engineer' }, sam, 'hap', tick());
    const r = await saveAnswers(store, T, P, { hpModel: 'changed' }, sam, 'hap', tick());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.why).toContain('signed');
  });
});

describe('signing', () => {
  it('cannot be signed while questions are left, and says how many', async () => {
    const { store } = memory();
    await saveAnswers(store, T, P, { hpType: 'Air source (ASHP)' }, sam, 'hap', tick());
    const r = await signLine(store, T, P, 'technician', { name: 'A. Engineer' }, sam, 'hap', tick());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.why).toMatch(/\d+ questions are still to answer/);
  });
  it('makes the form the record when the first line signs, then lets the customer sign once', async () => {
    const { store } = memory();
    await answerAll(store);
    const tech = await signLine(store, T, P, 'technician', { name: 'A. Engineer', image: 'data:image/png;base64,AAAA' }, sam, 'device', tick());
    expect(tech.ok && tech.row.status).toBe('signed');
    expect(tech.ok && tech.row.signed.technician.image).toBeDefined();
    const cust = await signLine(store, T, P, 'customer', { name: 'A. Customer' }, { id: null, name: null }, 'remote', tick());
    expect(cust.ok && cust.row.signed.customer.source).toBe('remote');
    expect(cust.ok && cust.row.signed.technician.name).toBe('A. Engineer');
    const again = await signLine(store, T, P, 'customer', { name: 'Someone' }, sam, 'hap', tick());
    expect(!again.ok && again.why).toContain('already signed');
  });
  it('wants the first signature before the customer’s', async () => {
    const { store } = memory();
    await answerAll(store);
    const r = await signLine(store, T, P, 'customer', { name: 'A. Customer' }, sam, 'hap', tick());
    expect(!r.ok && r.why).toContain('first signature');
  });
  it('refuses an unknown line, no name, and a signature that is not a PNG', async () => {
    const { store } = memory();
    expect((await signLine(store, T, P, 'nobody', { name: 'A' }, sam, 'hap', tick())).ok).toBe(false);
    expect((await signLine(store, T, P, 'technician', { name: ' ' }, sam, 'hap', tick())).ok).toBe(false);
    expect((await signLine(store, T, P, 'technician', { name: 'A', image: 'data:text/html;base64,AAAA' }, sam, 'hap', tick())).ok).toBe(false);
  });
});

describe('revising', () => {
  it('starts the next revision as a draft from the answers, and leaves the signed one as it was', async () => {
    const { store, rows } = memory();
    await answerAll(store);
    await signLine(store, T, P, 'technician', { name: 'A. Engineer' }, sam, 'hap', tick());
    const r = await reviseForm(store, T, P, sam);
    expect(r.ok && r.row.revision).toBe(2);
    expect(r.ok && r.row.status).toBe('draft');
    expect(r.ok && r.row.answers.hpModel).toBe('x');
    expect([...rows.values()].filter((x) => x.status === 'superseded').length).toBe(1);
  });
  it('only revises a signed form', async () => {
    const { store } = memory();
    await openForm(store, T, P, sam);
    const r = await reviseForm(store, T, P, sam);
    expect(!r.ok && r.why).toContain('Only a signed form');
  });
});

describe('taking in what SimpliHeat holds', () => {
  const sh = (answers: Record<string, string | number | boolean | null>, extra = {}) => ({ answers, savedAt: '2026-11-06T09:00:00.000Z', ...extra });

  it('fills what has no answer here, as from SimpliHeat', async () => {
    const { store } = memory();
    const r = await receiveSimpliHeat(store, T, P, sh({ hpModel: 'EH-8', perInstructions: true }), tick());
    expect(r.row.answers).toMatchObject({ hpModel: 'EH-8', perInstructions: 'yes' });
    expect(r.row.provenance.hpModel).toMatchObject({ source: 'simpliheat', at: '2026-11-06T09:00:00.000Z' });
  });
  it('updates its own earlier answer', async () => {
    const { store } = memory();
    await receiveSimpliHeat(store, T, P, sh({ hpModel: 'EH-8' }), tick());
    const r = await receiveSimpliHeat(store, T, P, sh({ hpModel: 'EH-10' }), tick());
    expect(r.row.answers.hpModel).toBe('EH-10');
    expect(r.conflicts).toEqual([]);
  });
  it('never replaces an answer entered here: it keeps SimpliHeat’s beside it and reports the conflict', async () => {
    const { store } = memory();
    await saveAnswers(store, T, P, { hpModel: 'EH-8' }, sam, 'hap', tick());
    const r = await receiveSimpliHeat(store, T, P, sh({ hpModel: 'EH-9' }), tick());
    expect(r.row.answers.hpModel).toBe('EH-8');
    expect(r.row.provenance.hpModel.other).toMatchObject({ value: 'EH-9', source: 'simpliheat' });
    expect(r.conflicts).toEqual([{ key: 'hpModel', hap: 'EH-8', simpliheat: 'EH-9' }]);
  });
  it('settles the difference when SimpliHeat comes to agree', async () => {
    const { store } = memory();
    await saveAnswers(store, T, P, { hpModel: 'EH-8' }, sam, 'hap', tick());
    await receiveSimpliHeat(store, T, P, sh({ hpModel: 'EH-9' }), tick());
    const r = await receiveSimpliHeat(store, T, P, sh({ hpModel: 'EH-8' }), tick());
    expect(r.row.provenance.hpModel.other).toBeUndefined();
    expect(r.row.provenance.hpModel.source).toBe('hap');
    expect(r.conflicts).toEqual([]);
  });
  it('leaves an answer SimpliHeat has not answered alone', async () => {
    const { store } = memory();
    await saveAnswers(store, T, P, { hpModel: 'EH-8' }, sam, 'hap', tick());
    const r = await receiveSimpliHeat(store, T, P, sh({ hpModel: null, hpSerial: 'SN1' }), tick());
    expect(r.row.answers).toMatchObject({ hpModel: 'EH-8', hpSerial: 'SN1' });
  });
  it('makes what SimpliHeat’s technician signed the record, dropping an answer only entered here', async () => {
    const { store } = memory();
    await saveAnswers(store, T, P, { hpModel: 'EH-8', hpSerial: 'ENTERED-HERE' }, sam, 'hap', tick());
    const r = await receiveSimpliHeat(store, T, P, sh({ hpModel: 'EH-9' }, { technicianName: 'A. Engineer', technicianSignedAt: '2026-11-06T09:30:00Z' }), tick());
    expect(r.row.status).toBe('signed');
    expect(r.row.answers).toEqual({ hpModel: 'EH-9' });
    expect(r.dropped).toEqual(['hpSerial']);
    expect(r.row.signed.technician.name).toBe('A. Engineer');
  });
  it('locks a form signed here: only a customer signature can be added', async () => {
    const { store } = memory();
    await answerAll(store);
    await signLine(store, T, P, 'technician', { name: 'A. Engineer' }, sam, 'hap', tick());
    const r = await receiveSimpliHeat(store, T, P, sh({ hpModel: 'EH-9' }, { customerName: 'A. Customer', customerSignedAt: '2026-11-06T09:40:00Z' }), tick());
    expect(r.locked).toBe(true);
    expect(r.row.answers.hpModel).toBe('x');
    expect(r.row.signed.customer.name).toBe('A. Customer');
  });
  it('lists what it could not take', async () => {
    const { store } = memory();
    const r = await receiveSimpliHeat(store, T, P, sh({ notAQuestion: 'x', runningMode: 'Turbo', hpModel: 'EH-8' }), tick());
    expect(r.skipped.join(' ')).toContain('notAQuestion');
    expect(r.skipped.join(' ')).toContain('isn’t one of the options');
    expect(r.row.answers.hpModel).toBe('EH-8');
  });
});

describe('what HAP gives SimpliHeat', () => {
  it('offers only what was entered here, in SimpliHeat’s types, with who and when', async () => {
    const { store } = memory();
    await saveAnswers(store, T, P, { hpModel: 'EH-8', perInstructions: 'yes', antiVibration: 'no', maxFlowTemp: 45 }, sam, 'hap', '2026-11-06T10:00:00.000Z');
    const r = await receiveSimpliHeat(store, T, P, { answers: { hpSerial: 'SN1', tFlow: 38 }, savedAt: '2026-11-06T09:00:00.000Z' }, tick());
    const feed = feedForSimpliHeat(T, (await store.live(P, T.code))!);
    expect(r.row.answers.hpSerial).toBe('SN1');
    expect(feed.suggestions).toEqual({ hpModel: 'EH-8', perInstructions: true, antiVibration: false, maxFlowTemp: 45 });
    expect(feed.suggestions).not.toHaveProperty('hpSerial');
    expect(feed.entered.hpModel).toEqual({ by: 'Sam Patel', at: '2026-11-06T10:00:00.000Z' });
    expect(feed.status).toBe('draft');
  });
});

describe('another form', () => {
  it('keeps the cylinder record separate from the commissioning record', async () => {
    const { store, rows } = memory();
    await saveAnswers(store, T, P, { hpModel: 'EH-8' }, sam, 'hap', tick());
    await saveAnswers(store, CYLINDER_COMMISSIONING, P, { cylinder_type: 'Unvented' }, sam, 'hap', tick());
    expect(rows.size).toBe(2);
    expect((await store.live(P, 'HX-HP-03'))!.answers).toEqual({ cylinder_type: 'Unvented' });
  });
});
