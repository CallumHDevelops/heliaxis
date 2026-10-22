// A message to a trade that didn't go can be sent again (round-1 review, data-money): a return to
// site's written notice that failed on both channels says so (call them) and can be sent again as the
// same notice, so it reaches them and the return keeps when; a PO whose email failed goes again as
// the same version (never "updated", never "This replaces…"); an older version, a sent message, or a
// notice for a return that's closed can't be; and a send that throws reports failed, not "waiting".
// Usage: node --experimental-strip-types scripts/test-site-send-again.mjs
import { randomUUID } from 'node:crypto';
import * as kit from './site-test-kit.mjs';

const db = kit.setup();
const { eq } = kit;
const L = await import('../src/lib/site/labour-po.ts');
const RT = await import('../src/lib/site/returns.ts');
const SD = await import('../src/lib/site/send.ts');
const SV = await import('../src/lib/site/server.ts');
const signRoute = await import('../src/app/api/site/jobs/[id]/signoff/route.ts');
const resendRoute = await import('../src/app/api/crm/site-assignments/[id]/resend/route.ts');
const { ROOFER } = await import('../src/lib/site/forms/roofer.ts');
const { addWorkingDays, ukDay } = await import('../src/lib/bank-holidays.ts');

const project = kit.addJob(db);
const contact = kit.addContact(db);
const a = kit.addAssignment(db, project, contact);
const phone = await kit.addPhone(db, contact);
const read = () => SV.assignmentRow(db.rows('site_assignments').find((x) => x.id === a.id));
const po = () => db.rows('purchase_orders').find((p) => p.assignment_id === a.id && p.status !== 'cancelled');
const msgs = (kind) => db.rows('site_messages').filter((m) => m.assignment_id === a.id && m.kind === kind);
const resend = (id) => kit.call(resendRoute, `/api/crm/site-assignments/${a.id}/resend`, { params: { id: a.id }, body: { message_id: id } });

/* ── The PO's email fails at sign-off ──────────────────────────────────────── */

globalThis.__fail.email = true;
const signed = await kit.call(signRoute, `/api/site/jobs/${a.id}/signoff`, { token: phone.token, params: { id: a.id }, body: { op_id: randomUUID(), stage: 'main', name: 'Dave Price', signature: kit.SIG, declaration: ROOFER.sig.declaration({ address: '12 High Street, Maindee, Newport, NP20 4AB' }), signed_at: new Date().toISOString(), rev: 7 } });
await kit.afterReply();
globalThis.__fail.email = false;
const failedPo = msgs('po').find((m) => m.channel === 'email');
eq('signed; the PO email failed (the WhatsApp went)', [signed.status, failedPo.status, failedPo.error, msgs('po').find((m) => m.channel === 'whatsapp').status], [200, 'failed', 'Resend said no', 'sent']);
const tab = (await SV.siteTabData(db, project.id)).assignments[0];
eq('the Site tab has the failed email with its id (for Send again)', tab.messages.some((m) => m.id === failedPo.id && m.status === 'failed'), true);
const rowsBefore = db.rows('site_messages').length;
const again = await resend(failedPo.id);
eq('Send again: the same message goes, no new row', [again.status, again.body.message.status, again.body.message.id, db.rows('site_messages').length], [200, 'sent', failedPo.id, rowsBefore]);
const email = globalThis.__rec.email.at(-1);
eq('…as version 1: not "updated", the same idempotency key, the PDF attached', [email.subject.startsWith('PO-0001'), email.html.includes('Here is your updated'), email.html.includes('Thank you for signing off'), email.idempotencyKey, email.attachments?.[0]?.filename], [true, false, true, `site-po:${po().id}:v1:email`, 'PO-0001.pdf']);
eq('…the PO is still version 1, now delivered to the email address', [po().labour.version, po().labour.replaces, po().sent_to], [1, null, 'dave@example.test']);
eq('…and the history says it went again', db.rows('site_events').some((e) => e.assignment_id === a.id && e.type === 'message_resent'), true);
const twice = await resend(failedPo.id);
eq('a message that went can’t be sent again', twice.status, 409);

// Issued again (version 2) while an email for version 1 had failed: version 1's can't be sent again.
globalThis.__fail.email = true;
db.rows('site_assignments').find((x) => x.id === a.id).rate_pence = 3100;
const v2 = await L.issueLabourPo(db, po().id, { by: 'staff-1', override: true });
globalThis.__fail.email = false;
const v2email = msgs('po').find((m) => m.dedupe_key.endsWith(':v2:email'));
eq('version 2’s email failed too, and Issue says nothing reached them only when nothing did', [v2.ok, v2email.status, v2.notes], [true, 'failed', []]);
db.rows('site_messages').find((m) => m.id === failedPo.id).status = 'failed'; // as if version 1's had failed too
eq('version 1’s message can’t be sent again once version 2 exists', (await SD.sendAgain(db, failedPo.id, a.id, 'office')), null);
eq('…version 2’s can', (await SD.sendAgain(db, v2email.id, a.id, 'office'))?.status, 'sent');

/* ── A return to site whose notice can't go ────────────────────────────────── */

globalThis.__fail.email = true;
globalThis.__fail.whatsapp = true;
const fixBy = addWorkingDays(ukDay(new Date()), 7, new Set());
const signoff = db.rows('site_signoffs').find((s) => s.assignment_id === a.id);
const ret = await RT.returnToSite(db, read(), signoff.id, { what: 'Two tiles left lifted.', fix_by: fixBy }, { id: 'staff-1', name: 'Callum Office' }, 'http://localhost');
globalThis.__fail.email = false;
globalThis.__fail.whatsapp = false;
const notices = msgs('return_to_site');
eq('return to site, both channels failed: they’re reported failed, and the office is told to call', [ret.ok, ret.messages.map((m) => m.status).sort(), ret.notes.some((n) => n.startsWith('Nothing could be sent, so call them'))], [true, ['failed', 'failed'], true]);
const retRow = () => db.rows('site_returns').find((r) => r.id === ret.ret.id);
eq('…the notice hasn’t reached them', retRow().notice_sent_at, null);
const review = await (await import('../src/lib/site/review.ts')).siteReview(db, read());
eq('the review lists the failed messages with their ids', review.review.returns[0].messages.map((m) => [!!m.id, m.status]), [[true, 'failed'], [true, 'failed']]);
const emailBefore = globalThis.__rec.email.length;
const sentAgain = await resend(notices.find((m) => m.channel === 'email').id);
const notice = globalThis.__rec.email.at(-1);
eq('Send again: the same written notice reaches them, and the return keeps when', [sentAgain.status, sentAgain.body.message.status, globalThis.__rec.email.length - emailBefore, notice.subject, !!retRow().notice_sent_at], [200, 'sent', 1, retRow().notice.subject, true]);
eq('…the reply carries the review for the drawer', sentAgain.body.review.review.returns[0].notice_sent_at !== null, true);
await RT.greenLight(db, read(), signoff.id, { id: 'staff-1', name: 'Callum Office' });
eq('a notice for a return that’s closed can’t be sent again', (await SD.sendAgain(db, notices.find((m) => m.channel === 'whatsapp').id, a.id, 'office')), null);

/* ── A send that throws ────────────────────────────────────────────────────── */

const row = (await db.from('site_messages').insert({ assignment_id: a.id, channel: 'email', kind: 'po', dedupe_key: `test:${randomUUID()}`, to_address: 'dave@example.test', params: { subject: 'x', html: 'y', attach: { bucket: 'crm-docs', path: 'nothing/here.pdf', filename: 'x.pdf' } }, send_after: new Date().toISOString() }).select('*').single()).data;
const thrown = await SD.deliver(db, row);
eq('a send that throws (the PDF isn’t there) reports failed, not waiting', [thrown?.status, thrown?.error, db.rows('site_messages').find((m) => m.id === row.id).status], ['failed', 'The PDF to attach isn’t there yet.', 'failed']);

kit.done();
