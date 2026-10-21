// What deleting keeps (round-1 review, data-money): a job a trade has signed off on site (their
// sign-off, the certificates and customer signatures made from it, a return to site) or one with a
// labour PO, even a held draft after a reopen, is only deleted when its reference is typed; deleting
// customers keeps them unless ticked, saying why.
// Usage: node --experimental-strip-types scripts/test-site-delete-evidence.mjs
import { randomUUID } from 'node:crypto';
import * as kit from './site-test-kit.mjs';

const db = kit.setup({ '@/lib/projects/server': 'export async function syncEnquiryStatus() {}' });
const { eq } = kit;
const PD = await import('../src/lib/projects/delete.ts');
const DC = await import('../src/lib/crm/delete-customer.ts');
const by = { id: 'staff-1', name: 'Office', admin: true };

/* ── Deleting a job ────────────────────────────────────────────────────────── */

// Loaded straight in at Won: no signed quote, no deposit, no orders. A staff electrician signed off (no PO).
const signedJob = kit.addJob(db, { project_ref: 'HX-0101', title: 'Solar', accepted_at: null, deposit_paid_at: null, created_at: new Date().toISOString() });
const sparky = kit.addContact(db, { name: 'Sam Sparks' });
kit.addAssignment(db, signedJob, sparky, { trade: 'electrician', raise_po: false, status: 'done', signed_at: new Date().toISOString(), photos: {} });
const asked = await PD.deleteProject(signedJob.id, { by });
eq('a trade signed off: the reference must be typed', [asked.ok, asked.status, asked.needsConfirm, asked.label], [false, 409, true, 'HX-0101']);
eq('…and it says why', asked.message, 'This job has trade sign-offs and certificates (and their labour POs): the signed record of the work. They’d be deleted too. Mark it as Lost instead, or type HX-0101 to delete everything.');
eq('…nothing went', db.rows('crm_projects').some((p) => p.id === signedJob.id), true);

// Reopened: no sign-off any more, but the held labour PO is still there.
const heldJob = kit.addJob(db, { project_ref: 'HX-0102', title: 'Solar', created_at: new Date().toISOString() });
const roofer = kit.addContact(db);
const ra = kit.addAssignment(db, heldJob, roofer, { status: 'started', photos: {} });
db.rows('purchase_orders').push({ id: randomUUID(), kind: 'labour', project_id: heldJob.id, assignment_id: ra.id, signoff_id: null, status: 'draft', po_number: 'PO-0900', labour: null });
eq('a held labour PO counts too', (await PD.deleteProject(heldJob.id, { by })).status, 409);

// A labour PO that's gone isn't "a purchase order sent to a supplier".
const sentJob = kit.addJob(db, { project_ref: 'HX-0103', title: 'Solar', created_at: new Date().toISOString() });
db.rows('purchase_orders').push({ id: randomUUID(), kind: 'labour', project_id: sentJob.id, assignment_id: null, signoff_id: null, status: 'sent', po_number: 'PO-0901', labour: null });
eq('…and is called what it is', (await PD.deleteProject(sentJob.id, { by })).message.startsWith('This job has trade sign-offs and certificates'), true);

const typed = await PD.deleteProject(signedJob.id, { by, confirm: 'hx-0101' });
eq('the reference typed: deleted', [typed.ok, db.rows('crm_projects').some((p) => p.id === signedJob.id)], [true, false]);
const plainJob = kit.addJob(db, { project_ref: 'HX-0104', title: 'Solar', created_at: new Date().toISOString() });
eq('a job with nothing signed goes without typing', (await PD.deleteProject(plainJob.id, { by })).ok, true);

/* ── Deleting customers ────────────────────────────────────────────────────── */

const cust = kit.addJob(db, { project_ref: 'HX-0105', title: 'Solar', created_at: new Date().toISOString() });
const roof2 = kit.addContact(db, { name: 'Ray Roof' });
kit.addAssignment(db, cust, roof2, { status: 'done', signed_at: new Date().toISOString(), photos: {} });
const enquiry = db.rows('enquiries').find((e) => e.id === cust.enquiry_id);
Object.assign(enquiry, { email: 'jane@example.test', phone: null, created_at: new Date().toISOString() });
const preview = await DC.previewDelete([enquiry.id]);
eq('the preview: kept for their trade sign-offs', preview.customers.map((c) => [c.signed, c.paid, c.ordered, c.signed_off]), [[false, false, false, true]]);
const kept = await DC.deleteCustomers([enquiry.id]);
eq('deleting them: kept, and why', [kept.deleted, kept.errors.map((e) => [e.held, e.error])], [0, [[true, 'Kept: Jane Smith has trade sign-offs and certificates. Tick to include them.']]]);
eq('…the job and its sign-off are still there', [db.rows('crm_projects').some((p) => p.id === cust.id), db.rows('site_assignments').some((a) => a.project_id === cust.id)], [true, true]);

kit.done();
