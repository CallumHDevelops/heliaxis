// WhatsApp chats kept on the import page until they're imported or removed (src/lib/whatsapp/import-pending.ts):
// ids, what's stored, the choices saved for each row and the "Saved …" line.
// Usage: node --experimental-strip-types scripts/test-wa-import-pending.mjs
import { createHash } from 'node:crypto';
import {
  chatHash,
  choicesOf,
  cleanChoices,
  isPendingId,
  isPendingPath,
  pendingKey,
  readEntry,
  restoreChoices,
  savedLabel,
  shownChat,
} from '../src/lib/whatsapp/import-pending.ts';

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

// The browser's id for a chat is the server's (node:crypto), so the same chat is spotted on both sides.
const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
for (const [name, text] of [
  ['plain text', '18/10/2026, 14:32 - Jane Smith: Hi, is Thursday ok?'],
  ['accents, emoji, curly quotes', '[18/10/2026, 14:32:05] Siân Llŷr: Diolch 👍 “ok”\n‎<attached: 00000012-PHOTO.jpg>'],
  ['empty', ''],
]) {
  eq(`chatHash matches the server: ${name}`, await chatHash(text), sha(text));
}
const id = sha('chat');
eq('chatHash is an id', isPendingId(await chatHash('chat')), true);
eq('key', pendingKey(id), `wa-import-pending:${id}`);

// Ids and paths: only what the server makes.
eq('id: uppercase refused', isPendingId(id.toUpperCase()), false);
eq('id: too short', isPendingId(id.slice(1)), false);
eq('id: not a string', isPendingId(42), false);
const path = 'pending/0b6f3c3e-5d2a-4c39-9a51-1f2e3d4c5b6a.txt';
eq('path: ours', isPendingPath(path), true);
eq('path: from a file name', isPendingPath('pending/WhatsApp Chat with Jane.txt'), false);
eq('path: climbs out', isPendingPath('pending/../0b6f3c3e-5d2a-4c39-9a51-1f2e3d4c5b6a.txt'), false);
eq('path: another folder', isPendingPath('0b6f3c3e-5d2a-4c39-9a51-1f2e3d4c5b6a/photos/0b6f3c3e-5d2a-4c39-9a51-1f2e3d4c5b6a.txt'), false);

// Choices: only what the import route would take.
const uuid = '6f1c2b9e-4a3d-4e5f-8a7b-1c2d3e4f5a6b';
eq('choices: nothing', cleanChoices(undefined), {});
eq('choices: junk', cleanChoices({ us: 'Jane', customer: { kind: 'boss' }, extra: 1 }), {});
eq('choices: us an author', cleanChoices({ us: 'a:Callum (Heliaxis)' }), { us: 'a:Callum (Heliaxis)' });
eq('choices: us nobody', cleanChoices({ us: 'none' }), { us: 'none' });
eq('choices: us empty author', cleanChoices({ us: 'a:' }), {});
eq('choices: us too long', cleanChoices({ us: `a:${'x'.repeat(201)}` }), {});
eq(
  'choices: a match, trimmed to what matters',
  cleanChoices({ customer: { kind: 'match', id: uuid, name: 'Jane Smith', phone: '07700 900123', email: '', byPhone: 'yes', postcode: 'NP20 1AA' } }),
  { customer: { kind: 'match', id: uuid, name: 'Jane Smith', phone: '07700 900123', email: null, byPhone: false } }
);
eq('choices: a match without a proper id', cleanChoices({ customer: { kind: 'match', id: '1; drop table', name: 'x' } }), {});
eq('choices: a new lead, long fields cut', cleanChoices({ customer: { kind: 'new', name: 'J'.repeat(300), phone: '0'.repeat(60) } }), {
  customer: { kind: 'new', name: 'J'.repeat(200), phone: '0'.repeat(40) },
});
eq('choices: searching', cleanChoices({ customer: { kind: 'search', q: 7 } }), { customer: { kind: 'search', q: '' } });

// A row's choices → saved → a row again, the same; saved twice gives the same JSON (so nothing's resent).
const row = { us: undefined, picked: false, match: null, adding: false, newName: '', newPhone: '', q: '' };
const match = { id: uuid, name: 'Jane Smith', phone: null, email: 'jane@example.com', byPhone: true };
const cases = [
  ['untouched', row, {}],
  ['only who Heliaxis is', { ...row, us: 'a:Callum' }, { us: 'a:Callum' }],
  ['found by number, not picked: looked up again next time', { ...row, match, adding: false }, {}],
  ['picked someone', { ...row, us: 'none', picked: true, match: { ...match, postcode: 'NP20 1AA' } }, { us: 'none', customer: { kind: 'match', ...match } }],
  ['adding them', { ...row, picked: true, adding: true, newName: 'Jane', newPhone: '07700 900123' }, { customer: { kind: 'new', name: 'Jane', phone: '07700 900123' } }],
  ['searching', { ...row, picked: true, q: 'Jane' }, { customer: { kind: 'search', q: 'Jane' } }],
];
for (const [name, r, want] of cases) {
  const saved = choicesOf(r);
  eq(`choicesOf: ${name}`, saved, want);
  const back = { ...row, ...restoreChoices(JSON.parse(JSON.stringify(saved))) };
  eq(`round trip: ${name}`, JSON.stringify(choicesOf(back)), JSON.stringify(saved));
  eq(`cleaned again unchanged: ${name}`, JSON.stringify(cleanChoices(JSON.parse(JSON.stringify(saved)))), JSON.stringify(saved));
}
eq('restore: a match', restoreChoices({ customer: { kind: 'match', ...match } }), { us: undefined, picked: true, match, adding: false });
eq('restore: adding', restoreChoices({ us: 'a:Callum', customer: { kind: 'new', name: '', phone: '07700 900123' } }), {
  us: 'a:Callum',
  picked: true,
  match: null,
  adding: true,
  newName: '',
  newPhone: '07700 900123',
});
eq('restore: nothing chosen', restoreChoices({}), { us: undefined, picked: false });

// Stored entries.
const entry = {
  id,
  path,
  fileName: 'WhatsApp Chat with Jane Smith.txt',
  title: 'Jane Smith',
  size: 1234,
  uploadedAt: '2026-10-18T13:32:05.000Z',
  uploadedBy: { id: uuid, name: 'Callum' },
  choices: { us: 'a:Callum', customer: { kind: 'search', q: 'Jane' } },
};
eq('entry: read back', readEntry(JSON.stringify(entry)), entry);
eq('entry: odd choices cleaned', readEntry(JSON.stringify({ ...entry, choices: { us: 1, customer: { kind: 'x' } } }))?.choices, {});
eq('entry: no path', readEntry(JSON.stringify({ ...entry, path: undefined })), null);
eq('entry: a path from the file name', readEntry(JSON.stringify({ ...entry, path: 'pending/WhatsApp Chat with Jane Smith.txt' })), null);
eq('entry: bad id', readEntry(JSON.stringify({ ...entry, id: 'abc' })), null);
eq('entry: not JSON', readEntry('{nope'), null);
eq('entry: null', readEntry(null), null);
eq('entry: an array', readEntry('[]'), null);
eq('entry: missing bits filled in', readEntry(JSON.stringify({ id, path })), {
  id,
  path,
  fileName: '',
  title: null,
  size: 0,
  uploadedAt: '',
  uploadedBy: { id: '', name: null },
  choices: {},
});
const shown = shownChat(entry);
eq('shown: no path for the page', 'path' in shown, false);
eq('shown: the rest', shown.fileName, entry.fileName);

// "Saved …" in UK time.
const now = new Date('2026-10-19T09:00:00Z'); // Mon 19 Oct, 10:00 BST
eq('saved today', savedLabel('2026-10-19T08:00:00Z', 'Callum', now), 'Saved today by Callum');
eq('saved just after midnight UK, still today', savedLabel('2026-10-18T23:30:00Z', null, now), 'Saved today');
eq('saved yesterday', savedLabel('2026-10-18T22:30:00Z', 'Esther', now), 'Saved yesterday by Esther');
eq('saved earlier this year', savedLabel('2026-03-03T12:00:00Z', null, now), 'Saved 3 Mar');
eq('saved last year', savedLabel('2025-12-31T12:00:00Z', 'Callum', now), 'Saved 31 Dec 2025 by Callum');
eq('saved: no date', savedLabel('', 'Callum', now), 'Saved');
// The day after the clocks go back (Sun 25 Oct is 25 hours long).
const after = new Date('2026-10-26T00:30:00Z'); // Mon 26 Oct, 00:30 GMT
eq('yesterday across the clocks going back', savedLabel('2026-10-24T23:30:00Z', null, after), 'Saved yesterday'); // 00:30 BST Sun 25
eq('two days before, across the clocks going back', savedLabel('2026-10-24T22:30:00Z', null, after), 'Saved 24 Oct');
// The day after the clocks go forward (Sun 29 Mar is 23 hours long).
const spring = new Date('2026-03-30T00:30:00+01:00'); // Mon 30 Mar, 00:30 BST
eq('yesterday across the clocks going forward', savedLabel('2026-03-29T00:15:00Z', null, spring), 'Saved yesterday');
eq('new year', savedLabel('2025-12-31T23:30:00Z', null, new Date('2026-01-01T09:00:00Z')), 'Saved yesterday');

console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
