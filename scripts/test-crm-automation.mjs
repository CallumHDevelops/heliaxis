// What the CRM does by itself with new leads (src/lib/crm/automation.ts): who gets a new lead. The
// rotation (CRM → Settings → New leads) skips anyone who can no longer open the CRM (rejected, set back
// to pending, CRM portal taken away), who stays ticked and takes turns again when their access is back;
// a lead someone already has is left alone.
// Usage: node --experimental-strip-types scripts/test-crm-automation.mjs
import { randomUUID } from 'node:crypto';
import * as kit from './site-test-kit.mjs';

const db = kit.setup({
  '@/lib/crm/server': `${kit.STUBS['@/lib/crm/server']}
    export async function ensurePortalToken() { return 'portal-token'; }
    export const portalUrl = (t) => 'https://heliaxis.test/my/' + t;`,
  '@/lib/crm/booking-link': `export async function ensureBookingToken() { return 'booking-token'; } export const bookingUrl = (t) => 'https://heliaxis.test/book/' + t;`,
  '@/lib/crm/move-stage': 'export async function applyStageEvent() { return { ok: true }; }',
  '@/lib/whatsapp/inbox': `export async function sendSystem(enquiryId, msg, via) { globalThis.__rec.whatsapp.push({ enquiryId, text: msg.text, via }); return { ok: true }; }`,
  '@/lib/ms365': `export const msConfigured = () => true; export async function sendMail(m) { globalThis.__rec.email.push(m); return 'graph-' + globalThis.__rec.email.length; }`,
});
const { eq } = kit;
const A = await import('../src/lib/crm/automation.ts');

const person = (name, o = {}) => ({ id: randomUUID(), full_name: name, email: `${name.toLowerCase()}@heliaxis.test`, status: 'approved', role: 'member', portals: ['crm'], ...o });
const settings = () => JSON.parse(db.rows('cms_kv').find((r) => r.key === 'crm-settings')?.value ?? '{}');
const setSettings = (s) => {
  db.t.cms_kv = db.rows('cms_kv').filter((r) => r.key !== 'crm-settings');
  db.rows('cms_kv').push({ key: 'crm-settings', value: JSON.stringify(s) });
};
const lead = (o = {}) => {
  const p = { id: randomUUID(), enquiry_id: randomUUID(), title: 'Solar', stage: 'lead', owner_id: null, created_at: new Date().toISOString(), sequence_step: 0, sequence_stopped_at: null, reminders_sent: [], ...o };
  db.rows('crm_projects').push(p);
  db.rows('enquiries').push({ id: p.enquiry_id, name: 'Jane Smith', email: 'jane@example.test' });
  return p;
};
const ownerOf = (p) => db.rows('crm_projects').find((x) => x.id === p.id).owner_id;

/* ── Who gets a new lead ───────────────────────────────────────────────────── */

const esther = person('Esther');
const callum = person('Callum', { role: 'admin', portals: [] });
const leaver = person('Leaver');
db.t.profiles = [esther, callum, leaver];
setSettings({ leadRotation: [esther.id, leaver.id, callum.id], rotationIndex: 0 });

const turns = async (n) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = lead();
    out.push(await A.assignNewLead(p.id, 'Jane Smith', p.enquiry_id));
    if (ownerOf(p) !== out.at(-1)) out.push('owner not set');
  }
  return out;
};
const names = (ids) => ids.map((id) => [esther, callum, leaver].find((p) => p.id === id)?.full_name ?? id);
eq('everyone with CRM access takes a turn (an admin counts)', names(await turns(3)), ['Esther', 'Leaver', 'Callum']);

// The leaver is rejected on the Users page, without being unticked in CRM settings first.
leaver.status = 'rejected';
globalThis.__rec.notify.length = 0;
eq('someone rejected is skipped: new leads go to the others in turn', names(await turns(4)), ['Esther', 'Callum', 'Esther', 'Callum']);
eq('…and only the people who got a lead were told', [...new Set(globalThis.__rec.notify.map((n) => n.userId))].sort(), [esther.id, callum.id].sort());
eq('…they stay ticked in CRM settings', settings().leadRotation, [esther.id, leaver.id, callum.id]);

leaver.status = 'pending';
eq('set back to pending: skipped too', names(await turns(2)).includes('Leaver'), false);
leaver.status = 'approved';
leaver.portals = ['enquiries'];
eq('CRM portal taken away: skipped too', names(await turns(2)).includes('Leaver'), false);

// Their access comes back: they're back in turn without anyone ticking them again.
leaver.portals = ['crm', 'enquiries'];
eq('access back: they take turns again by themselves', names(await turns(3)).sort(), ['Callum', 'Esther', 'Leaver']);

// Nobody on the rotation can open the CRM: the lead stays unassigned and nobody is told.
db.t.profiles = [{ ...esther, status: 'rejected' }, { ...callum, status: 'rejected' }, { ...leaver, status: 'rejected' }];
globalThis.__rec.notify.length = 0;
const orphan = lead();
eq('nobody left on the rotation: the lead is left unassigned, nobody told', [await A.assignNewLead(orphan.id, 'Jane Smith'), ownerOf(orphan), globalThis.__rec.notify.length], [null, null, 0]);
db.t.profiles = [esther, callum, leaver];

// A lead someone already has isn't touched (only unassigned leads are given out).
const taken = lead({ owner_id: leaver.id });
leaver.status = 'rejected';
await A.assignNewLead(taken.id, 'Jane Smith');
eq('a lead already assigned (even to someone who has left) is left alone', ownerOf(taken), leaver.id);

kit.done();
