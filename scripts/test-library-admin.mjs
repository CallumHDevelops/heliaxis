// The product library (CRM settings → Product library, PATCH /api/crm/library/[id]): changing an item
// (its kind, models, "In every pack", archiving, name) is for admins only, as the screen says. A member
// with CRM access gets a 403 and nothing changes; an admin's change goes in. Deleting from the Document
// library stays open to the CRM team, as the screen offers it. Uploading (POST /api/crm/library, save)
// can't put a member's file in every pack or set a model's details either; a member can still add a
// manual for a model from a job's Handover tab, and a plain document to the Document library.
// Usage: node --experimental-strip-types scripts/test-library-admin.mjs
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as kit from './site-test-kit.mjs';

const db = kit.setup({
  '@/lib/crm/server': `${kit.STUBS['@/lib/crm/server'].replace(/role: 'admin'/, "role: globalThis.__role ?? 'admin'")}
    export async function signedDoc(p) { return 'https://storage.test/' + p; }
    export const DOC_MIME = ['application/pdf']; export const MAX_DOC_BYTES = 25 * 1024 * 1024; export const safeName = (s) => s;`,
  '@/lib/handover/server': 'export async function handoverReady() { return true; }',
  '@/lib/subcontractors/pdf-engine': 'export async function buildPdf(files) { return { bytes: files[0].bytes, keptOriginal: true }; }',
  '@/lib/projects/server': 'export const projectRow = (raw) => raw; export async function calendarNow() { return {}; } export async function syncEnquiryStatus() {}',
});
const { eq } = kit;
const route = await import('../src/app/api/crm/library/[id]/route.ts');
const upload = await import('../src/app/api/crm/library/route.ts');

const item = { id: randomUUID(), name: 'Internal price list', description: null, storage_path: 'library/prices.pdf', kind: null, handover_slot: null, models: [], every_pack: false, archived_at: null };
db.rows('crm_library').push(item);
const row = () => db.rows('crm_library').find((x) => x.id === item.id);
const patch = (role, body) => ((globalThis.__role = role), kit.call(route, `/api/crm/library/${item.id}`, { method: 'PATCH', params: { id: item.id }, body }));

const member = await patch('member', { every_pack: true, kind: 'guide', handover_slot: 'HX-HO-19' });
eq('a member can’t tick “In every pack” (403, with why)', [member.status, member.body.error], [403, 'Only admins can change the product library.']);
eq('…and nothing changed', [row().every_pack, row().kind], [false, null]);
eq('a member can’t change the models or archive it either', [(await patch('member', { models: 'Aiko Neostar' })).status, (await patch('member', { archived: true })).status, row().models, row().archived_at], [403, 403, [], null]);
eq('…nor rename it', [(await patch('member', { name: 'Customer guide' })).status, row().name], [403, 'Internal price list']);

const admin = await patch('admin', { every_pack: true, kind: 'guide', handover_slot: 'HX-HO-19', models: 'Aiko Neostar; Sigenergy' });
eq('an admin’s change goes in', [admin.status, row().every_pack, row().kind, row().models], [200, true, 'guide', ['Aiko Neostar', 'Sigenergy']]);
eq('…archiving too', [(await patch('admin', { archived: true })).status, !!row().archived_at], [200, true]);

// The screen matches: the product library's controls are greyed out for members.
const screen = readFileSync(new URL('../src/app/admin/crm/settings/HandoverSettings.tsx', import.meta.url), 'utf8');
eq('the settings screen greys out kind, models and “In every pack” for members', (screen.match(/disabled=\{!isAdmin\}/g) ?? []).length >= 3, true);

// Deleting stays open to the CRM team (the Document library offers Delete to everyone).
globalThis.__role = 'member';
const del = await kit.call(route, `/api/crm/library/${item.id}`, { method: 'DELETE', params: { id: item.id } });
eq('a member can still delete from the Document library', [del.status, db.rows('crm_library').length], [200, 0]);

// Uploading: the same rule for a new item, so "In every pack" can't come in through the back door.
const save = (role, body) => ((globalThis.__role = role), kit.call(upload, '/api/crm/library', { body: { action: 'save', path: `library/${randomUUID()}.pdf`, mime: 'application/pdf', size: 1, ...body } }));
const saved = (name) => db.rows('crm_library').find((x) => x.name === name);
const everyPack = await save('member', { name: 'Internal price list', every_pack: true, kind: 'guide', handover_slot: 'HX-HO-19' });
eq('a member can’t upload into every pack (403, with why)', [everyPack.status, everyPack.body.error], [403, 'Only admins can change the product library.']);
eq('…and nothing was saved', saved('Internal price list'), undefined);
const aliases = await save('member', { name: 'Aiko manual', kind: 'manual', handover_slot: 'HX-HO-17', models: ['Aiko Neostar'], details: { 'Aiko Neostar': { aliases: ['Sigenergy', 'GivEnergy'] } } });
eq('…nor set a model’s details (aliases that match other models)', [aliases.status, saved('Aiko manual')], [403, undefined]);

const sheet = await save('member', { name: 'Sigenergy manual', kind: 'manual', handover_slot: 'HX-HO-17', models: ['Sigenergy SigenStor'], technologies: ['battery'] });
eq('a member can still add a manual for a model from a job’s Handover tab', [sheet.status, saved('Sigenergy manual')?.kind, saved('Sigenergy manual')?.models, !!saved('Sigenergy manual')?.every_pack], [200, 'manual', ['Sigenergy SigenStor'], false]);
eq('…and a plain document to the Document library', [(await save('member', { name: 'EV access guide' })).status, !!saved('EV access guide')], [200, true]);

const byAdmin = await save('admin', { name: 'Customer guide', every_pack: true, kind: 'guide', handover_slot: 'HX-HO-19' });
eq('an admin can upload straight into every pack', [byAdmin.status, saved('Customer guide')?.every_pack, saved('Customer guide')?.kind], [200, true, 'guide']);

kit.done();
