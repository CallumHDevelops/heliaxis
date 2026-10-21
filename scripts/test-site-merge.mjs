// The site app and the handover pack when two jobs are joined (src/lib/site/merge-paths.ts): once
// crm/merge.ts has moved the merged-away job's signatures folder, the signatures named inside the
// site app's and the handover pack's own rows point at the kept job's folder (the trade's sign-off,
// a put right after a return to site, the customer's on the electrician's phone, the EIC's design
// part, the system summary's design part and the customer's portal signature), nothing else changes, running it again changes nothing, and other
// buckets and folders are left alone. Plus the merge's table list covers the new tables.
// Usage: node --experimental-strip-types scripts/test-site-merge.mjs
import { registerHooks } from 'node:module';

const SRC = new URL('../src/', import.meta.url).href;
const mod = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS = { 'server-only': 'export {}', '@/lib/crm/server': "export const DOCS_BUCKET = 'crm-docs'; export const CRM_BUCKET = 'crm-photos';" };
registerHooks({
  resolve(specifier, context, next) {
    if (STUBS[specifier]) return { url: mod(STUBS[specifier]), shortCircuit: true };
    const spec = specifier.startsWith('@/') ? SRC + specifier.slice(2) : specifier;
    try {
      return next(spec, context);
    } catch (e) {
      if (!/^(?:\.\.?\/|file:)/.test(spec) || /\.\w+$/.test(spec)) throw e;
      return next(`${spec}.ts`, context);
    }
  },
});

const { moveSitePaths } = await import('../src/lib/site/merge-paths.ts');
const R = await import('../src/lib/crm/merge-rules.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

/** The PostgREST calls merge-paths.ts makes (select with eq/in, update with eq), on tables in memory. */
function fakeDb(t, missing = []) {
  const from = (name) => {
    const filters = [];
    let patch = null;
    const q = {
      select: () => q,
      update: (p) => ((patch = p), q),
      eq: (c, v) => (filters.push((r) => r[c] === v), q),
      in: (c, vs) => (filters.push((r) => vs.includes(r[c])), q),
      then: (ok, bad) => {
        if (missing.includes(name)) return Promise.resolve({ data: null, error: { message: `relation "${name}" does not exist` } }).then(ok, bad);
        const rows = (t[name] ??= []).filter((r) => filters.every((f) => f(r)));
        if (patch) for (const r of rows) Object.assign(r, structuredClone(patch));
        return Promise.resolve({ data: patch ? null : structuredClone(rows), error: null }).then(ok, bad);
      },
    };
    return q;
  };
  return { from };
}

const FROM = '11111111-1111-4111-8111-111111111111';
const KEPT = '22222222-2222-4222-8222-222222222222';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const old = (f) => `signatures/${FROM}/${f}`;
const now = (f) => `signatures/${KEPT}/${f}`;
const tables = () => ({
  // Already on the kept job: crm_merge() moved the rows before the files.
  site_assignments: [
    { id: A, project_id: KEPT, answers: { eic_design: { v: { name: 'Sarah Jones', path: old('eic-design-x.png'), next_n: 10 }, src: 'typed' }, eic_route: { v: 'eic' } } },
    { id: OTHER, project_id: KEPT, answers: { RF1: { v: 'yes' } } },
  ],
  site_signoffs: [
    { id: 's1', assignment_id: A, signature_path: old('site-s1.png'), extra: { customer: { completion: { name: 'Jane Smith', path: old('site-s1-cust-completion.png') }, g98: { name: 'Jane Smith', path: old('site-s1-cust-g98.png') } } } },
    { id: 's2', assignment_id: OTHER, signature_path: `signatures/${KEPT}/site-s2.png`, extra: {} },
  ],
  // A trade's Put right after a return to site, and one not signed yet.
  site_returns: [
    { id: 'r1', assignment_id: A, fixed_signature_path: old('site-putright-r1.png') },
    { id: 'r2', assignment_id: A, fixed_signature_path: null },
  ],
  handover_slots: [
    { project_id: KEPT, slot: 'HX-HO-02', data: { design: { name: 'Sarah Jones', path: old('summary-design-1.png') } } },
    { project_id: KEPT, slot: 'HX-HO-08', data: { customer: { name: 'Jane Smith', path: old('portal-completion-1.png'), via: 'portal' } } },
    { project_id: KEPT, slot: 'HX-HO-03', data: {} },
  ],
});

const t = tables();
const stuck = await moveSitePaths(fakeDb(t), { bucket: 'crm-docs', from: `signatures/${FROM}/`, to: `signatures/${KEPT}/` });
eq('nothing stuck', stuck, 0);
eq('the trade’s sign-off signature', t.site_signoffs[0].signature_path, now('site-s1.png'));
eq('the customer’s signatures on the electrician’s phone (completion and G98)', [t.site_signoffs[0].extra.customer.completion.path, t.site_signoffs[0].extra.customer.g98.path], [now('site-s1-cust-completion.png'), now('site-s1-cust-g98.png')]);
eq('a put right’s signature (one not signed yet left alone)', [t.site_returns[0].fixed_signature_path, t.site_returns[1].fixed_signature_path], [now('site-putright-r1.png'), null]);
eq('the EIC’s design part (the rest of the answer as it was)', t.site_assignments[0].answers.eic_design, { v: { name: 'Sarah Jones', path: now('eic-design-x.png'), next_n: 10 }, src: 'typed' });
eq('the system summary’s design part and the customer’s portal signature', [t.handover_slots[0].data.design.path, t.handover_slots[1].data.customer.path], [now('summary-design-1.png'), now('portal-completion-1.png')]);
eq('rows that named nothing in the old folder are as they were', [t.site_signoffs[1], t.site_assignments[1].answers, t.handover_slots[2].data], [tables().site_signoffs[1], { RF1: { v: 'yes' } }, {}]);
const snap = JSON.stringify(t);
await moveSitePaths(fakeDb(t), { bucket: 'crm-docs', from: `signatures/${FROM}/`, to: `signatures/${KEPT}/` });
eq('run again (the every-minute job): nothing more changes', JSON.stringify(t) === snap, true);

const u = tables();
await moveSitePaths(fakeDb(u), { bucket: 'crm-docs', from: `projects/${FROM}/`, to: `projects/${KEPT}/` });
await moveSitePaths(fakeDb(u), { bucket: 'crm-photos', from: `${FROM}/`, to: `${KEPT}/` });
eq('other folders and buckets: left to the rows MERGE_TABLES lists', JSON.stringify(u) === JSON.stringify(tables()), true);
eq('before site-commissioning.sql: nothing to do, nothing stuck', await moveSitePaths(fakeDb(tables(), ['site_assignments', 'site_signoffs', 'handover_slots']), { bucket: 'crm-docs', from: `signatures/${FROM}/`, to: `signatures/${KEPT}/` }), 0);
const v = tables();
await moveSitePaths(fakeDb(v, ['handover_slots']), { bucket: 'crm-docs', from: `signatures/${FROM}/`, to: `signatures/${KEPT}/` });
eq('before handover.sql: the site app’s rows still move', v.site_signoffs[0].signature_path, now('site-s1.png'));

/* ── The merge's table list ─────────────────────────────────────────────── */
eq('the site app and the handover pack are in MERGE_TABLES', ['site_assignments.project_id', 'handover_slots.project_id', 'handover_packs.project_id', 'crm_payments.project_id'].map((k) => R.MERGE_TABLES[k]?.to), ['job', 'job', 'job', 'job']);
// Site photos are saved in the job's own crm-photos folder, so a merge moves them and deleting the customer removes them.
const photosRoute = (await import('node:fs')).readFileSync(new URL('../src/app/api/site/jobs/[id]/photos/route.ts', import.meta.url), 'utf8');
eq('site photos go in the job’s own folder, the one a merge moves', [/`\$\{projectId\}\/site\/\$\{assignmentId\}\//.test(photosRoute), R.MERGE_TABLES['crm_photos.project_id'].files.folder(KEPT)], [true, `${KEPT}/`]);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
