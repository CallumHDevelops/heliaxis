// Imported WhatsApp chats in the CRM: Latest notes' chat rows (one per chat per UK day, merged with the
// timeline page by page), the dock's All chats list, and the contacted rule for chats with messages
// from us, at import and as the catch-up (src/lib/projects/feed.ts,
// src/components/admin/whatsapp/dock-shared.ts, src/lib/crm/contacted-rule.ts).
// Usage: node --experimental-strip-types scripts/test-imported-chats.mjs
import { byPerson, cursorOf, feedOrder, FIRST_AT, groupChatDays, mergeFeed, micros, parseCursor, readChatDays } from '../src/lib/projects/feed.ts';
import { mergeChats, shortAgo } from '../src/components/admin/whatsapp/dock-shared.ts';
import { ukDay } from '../src/lib/bank-holidays.ts';
import { catchUpPick, contactNote, contactPlan, firstOursSince } from '../src/lib/crm/contacted-rule.ts';

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const t = (iso) => Date.parse(iso);
let n = 0;
const msg = (enquiry, at, o = {}) => ({
  id: o.id ?? `m${String(++n).padStart(5, '0')}`,
  enquiry_id: enquiry,
  direction: o.dir ?? 'in',
  kind: o.kind ?? 'text',
  sent_by: o.by ?? null,
  rule_id: o.rule ?? null,
  via: o.via ?? null,
  created_at: at,
});
const newestFirst = (a, b) => t(b.created_at) - t(a.created_at) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/* ── Chat-days in UK time ─────────────────────────────────────────────────── */

// Sat 24 Oct 2026 is BST (UTC+1); the clocks go back at 02:00 on Sun 25 Oct, so Mon 26 Oct is GMT.
const days = groupChatDays(
  [
    msg('e1', '2026-10-26T23:30:00Z', { dir: 'out', by: 'u1' }), // Mon 23:30 GMT: still Monday
    msg('e1', '2026-10-26T09:00:00Z'),
    msg('e1', '2026-10-24T23:30:00Z'), // Sun 00:30 BST: Sunday
    msg('e1', '2026-10-24T22:30:00Z', { dir: 'out', via: 'import' }), // Sat 23:30 BST: Saturday
    msg('e2', '2026-10-24T22:00:00Z', { via: 'import' }),
  ].sort(newestFirst),
  ukDay
);
eq('one row per chat per UK day', days.map((d) => [d.enquiryId, d.day, d.count]), [
  ['e1', '2026-10-26', 2],
  ['e1', '2026-10-25', 1],
  ['e1', '2026-10-24', 1],
  ['e2', '2026-10-24', 1],
]);
eq('the row sits at its last message', days[0].at, '2026-10-26T23:30:00Z');
eq('the last message is the newest', days[0].last.direction, 'out');
eq('ids are fixed per chat and day', days.map((d) => d.id), ['wa:e1:2026-10-26', 'wa:e1:2026-10-25', 'wa:e1:2026-10-24', 'wa:e2:2026-10-24']);
eq('imported counted', days.map((d) => d.imported), [0, 0, 1, 1]);
eq('by a person: theirs, ours by hand, imported, typed in the app', [
  byPerson({ direction: 'in', sent_by: null, via: null }),
  byPerson({ direction: 'out', sent_by: 'u1', via: null }),
  byPerson({ direction: 'out', sent_by: null, via: 'import' }),
  byPerson({ direction: 'out', sent_by: null, via: 'whatsapp-app' }),
], [true, true, true, true]);
eq('automatic: smart reply, chaser, follow-up', [
  byPerson({ direction: 'out', sent_by: null, via: null }),
  byPerson({ direction: 'out', sent_by: null, via: 'chase' }),
  byPerson({ direction: 'out', sent_by: null, via: 'sequence' }),
], [false, false, false]);
// Times as the database gives them (six decimals) still sort properly.
const micro = groupChatDays([msg('e3', '2026-10-20T10:00:00.5+00:00'), msg('e3', '2026-10-20T10:00:00.123456+00:00')], ukDay);
eq('microseconds: the later message wins', micro[0].at, '2026-10-20T10:00:00.5+00:00');

/* ── Places in the feed and mergeFeed ─────────────────────────────────────── */

eq('microseconds count', micros('2026-10-20T10:00:00.123456+00:00') - micros('2026-10-20T10:00:00.123+00:00'), 456);
eq('no decimals', micros('2026-10-20T10:00:00Z') - micros('2026-10-20T09:59:59.999999Z'), 1);
eq('a cursor and back', parseCursor(cursorOf({ at: '2026-10-20T10:00:00.5+00:00', key: 'wa:e1:2026-10-20' })), { at: '2026-10-20T10:00:00.5+00:00', key: 'wa:e1:2026-10-20' });
eq('a bare time from an older page', parseCursor('2026-10-20T10:00:00.000Z'), { at: '2026-10-20T10:00:00.000Z', key: '' });
eq('nonsense', [parseCursor('yesterday'), parseCursor('2026-10-20T10:00:00Z|a,b(c)'), parseCursor(null)], [null, null, null]);
eq(
  'at one moment: the top, then chat rows, then timeline rows',
  [{ at: 'T', id: '3f2b8c1e-0000-0000-0000-000000000000' }, { at: 'T', id: 'wa:e1:2026-10-20' }, { at: 'T', key: FIRST_AT }]
    .map((x) => ({ ...x, at: '2026-10-20T10:00:00Z' }))
    .sort(feedOrder)
    .map((x) => x.key ?? x.id),
  [FIRST_AT, 'wa:e1:2026-10-20', '3f2b8c1e-0000-0000-0000-000000000000']
);

const it = (id, at) => ({ id, at });
eq(
  'merged newest first, cut at the limit',
  mergeFeed([{ items: [it('a1', '2026-10-20T10:00:00Z'), it('a2', '2026-10-20T08:00:00Z')], horizon: null }, { items: [it('w1', '2026-10-20T09:00:00Z')], horizon: null }], 2),
  { items: [it('a1', '2026-10-20T10:00:00Z'), it('w1', '2026-10-20T09:00:00Z')], next: { at: '2026-10-20T09:00:00Z', key: 'w1' } }
);
eq(
  'rows past the other list’s horizon wait',
  mergeFeed(
    [
      { items: [it('a1', '2026-10-20T10:00:00Z'), it('a2', '2026-10-19T10:00:00Z')], horizon: null },
      { items: [it('w1', '2026-10-20T09:00:00Z')], horizon: { at: '2026-10-20T08:00:00Z', key: FIRST_AT } },
    ],
    30
  ),
  { items: [it('a1', '2026-10-20T10:00:00Z'), it('w1', '2026-10-20T09:00:00Z')], next: { at: '2026-10-20T08:00:00Z', key: FIRST_AT } }
);
eq(
  'a row at the very moment a list stopped reading waits too',
  mergeFeed([{ items: [it('a1', '2026-10-20T08:00:00Z')], horizon: null }, { items: [], horizon: { at: '2026-10-20T08:00:00Z', key: FIRST_AT } }], 30).items,
  []
);
eq('the end', mergeFeed([{ items: [it('a1', '2026-10-20T10:00:00Z')], horizon: null }, { items: [], horizon: null }], 30).next, null);

/* ── Paging through everything: each row once, chat-days whole ─────────── */

// An in-memory whatsapp_messages with the same rules as src/lib/whatsapp/chat-feed.ts.
function arrayReader(all) {
  const sorted = [...all].sort(newestFirst);
  const pastCursor = (m, c) => t(m.created_at) < t(c.at) || (t(m.created_at) === t(c.at) && m.id < c.id);
  return {
    async page({ before, cursor, limit }) {
      return sorted.filter((m) => (!before || t(m.created_at) <= t(before)) && (!cursor || pastCursor(m, cursor))).slice(0, limit);
    },
    async rest(ids, from, cursor) {
      return sorted.filter((m) => ids.includes(m.enquiry_id) && t(m.created_at) >= t(from) && pastCursor(m, cursor));
    },
    async busy(ids, after, to) {
      return new Set(sorted.filter((m) => ids.includes(m.enquiry_id) && t(m.created_at) > t(after) && t(m.created_at) < t(to)).map((m) => m.enquiry_id));
    },
  };
}
// The timeline as the route reads it: the rows after the place, `limit` at most.
function timelinePage(acts, before, limit) {
  const list = acts.filter((a) => !before || feedOrder(a, before) > 0).sort(feedOrder);
  const items = list.slice(0, limit);
  return { items, horizon: list.length >= limit ? { at: items[limit - 1].at, key: items[limit - 1].id } : null };
}

// A seeded random two months: imported chats (to the minute, bunched into a few busy minutes, so lots of
// messages share a minute), live chats, automatic-only days, and timeline notes, some at the very same
// moment as a message or as each other.
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const messages = [];
const acts = [];
const base = t('2026-09-01T00:00:00Z');
for (let i = 0; i < 900; i++) {
  const enquiry = `e${Math.floor(rand() * 25)}`;
  const imported = rand() < 0.6;
  const at = imported ? base + Math.floor(rand() * 60) * 86_400_000 + pick([9, 10, 23]) * 3_600_000 + pick([0, 1, 59]) * 60_000 : base + Math.floor(rand() * 60 * 86_400_000);
  const auto = !imported && rand() < 0.15;
  messages.push(
    msg(enquiry, new Date(at).toISOString(), {
      dir: auto || rand() < 0.5 ? 'out' : 'in',
      via: imported ? 'import' : auto ? 'sequence' : null,
      by: !imported && !auto ? 'u1' : null,
    })
  );
}
for (let i = 0; i < 120; i++) {
  const r = rand();
  const at = r < 0.2 ? pick(messages).created_at : r < 0.3 && acts.length ? pick(acts).at : new Date(base + Math.floor(rand() * 60 * 86_400_000)).toISOString();
  acts.push({ id: `3f2b8c1e-0000-0000-0000-${String(i).padStart(12, '0')}`, at });
}
const expected = groupChatDays([...messages].sort(newestFirst), ukDay).filter((d) => d.people > 0);

for (const [limit, pageSize, rounds] of [
  [5, 7, 2],
  [30, 500, 4],
  [3, 4, 1],
  [1, 2, 1],
]) {
  const reader = arrayReader(messages);
  const seen = new Map();
  let twice = 0;
  let before = null;
  let pages = 0;
  let last = null;
  let backwards = 0;
  do {
    const tl = timelinePage(acts, before, limit);
    const wa = await readChatDays(reader, { before, want: limit, dayOf: ukDay, pageSize, rounds });
    const page = mergeFeed([tl, { items: wa.days, horizon: wa.horizon }], limit);
    for (const row of page.items) {
      if (seen.has(row.id)) twice++;
      seen.set(row.id, row);
      if (last && feedOrder(last, row) > 0) backwards++;
      last = row;
    }
    // As the route sends it and reads it back.
    before = page.next ? parseCursor(cursorOf(page.next)) : null;
  } while (before && ++pages < 5000);
  const label = `limit ${limit}, reads of ${pageSize}×${rounds}`;
  eq(`${label}: every note`, acts.filter((a) => !seen.has(a.id)).length, 0);
  eq(`${label}: every busy chat-day`, expected.filter((d) => !seen.has(d.id)).map((d) => d.id), []);
  eq(`${label}: nothing twice`, twice, 0);
  eq(`${label}: no days of automatic messages only`, [...seen.keys()].filter((k) => k.startsWith('wa:') && !expected.some((d) => d.id === k)), []);
  eq(
    `${label}: each chat-day whole (count, imported, time, last message)`,
    expected.filter((d) => {
      const got = seen.get(d.id);
      return !got || got.count !== d.count || got.imported !== d.imported || t(got.at) !== t(d.at) || got.last.id !== d.last.id;
    }).map((d) => d.id),
    []
  );
  eq(`${label}: in order throughout`, backwards, 0);
  eq(`${label}: it ends`, pages < 5000, true);
}

// A chat that carries on past the page break is shown once, whole, on the first page.
{
  const ms = [msg('x', '2026-10-20T15:00:00Z'), msg('x', '2026-10-20T10:00:00Z'), msg('x', '2026-10-20T09:00:00Z')];
  const tl = [it('3f2b8c1e-0000-0000-0000-000000000002', '2026-10-20T12:00:00Z'), it('3f2b8c1e-0000-0000-0000-000000000001', '2026-10-19T12:00:00Z')];
  const r = arrayReader(ms);
  const wa1 = await readChatDays(r, { before: null, want: 2, dayOf: ukDay, pageSize: 2, rounds: 1 });
  eq('a day cut short is counted to its start', wa1.days.map((d) => [d.id, d.count]), [['wa:x:2026-10-20', 3]]);
  const page1 = mergeFeed([timelinePage(tl, null, 2), { items: wa1.days, horizon: wa1.horizon }], 2);
  eq('page 1: the chat, then the note in between', page1.items.map((x) => x.id), ['wa:x:2026-10-20', '3f2b8c1e-0000-0000-0000-000000000002']);
  const wa2 = await readChatDays(r, { before: page1.next, want: 2, dayOf: ukDay });
  eq('page 2: the morning’s messages aren’t a second row', wa2.days.map((d) => d.id), []);
}

/* ── The dock's All chats ─────────────────────────────────────────────────── */

const chat = (threadId, at, o = {}) => ({ threadId, enquiryIds: o.ids ?? [threadId], waId: o.wa ?? null, name: threadId, last: at ? { direction: 'in', body: '', kind: 'text', at } : null, ...o.extra });
eq(
  'the live row wins, newest first, nobody twice',
  mergeChats([chat('a', '2026-10-20T10:00:00Z', { extra: { unread: 2 } })], [chat('a', '2026-10-01T10:00:00Z'), chat('b', '2026-03-01T10:00:00Z'), chat('c', '2026-10-19T10:00:00Z')]).map((r) => [
    r.threadId,
    r.unread ?? 0,
  ]),
  [
    ['a', 2],
    ['c', 0],
    ['b', 0],
  ]
);
eq('the same number is the same chat', mergeChats([chat('a', '2026-10-20T10:00:00Z', { wa: '447700900123' })], [chat('z', '2026-10-01T10:00:00Z', { wa: '447700900123' })]).length, 1);
eq('never messaged goes last', mergeChats([chat('n', null), chat('m', '2026-01-01T10:00:00Z')]).map((r) => r.threadId), ['m', 'n']);
const now = t('2026-10-20T12:00:00Z');
eq('a chat this month', shortAgo('2026-10-01T12:00:00Z', now), '1 Oct');
eq('a chat from last year shows the year', /^14 \w+ 2025$/.test(shortAgo('2025-09-14T12:00:00Z', now)), true);
eq('ten months back is still this year’s format', shortAgo('2026-01-02T12:00:00Z', now), '2 Jan');

/* ── The contacted rule ───────────────────────────────────────────────────── */

const ours = ['2026-09-03T10:15:00Z', '2026-03-01T09:00:00Z', '2026-09-10T08:00:00Z'];
eq('the first of ours since the job came in', firstOursSince(ours, '2026-09-01T12:00:00Z'), '2026-09-03T10:15:00Z');
eq('a reply in the same minute as the enquiry counts', firstOursSince(['2026-09-01T12:00:00Z'], '2026-09-01T12:00:40Z'), '2026-09-01T12:00:00Z');
eq('nothing since', firstOursSince(ours, '2026-10-01T00:00:00Z'), null);
const job = (id, stage, created_at, first_contact_at = null) => ({ id, stage, created_at, first_contact_at });
eq(
  'import: each job not yet contacted, from our first message since it opened',
  contactPlan(
    [
      job('j1', 'lead', '2026-09-01T12:00:00Z'),
      job('j2', 'survey_booked', '2026-02-01T12:00:00Z'),
      job('j3', 'lead', '2026-08-01T12:00:00Z', '2026-08-01T13:00:00Z'),
      job('j4', 'lead', '2026-10-01T12:00:00Z'),
    ],
    { status: 'new', created_at: '2026-02-01T12:00:00Z' },
    ours
  ),
  {
    jobs: [
      { id: 'j1', at: '2026-09-03T10:15:00Z' },
      { id: 'j2', at: '2026-03-01T09:00:00Z' },
    ],
    enquiryAt: null,
  }
);
eq('import: a customer without a job goes from New', contactPlan([], { status: 'new', created_at: '2026-09-01T00:00:00Z' }, ours).enquiryAt, '2026-09-03T10:15:00Z');
eq('import: never from anything but New', contactPlan([], { status: 'qualified', created_at: '2026-09-01T00:00:00Z' }, ours).enquiryAt, null);
eq('import: only the customer wrote', contactPlan([job('j1', 'lead', '2026-09-01T12:00:00Z')], null, []), { jobs: [], enquiryAt: null });

const latest = new Map([
  ['c1', '2026-09-10T08:00:00Z'],
  ['c2', '2026-03-01T09:00:00Z'],
  ['c4', '2026-09-10T08:00:00Z'],
]);
const picked = catchUpPick({
  jobs: [
    { id: 'j1', enquiry_id: 'c1', created_at: '2026-09-01T12:00:00Z' },
    { id: 'j1b', enquiry_id: 'c1', created_at: '2026-09-05T12:00:00Z' },
    { id: 'j2', enquiry_id: 'c2', created_at: '2026-09-01T12:00:00Z' },
    { id: 'j3', enquiry_id: 'c3', created_at: '2026-09-01T12:00:00Z' },
  ],
  loose: [{ id: 'c4', created_at: '2026-09-01T00:00:00Z' }],
  latest,
});
eq('catch-up: jobs messaged since they opened', picked.jobs.map((j) => j.id), ['j1', 'j1b']);
eq('catch-up: an old chat doesn’t move a newer enquiry', picked.jobs.some((j) => j.id === 'j2'), false);
eq('catch-up: never messaged, not moved', picked.jobs.some((j) => j.id === 'j3'), false);
eq('catch-up: customers once each, jobless ones too', picked.customers, ['c1', 'c4']);

eq('the timeline note', contactNote('2026-09-03T10:15:00Z', t('2026-10-20T12:00:00Z')), 'messaged on WhatsApp on 3 Sep');
eq('a UK date: 23:30 UTC on 2 Sep is the 3rd', contactNote('2026-09-02T23:30:00Z', t('2026-10-20T12:00:00Z')), 'messaged on WhatsApp on 3 Sep');
eq('the year when it isn’t this year', contactNote('2025-12-31T12:00:00Z', t('2026-10-20T12:00:00Z')), 'messaged on WhatsApp on 31 Dec 2025');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
