// What a phone can't do (round-1 review, security): write or clear the office's half of the EIC (the
// design part), or have one it wrote count as signed; go on using a link the office has replaced, or
// open one for a job done long ago; put its own words above a signature (the trade's sign-off, a put
// right, the customer's completion record: the server words them from its constants); run up Claude
// reads on slots that aren't labels or past the job's cap; swap a photo or file once it's up (upload
// links never overwrite, and nothing is recorded before its bytes arrive; a file must be the PDF it
// says); and two sends of the same put right at once leave one signature, matching the record.
// Usage: node --experimental-strip-types scripts/test-site-hardening.mjs
import { createHash, randomUUID } from 'node:crypto';
import * as kit from './site-test-kit.mjs';

const db = kit.setup();
const { eq } = kit;
const answersRoute = await import('../src/app/api/site/jobs/[id]/answers/route.ts');
const signRoute = await import('../src/app/api/site/jobs/[id]/signoff/route.ts');
const putRoute = await import('../src/app/api/site/jobs/[id]/put-right/route.ts');
const custRoute = await import('../src/app/api/site/jobs/[id]/customer-sign/route.ts');
const photoRoute = await import('../src/app/api/site/jobs/[id]/photos/route.ts');
const filesRoute = await import('../src/app/api/site/jobs/[id]/files/route.ts');
const openRoute = await import('../src/app/api/site/open/route.ts');
const jobsRoute = await import('../src/app/api/site/jobs/route.ts');
const SD = await import('../src/lib/site/send.ts');
const SV = await import('../src/lib/site/server.ts');
const V = await import('../src/lib/site/vision.ts');
const RT = await import('../src/lib/site/returns.ts');
const D = await import('../src/lib/site/declaration.ts');
const T = await import('../src/lib/site/tokens.ts');
const ES = await import('../src/lib/site/electrician-shared.ts');
const EIC = await import('../src/lib/site/eic/server.ts');
const { ROOFER } = await import('../src/lib/site/forms/roofer.ts');
const { addWorkingDays, ukDay } = await import('../src/lib/bank-holidays.ts');

const ADDR = '12 High Street, Maindee, Newport, NP20 4AB';
const project = kit.addJob(db);
const read = (a) => SV.assignmentRow(db.rows('site_assignments').find((x) => x.id === a.id));

/* ── The office's half of the EIC ──────────────────────────────────────────── */

const sparky = kit.addContact(db, { name: 'Sam Sparks', trades: ['electrician'] });
const el = kit.addAssignment(db, project, sparky, { trade: 'electrician', forms: [], answers: {}, photos: {}, rate_basis: 'fixed', rate_pence: 45000 });
const elPhone = await kit.addPhone(db, sparky);
const forged = { name: 'J Smith', company: 'Heliaxis', address: 'x', postcode: 'x', tel: 'x', next_n: 10, next_unit: 'years', departures: null, signed_at: new Date().toISOString(), path: 'anything', by: null };
const post = (route, a, path, token, body) => kit.call(route, `/api/site/jobs/${a.id}/${path}`, { token, params: { id: a.id }, body });
const wrote = await post(answersRoute, el, 'answers', elPhone.token, { ops: [{ op_id: randomUUID(), set: { eic_design: { v: forged }, eic_route: { v: 'eic' } } }] });
eq('a phone can’t write the EIC’s design part (its other answers go in)', [wrote.status, 'eic_design' in read(el).answers, read(el).answers.eic_route?.v], [200, false, 'eic']);
await post(answersRoute, el, 'answers', elPhone.token, { ops: [{ op_id: randomUUID(), set: { 'eic_design:x': { v: forged } } }] });
eq('…nor under a suffix', Object.keys(read(el).answers).some((k) => k.startsWith('eic_design')), false);
// The office signs the design part (as sign-design writes it).
db.rows('site_assignments').find((x) => x.id === el.id).answers.eic_design = { v: { ...forged, path: `signatures/${project.id}/eic-design-${el.id}-1.png` }, src: 'typed', at: new Date().toISOString(), dev: 'office:staff-1' };
await post(answersRoute, el, 'answers', elPhone.token, { ops: [{ op_id: randomUUID(), unset: ['eic_design'] }] });
await post(answersRoute, el, 'answers', elPhone.token, { ops: [{ op_id: randomUUID(), set: { eic_design: { v: { ...forged, next_n: 25 } } } }] });
eq('…nor clear or change the one the office signed', [read(el).answers.eic_design?.dev, read(el).answers.eic_design?.v.next_n], ['office:staff-1', 10]);
eq('the office’s design part counts on the certificate', (await EIC.certificateData(db, read(el))).design?.name, 'J Smith');
db.rows('site_assignments').find((x) => x.id === el.id).answers.eic_design.dev = elPhone.device.id;
eq('…one a phone wrote (however it got there) counts as unsigned', (await EIC.certificateData(db, read(el))).design, null);

/* ── New link: the phones that had the old one are signed out ──────────────── */

const roofC = kit.addContact(db);
const roof = kit.addAssignment(db, project, roofC, { status: 'sent', link_generation: 0 });
const otherJob = kit.addAssignment(db, project, roofC, { status: 'sent', link_generation: 0 });
const first = await SD.ensureLink(db, read(roof));
const second = await SD.ensureLink(db, read(otherJob));
const openLink = (token, device) => kit.call(openRoute, '/api/site/open', { body: { token, ...(device ? { device } : {}) } });
const realPhone = await openLink(first.token);
const forwarded = await openLink(first.token);
const elsewhere = await openLink(second.token);
const listAs = (token) => kit.call(jobsRoute, '/api/site/jobs', { token, method: 'GET' });
eq('three phones opened links (two this job’s, one the other job’s)', [realPhone.status, forwarded.status, elsewhere.status, (await listAs(forwarded.body.deviceToken)).status], [200, 200, 200, 200]);
const rotated = await SD.sendToTrade(db, read(roof), roofC, { kind: 'job_pack', via: 'link', rotate: true, actor: 'office', byId: 'staff-1' });
eq('New link: the phones that opened the old one can’t get in any more', [(await listAs(realPhone.body.deviceToken)).status, (await listAs(forwarded.body.deviceToken)).status], [401, 401]);
eq('…a phone that only opened the other job’s link carries on', (await listAs(elsewhere.body.deviceToken)).status, 200);
eq('…the old link no longer opens; the new one does, with a new session', [(await openLink(first.token, forwarded.body.deviceToken)).status, (await openLink(rotated.link.split('/').pop())).body.deviceToken?.length > 0], [404, true]);
eq('…and the history says so', db.rows('site_events').find((e) => e.assignment_id === roof.id && e.type === 'phones_signed_out')?.detail.phones, 2);
eq('the open reply says who the session is for (the phone wipes another person’s jobs)', realPhone.body.contact.id, roofC.id);

// A link for a job done long ago.
const doneLong = kit.addAssignment(db, project, roofC, { status: 'done', done_at: new Date(Date.now() - 40 * 86_400_000).toISOString(), link_generation: 0 });
const oldLink = await SD.ensureLink(db, read(doneLong));
eq('a job done 40 days ago: its link doesn’t open', (await openLink(oldLink.token)).status, 410);
db.rows('site_returns').push({ id: randomUUID(), assignment_id: doneLong.id, n: 1, status: 'open', stage: 'main' });
eq('…unless a return to site is with them', (await openLink(oldLink.token)).status, 200);
const doneRecently = kit.addAssignment(db, project, roofC, { status: 'done', done_at: new Date(Date.now() - 5 * 86_400_000).toISOString(), link_generation: 0 });
eq('a job done 5 days ago: it opens', (await openLink((await SD.ensureLink(db, read(doneRecently))).token)).status, 200);

/* ── Declarations: the server's words, never the phone's ───────────────────── */

const decC = kit.addContact(db, { name: 'Dee Clare' });
const decA = kit.addAssignment(db, project, decC);
const decPhone = await kit.addPhone(db, decC);
const signed = await post(signRoute, decA, 'signoff', decPhone.token, { op_id: randomUUID(), stage: 'main', name: 'Dee Clare', signature: kit.SIG, declaration: 'I confirm I attended site.', signed_at: new Date().toISOString(), rev: 7 });
await kit.afterReply();
const so = db.rows('site_signoffs').find((s) => s.assignment_id === decA.id);
eq('a sign-off sent with other words: the declaration recorded is the wording', [signed.status, so.declaration, so.extra.declaration_phone], [200, ROOFER.sig.declaration({ address: ADDR }), 'I confirm I attended site.']);
eq('…flagged for the office, on the history and in the review task', [so.flags.some((f) => f.code === 'declaration_changed' && f.severity === 'review'), db.rows('site_events').some((e) => e.assignment_id === decA.id && e.type === 'declaration_changed'), globalThis.__rec.tasks.find((t) => t.key === `site-check:${so.id}`)?.notes.includes('The declaration sent from the phone didn’t match')], [true, true, true]);
const review = await (await import('../src/lib/site/review.ts')).siteReview(db, read(decA));
eq('…and the review drawer shows what the phone sent', review.signoffs[0].declaration_phone, 'I confirm I attended site.');
const honestC = kit.addContact(db, { name: 'Hon Est' });
const honest = kit.addAssignment(db, project, honestC);
const honestPhone = await kit.addPhone(db, honestC);
await post(signRoute, honest, 'signoff', honestPhone.token, { op_id: randomUUID(), stage: 'main', name: 'Hon Est', signature: kit.SIG, declaration: ROOFER.sig.declaration({ address: ADDR }), signed_at: new Date().toISOString(), rev: 7 });
await kit.afterReply();
const so2 = db.rows('site_signoffs').find((s) => s.assignment_id === honest.id);
eq('an honest phone: no flag, nothing kept beside it', [so2.declaration === ROOFER.sig.declaration({ address: ADDR }), so2.flags.some((f) => f.code === 'declaration_changed'), 'declaration_phone' in so2.extra], [true, false, false]);

// A put right with other words.
const fixBy = addWorkingDays(ukDay(new Date()), 7, new Set());
const ret = await RT.returnToSite(db, read(decA), so.id, { what: 'Two tiles left lifted.', fix_by: fixBy }, { id: 'staff-1', name: 'Office' });
db.rows('crm_photos').push({ id: randomUUID(), project_id: project.id, assignment_id: decA.id, slot: 'PR:1', storage_path: `${project.id}/site/${decA.id}/PR_1/fix.jpg`, taken_at: null });
const put = await post(putRoute, decA, 'put-right', decPhone.token, { op_id: randomUUID(), n: 1, note: 'Dressed them back.', name: 'Dee Clare', signature: kit.SIG, declaration: 'Nothing to see here.', signed_at: new Date().toISOString() });
const r1 = db.rows('site_returns').find((r) => r.id === ret.ret.id);
eq('a put right sent with other words: the wording is recorded, the phone’s on the history', [put.status, r1.fixed_declaration, db.rows('site_events').find((e) => e.assignment_id === decA.id && e.type === 'put_right_signed')?.detail.declaration_phone], [200, D.putRightDeclaration('Two tiles left lifted.', ADDR), 'Nothing to see here.']);

// The customer's completion record on the electrician's phone.
const elSo = { id: randomUUID(), assignment_id: el.id, stage: 'main', signed_name: 'Sam Sparks', signed_at: new Date().toISOString(), signature_path: 'x.png', extra: {} };
db.rows('site_signoffs').push(elSo);
const cust = await post(custRoute, el, 'customer-sign', elPhone.token, { kind: 'f16e', name: 'Jane Smith', signature: kit.SIG, declaration: 'I agree to pay £10,000 extra.', signed_at: new Date().toISOString() });
const entry = db.rows('site_signoffs').find((s) => s.id === elSo.id).extra.customer.f16e;
eq('the customer’s signature: the completion wording, as the phone shows it, whatever the phone sends', [cust.status, entry.declaration, entry.declaration_phone], [200, ES.CUSTOMER_DECLARATION.f16e(ADDR), 'I agree to pay £10,000 extra.']);

/* ── Claude's label reads ──────────────────────────────────────────────────── */

const photoId = () => randomUUID();
eq('a read is queued only for a label slot', [await V.queueRead(db, roof.id, photoId(), 'RF1'), await V.queueRead(db, roof.id, photoId(), 'constructor'), await V.queueRead(db, roof.id, photoId(), 'RF12'), await V.queueRead(db, roof.id, photoId(), 'SN_OPT:2')], [false, false, true, true]);
for (let i = db.rows('site_reads').filter((r) => r.assignment_id === roof.id).length; i < V.MAX_READS_PER_ASSIGNMENT; i++) db.rows('site_reads').push({ id: randomUUID(), assignment_id: roof.id, photo_id: randomUUID(), key: 'RF12', status: 'read', attempts: 1 });
const pid = photoId();
eq('…and not past the job’s cap', [await V.queueRead(db, roof.id, pid, 'RF12'), db.rows('site_reads').some((r) => r.photo_id === pid)], [false, false]);
const had = db.rows('site_reads').find((r) => r.assignment_id === roof.id && r.key === 'RF12');
eq('…a photo already queued still answers yes (once)', await V.queueRead(db, roof.id, had.photo_id, 'RF12'), true);

/* ── Uploads that can't swap a photo or file ───────────────────────────────── */

const upC = kit.addContact(db, { name: 'Ulla Upload' });
const upA = kit.addAssignment(db, project, upC, { photos: {} });
const upPhone = await kit.addPhone(db, upC);
const client = randomUUID();
const prep = await post(photoRoute, upA, 'photos', upPhone.token, { action: 'prepare', client_id: client, slot: 'RF1', mime: 'image/jpeg', size: 1000 });
eq('prepare: upload links that can’t overwrite', [prep.status, db.uploads.slice(-2).map((u) => u.upsert)], [200, [false, false]]);
const save = () => post(photoRoute, upA, 'photos', upPhone.token, { action: 'save', client_id: client, slot: 'RF1', mime: 'image/jpeg' });
eq('save before the photo has arrived: not recorded (it tries again)', [(await save()).status, db.rows('crm_photos').some((p) => p.storage_path === prep.body.path)], [503, false]);
db.files.set(`crm-photos/${prep.body.path}`, new Uint8Array([1]));
const half = await post(photoRoute, upA, 'photos', upPhone.token, { action: 'prepare', client_id: client, slot: 'RF1', mime: 'image/jpeg', size: 1000 });
eq('the photo arrived, its thumbnail didn’t: a link only for the thumbnail', [half.body.url, typeof half.body.thumbUrl], [null, 'string']);
db.files.set(`crm-photos/${prep.body.thumbPath}`, new Uint8Array([2]));
eq('both there: recorded', [(await save()).status, db.rows('crm_photos').some((p) => p.storage_path === prep.body.path)], [200, true]);
const after = await post(photoRoute, upA, 'photos', upPhone.token, { action: 'prepare', client_id: client, slot: 'RF1', mime: 'image/jpeg', size: 1000 });
eq('…prepare again: no links at all, so it can’t be replaced', [after.status, after.body.url, after.body.thumbUrl], [200, null, null]);
eq('…and saving again is the same photo', (await save()).status, 200);

// The electrician's own certificate file.
const elFile = randomUUID();
const fileBody = (action) => ({ action, client_id: elFile, slot: 'CERT_FILE', name: 'cert.pdf', mime: 'application/pdf', size: 2000 });
const fp = await post(filesRoute, el, 'files', elPhone.token, fileBody('prepare'));
eq('a file: an upload link that can’t overwrite', [fp.status, db.uploads.at(-1).upsert], [200, false]);
eq('saved before it has arrived: not recorded', [(await post(filesRoute, el, 'files', elPhone.token, fileBody('save'))).status, db.rows('crm_documents').some((d) => d.storage_path === fp.body.path)], [503, false]);
await db.storage.from('crm-docs').upload(fp.body.path, new Uint8Array([9, 9, 9]), { contentType: 'image/png' });
const notPdf = await post(filesRoute, el, 'files', elPhone.token, fileBody('save'));
eq('what arrived isn’t a PDF: refused and taken away', [notPdf.status, db.files.has(`crm-docs/${fp.body.path}`), db.rows('crm_documents').some((d) => d.storage_path === fp.body.path)], [400, false, false]);
await db.storage.from('crm-docs').upload(fp.body.path, new Uint8Array(1234), { contentType: 'application/pdf' });
const okFile = await post(filesRoute, el, 'files', elPhone.token, fileBody('save'));
eq('a PDF arrived: recorded, at the size it really is', [okFile.status, db.rows('crm_documents').find((d) => d.storage_path === fp.body.path)?.size], [200, 1234]);
eq('…prepare again: no link, so it can’t be replaced', (await post(filesRoute, el, 'files', elPhone.token, fileBody('prepare'))).body.url, null);

/* ── Two sends of the same put right at once ───────────────────────────────── */

const raceC = kit.addContact(db, { name: 'Rae Race' });
const raceA = kit.addAssignment(db, project, raceC, { status: 'done' });
const raceSo = { id: randomUUID(), assignment_id: raceA.id, stage: 'main', signed_name: 'Rae Race', signed_at: new Date().toISOString(), signature_path: 'x.png', extra: {}, review_status: 'return', flags: [] };
db.rows('site_signoffs').push(raceSo);
const raceRet = { id: randomUUID(), assignment_id: raceA.id, signoff_id: raceSo.id, stage: 'main', n: 1, what: 'Seal the entry.', status: 'open', fix_by: fixBy, photo_ids: [] };
db.rows('site_returns').push(raceRet);
db.rows('crm_photos').push({ id: randomUUID(), project_id: project.id, assignment_id: raceA.id, slot: 'PR:1', storage_path: `${project.id}/site/${raceA.id}/PR_1/fix.jpg`, taken_at: null });
const SIG2 = 'data:image/png;base64,' + Buffer.from(kit.SIG.split(',')[1], 'base64').toString('base64').replace(/=+$/, '') + '==';
const body = (name, sig) => ({ n: 1, note: 'Sealed it.', name, signature: sig, declaration: '', signed_at: new Date().toISOString() });
const meta = { deviceId: null, ip: null, userAgent: null };
const [x, y] = await Promise.all([RT.putRight(db, read(raceA), body('Rae Race', kit.SIG), meta), RT.putRight(db, read(raceA), body('Rae R.', SIG2), meta)]);
const row = db.rows('site_returns').find((r) => r.id === raceRet.id);
const sigFiles = [...db.files.keys()].filter((k) => k.includes(`site-putright-${raceRet.id}`));
eq('two at once: one put right, the other gets it back', [x.ok && y.ok, [x.fresh, y.fresh].sort(), row.status], [true, [false, true], 'fixed']);
eq('…one signature file, the one on the record (the other removed)', [sigFiles.length, sigFiles[0] === `crm-docs/${row.fixed_signature_path}`], [1, true]);
eq('…its own file name, never overwritten', /site-putright-[0-9a-f-]{36}-[0-9a-f-]{36}\.png$/.test(row.fixed_signature_path), true);

void createHash;
void T;
kit.done();
