// The WhatsApp dock's rules (src/components/admin/whatsapp/dock-shared.ts): where it shows and how
// each page starts, the remembered choice, the ref search, and that the chat list endpoint never sends
// anything or marks anything read.
// Usage: node --experimental-strip-types scripts/test-dock.mjs
import { readFileSync } from 'node:fs';
import {
  chatMatches,
  chooseDock,
  cookieFrom,
  crmViewOf,
  dockCookieValue,
  dockDefaultFor,
  effectiveDock,
  jobIdFromPath,
  looksLikeRef,
  NO_CHOICE,
  parseDockCookie,
  refMatches,
  windowPill,
} from '../src/components/admin/whatsapp/dock-shared.ts';

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const JOB = '3f2b8c1e-6a7d-4e2f-9b1a-0c5d7e8f9a10';

// Where the dock shows, and how each page starts.
const home = (path, view = 'home') => dockDefaultFor(path, view);
eq('CRM home opens', home('/admin/crm'), 'open');
eq('CRM board is the strip', home('/admin/crm', 'board'), 'collapsed');
eq('CRM list is the strip', home('/admin/crm', 'list'), 'collapsed');
eq('?view=board beats the cookie', home('/admin/crm', crmViewOf('board', 'home')), 'collapsed');
eq('the cookie view when there is no ?view=', home('/admin/crm', crmViewOf(null, 'list')), 'collapsed');
eq('nonsense views count as Home', home('/admin/crm', crmViewOf('kanban', 'tiles')), 'open');
eq('a customer record opens', home(`/admin/crm/${JOB}`), 'open');
eq('a project record opens', home(`/admin/projects/${JOB}`), 'open');
eq('a record with a trailing slash', home(`/admin/crm/${JOB}/`), 'open');
eq('CRM reports', home('/admin/crm/reports'), 'collapsed');
eq('CRM settings', home('/admin/crm/settings'), 'collapsed');
eq('Projects list', home('/admin/projects'), 'collapsed');
eq('Projects schedule', home('/admin/projects/schedule'), 'collapsed');
eq('Surveys and diary', home('/admin/surveys'), 'collapsed');
eq('a survey', home(`/admin/surveys/${JOB}`), 'collapsed');
eq('a survey report', home(`/admin/surveys/${JOB}/report`), 'collapsed');
eq('the offline survey shell has no dock', home('/admin/surveys/shell'), 'none');
eq('Dashboard', home('/admin'), 'collapsed');
eq('Dashboard, trailing slash', home('/admin/'), 'collapsed');
eq('Enquiries', home('/admin/enquiries'), 'collapsed');
eq('Enquiries import', home('/admin/enquiries/import'), 'collapsed');
eq('WhatsApp templates', home('/admin/enquiries/templates'), 'collapsed');
eq('Smart replies', home('/admin/enquiries/smart-replies'), 'collapsed');
eq('the inbox hides it', home('/admin/enquiries/inbox'), 'hidden');
eq('an inbox chat hides it', home(`/admin/enquiries/inbox/${JOB}`), 'hidden');
eq('CRM chats hide it', home('/admin/crm/chats'), 'hidden');
eq('a CRM chat hides it', home('/admin/crm/chats/x'), 'hidden');
eq('a CRM chat with ?job=', home(`/admin/crm/chats/${JOB}?job=${JOB}&tab=docs`), 'hidden');
eq('Tasks', home('/admin/tasks'), 'collapsed');
eq('CMS editor', home('/admin/cms'), 'collapsed');
eq('a CMS page', home('/admin/cms/home'), 'collapsed');
eq('Blog', home('/admin/blog'), 'collapsed');
eq('blog preview has no dock', home('/admin/blog/preview'), 'none');
eq('a blog post preview has no dock', home('/admin/blog/preview/my-post'), 'none');
eq('site preview has no dock', home('/admin/preview'), 'none');
eq('Analytics', home('/admin/analytics'), 'collapsed');
eq('Heatmap', home('/admin/analytics/heatmap'), 'collapsed');
eq('Users', home('/admin/users'), 'collapsed');
eq('Setup keys', home('/admin/setup/env'), 'collapsed');
eq('Setup guide', home('/admin/setup/guide/whatsapp'), 'collapsed');
eq('Setup SQL', home('/admin/setup/sql/crm-v3.sql'), 'collapsed');
eq('Metis', home('/admin/assistant'), 'collapsed');
eq('SSO', home('/admin/sso'), 'collapsed');
eq('Get the app', home('/admin/app'), 'collapsed');
eq('Subcontractors', home('/admin/subcontractors'), 'collapsed');
eq('a subcontractor', home('/admin/subcontractors/abc'), 'collapsed');
eq('a printable agreement has no dock', home('/admin/subcontractors/abc/agreement'), 'none');
eq('a printable NTP has no dock', home('/admin/subcontractors/abc/ntp/def'), 'none');
eq('old /admin/<page> links have no dock', home('/admin/about-us'), 'none');
eq('approvals redirect has no dock', home('/admin/approvals'), 'none');
eq('outside admin', home('/'), 'none');
eq('job id from a record page', jobIdFromPath(`/admin/crm/${JOB.toUpperCase()}`), JOB);
eq('no job id on reports', jobIdFromPath('/admin/crm/reports'), null);

// The remembered choice: a = pages that start open, b = pages that start folded.
const ME = 'a1b2c3d4-0000-4000-8000-000000000001';
const OTHER = 'ffee0011-0000-4000-8000-000000000002';
const both = { inbox: true, crm: true };
eq('no cookie', parseDockCookie('', ME), NO_CHOICE);
eq('round trip', parseDockCookie(dockCookieValue(ME, { a: 'c', b: 'o' }), ME), { a: 'c', b: 'o' });
eq("someone else's cookie is ignored", parseDockCookie(dockCookieValue(OTHER, { a: 'c', b: 'o' }), ME), NO_CHOICE);
eq('a broken cookie is ignored', parseDockCookie('a1b2c3d4.x.o', ME), NO_CHOICE);
eq('cookie value', dockCookieValue(ME, { a: 'o', b: '-' }), 'a1b2c3d4.o.-');
eq('cookie from document.cookie', cookieFrom('hx-crm-view=board; hx-dock=a1b2c3d4.c.-', 'hx-dock'), 'a1b2c3d4.c.-');
eq('missing cookie', cookieFrom('hx-crm-view=board', 'hx-dock'), '');

const foldedOnHome = chooseDock(NO_CHOICE, 'open', false);
eq('fold on the CRM home: job pages start folded', effectiveDock(home(`/admin/crm/${JOB}`), foldedOnHome, both), 'collapsed');
eq('fold on the CRM home: the home starts folded', effectiveDock(home('/admin/crm'), foldedOnHome, both), 'collapsed');
eq('fold on the CRM home: Reports still a strip', effectiveDock(home('/admin/crm/reports'), foldedOnHome, both), 'collapsed');
const openOnBoard = chooseDock(NO_CHOICE, 'collapsed', true);
eq('open on the Board: Tasks starts open', effectiveDock(home('/admin/tasks'), openOnBoard, both), 'open');
eq('open on the Board: CMS starts open', effectiveDock(home('/admin/cms'), openOnBoard, both), 'open');
eq('open on the Board: the CRM home is untouched', effectiveDock(home('/admin/crm'), openOnBoard, both), 'open');
const thenFoldHome = chooseDock(openOnBoard, 'open', false);
eq('both halves kept', thenFoldHome, { a: 'c', b: 'o' });
eq('… the home folded', effectiveDock(home('/admin/crm'), thenFoldHome, both), 'collapsed');
eq('… the Board still open', effectiveDock(home('/admin/crm', 'board'), thenFoldHome, both), 'open');
eq('the choice never shows it on the inbox', effectiveDock(home('/admin/enquiries/inbox'), { a: 'o', b: 'o' }, both), 'hidden');
eq('the choice never adds a dock to previews', effectiveDock(home('/admin/preview'), { a: 'o', b: 'o' }, both), 'none');
eq('no Enquiries or CRM access: no dock', effectiveDock(home('/admin/crm'), NO_CHOICE, { inbox: false, crm: false }), 'none');
eq('CRM only: dock', effectiveDock(home('/admin/tasks'), NO_CHOICE, { inbox: false, crm: true }), 'collapsed');
eq('Enquiries only: dock', effectiveDock(home('/admin/tasks'), NO_CHOICE, { inbox: true, crm: false }), 'collapsed');

// Refs (the same cases as P's src/lib/projects/refs.ts).
eq('HX-0042 looks like a ref', looksLikeRef('HX-0042'), true);
eq('hx42 looks like a ref', looksLikeRef('hx42'), true);
eq('0042 looks like a ref', looksLikeRef('0042'), true);
eq('42 does not', looksLikeRef('42'), false);
eq('a name does not', looksLikeRef('Hexham'), false);
eq('HX-0042 finds HX-0042', refMatches('HX-0042', 'HX-0042'), true);
eq('HX-0042 finds HX-0042-2', refMatches('HX-0042', 'HX-0042-2'), true);
eq('hx42 finds HX-0042', refMatches('hx42', 'HX-0042'), true);
eq('hx42 finds HX-0042-2', refMatches('hx42', 'HX-0042-2'), true);
eq('0042 finds HX-0042', refMatches('0042', 'HX-0042'), true);
eq('0042 finds HX-0042-2', refMatches('0042', 'HX-0042-2'), true);
eq('hx-0042-2 finds HX-0042-2', refMatches('hx-0042-2', 'HX-0042-2'), true);
eq('hx-0042-2 does not find HX-0042', refMatches('hx-0042-2', 'HX-0042'), false);
eq('hx-0042-2 does not find HX-0042-3', refMatches('hx-0042-2', 'HX-0042-3'), false);
eq('HX-004 (still typing) finds HX-0042', refMatches('HX-004', 'HX-0042'), true);
eq('42 is not a ref search', refMatches('42', 'HX-0042'), false);
eq('hx43 does not find HX-0042', refMatches('hx43', 'HX-0042'), false);
eq('no ref yet', refMatches('HX-0042', null), false);

const row = { name: 'Jane Smith', phone: '07700 900123', waId: '447700900123', postcode: 'CF10 1AA', customerRef: 'HX-0042', project: { id: 'p', ref: 'HX-0042-2', stage: 'lead', title: 'Jane' } };
eq('search by name', chatMatches('jane', row), true);
eq('search by local number', chatMatches('07700 900', row), true);
eq('search by +44 number', chatMatches('+44 7700 900123', row), true);
eq('search by postcode', chatMatches('cf101', row), true);
eq('search by ref', chatMatches('hx42', row), true);
eq('search by job ref', chatMatches('HX-0042-2', row), true);
eq('42 searches names and numbers, not refs', chatMatches('42', row), false);
eq('no match', chatMatches('Evans', row), false);

// The 24-hour window pill.
const now = Date.parse('2026-10-19T12:00:00Z');
eq('window open', windowPill('2026-10-20T06:30:00Z', now), { open: true, label: 'Free reply · 18h left' });
eq('window closing', windowPill('2026-10-19T12:20:00Z', now), { open: true, label: 'Free reply · 20m left' });
eq('window closed', windowPill('2026-10-19T11:00:00Z', now), { open: false, label: 'Template only' });
eq('never messaged us', windowPill(null, now), { open: false, label: 'Template only' });

// The chat list never sends queued messages or marks chats read (that's for the chat itself).
for (const f of ['src/app/api/whatsapp/active/route.ts', 'src/lib/whatsapp/active.ts']) {
  const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  eq(`${f} never runs the outbox`, /processOutbox/.test(src), false);
  eq(`${f} never marks chats read or changes a row`, /markChatRead|wa_unread:\s*0|\.(update|insert|upsert|delete)\(\s*[{[]?/.test(src.replace(/createHash\([^)]*\)\.update\(/g, '')), false);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
