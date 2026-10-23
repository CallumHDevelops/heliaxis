// Dashboard → New Meta leads (src/lib/meta-lead-followup.ts): who's on the card and why. Not anyone
// with a message lined up; free chat ending within 6 hours; still at New; or gone quiet for a day after
// we got in touch (Contacted, no survey booked, came in within 30 days). Most urgent first.
// Usage: node --experimental-strip-types scripts/test-meta-lead-followup.mjs
const { byUrgency, followUp, leftWords } = await import('../src/lib/meta-lead-followup.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const now = Date.parse('2026-10-23T12:00:00Z');
const H = 3_600_000;
const D = 24 * H;
const ago = (ms) => new Date(now - ms).toISOString();
const free = { queued: false, surveyBooked: false, now };
const why = (lead, opts = free) => followUp(lead, opts)?.label ?? null;
const lead = (o) => ({ status: 'new', created_at: ago(2 * H), wa_last_inbound_at: null, wa_last_message_at: null, ...o });

// ── Lined up, booked or further on: never on the card ──
eq('a scheduled message (or the automatic first one) hides a new lead', why(lead({}), { ...free, queued: true }), null);
eq('… and one whose free chat is ending', why(lead({ wa_last_inbound_at: ago(20 * H) }), { ...free, queued: true }), null);
eq('a survey booked hides them', why(lead({ status: 'contacted', wa_last_message_at: ago(3 * D) }), { ...free, surveyBooked: true }), null);
for (const status of ['qualified', 'won', 'lost']) eq(`${status}: not on the card`, why(lead({ status, wa_last_inbound_at: ago(20 * H) })), null);

// ── Not contacted ──
eq('new, no chat: not contacted', why(lead({})), 'Not contacted');
eq('new, an old lead: still not contacted', why(lead({ created_at: ago(90 * D) })), 'Not contacted');
eq('new, they messaged 2h ago: not contacted (plenty of free chat left)', why(lead({ wa_last_inbound_at: ago(2 * H) })), 'Not contacted');

// ── Free chat ends soon ──
eq('new, they messaged 20h ago: free chat ending wins', why(lead({ wa_last_inbound_at: ago(20 * H) })), 'Free chat ends in 4h');
eq('contacted, 18h ago: exactly 6h left counts', why(lead({ status: 'contacted', wa_last_inbound_at: ago(18 * H), wa_last_message_at: ago(18 * H) })), 'Free chat ends in 6h');
eq('contacted, 17h59 ago: not yet', why(lead({ status: 'contacted', wa_last_inbound_at: ago(18 * H - 60_000), wa_last_message_at: ago(H) })), null);
eq('contacted, 23h50 ago: minutes', why(lead({ status: 'contacted', wa_last_inbound_at: ago(23 * H + 50 * 60_000), wa_last_message_at: ago(20 * H) })), 'Free chat ends in 10 min');
eq('… even when we answered last', why(lead({ status: 'contacted', wa_last_inbound_at: ago(20 * H), wa_last_message_at: ago(19 * H) })), 'Free chat ends in 4h');
eq('contacted, the window has closed: not "ending"', why(lead({ status: 'contacted', wa_last_inbound_at: ago(24 * H + 1), wa_last_message_at: ago(H) })), null);

// ── Gone quiet ──
eq('contacted, nothing for 25h: quiet for 1 day', why(lead({ status: 'contacted', created_at: ago(3 * D), wa_last_message_at: ago(25 * H) })), 'Quiet for 1 day');
eq('contacted, nothing for 3 days', why(lead({ status: 'contacted', created_at: ago(5 * D), wa_last_inbound_at: ago(4 * D), wa_last_message_at: ago(3 * D) })), 'Quiet for 3 days');
eq('contacted, our message 2h ago: not quiet yet', why(lead({ status: 'contacted', created_at: ago(3 * D), wa_last_message_at: ago(2 * H) })), null);
eq('contacted, came in 40 days ago: too old for the card', why(lead({ status: 'contacted', created_at: ago(40 * D), wa_last_message_at: ago(3 * D) })), null);
eq('contacted, no WhatsApp at all (a phone call, say): not judged', why(lead({ status: 'contacted', created_at: ago(3 * D) })), null);

// ── Order ──
const rows = [
  ['quiet 3d', lead({ status: 'contacted', created_at: ago(5 * D), wa_last_message_at: ago(3 * D) })],
  ['new old', lead({ created_at: ago(5 * H) })],
  ['closing 5h', lead({ status: 'contacted', wa_last_inbound_at: ago(19 * H), wa_last_message_at: ago(19 * H) })],
  ['quiet 1d', lead({ status: 'contacted', created_at: ago(5 * D), wa_last_message_at: ago(25 * H) })],
  ['new newest', lead({ created_at: ago(10 * 60_000) })],
  ['closing 1h', lead({ wa_last_inbound_at: ago(23 * H) })],
];
eq(
  'most urgent first: soonest-closing, newest not contacted, most recently quiet',
  rows
    .map(([k, l]) => ({ k, f: followUp(l, free) }))
    .sort((a, b) => byUrgency(a.f, b.f))
    .map((x) => x.k),
  ['closing 1h', 'closing 5h', 'new newest', 'new old', 'quiet 1d', 'quiet 3d']
);

eq('leftWords', [leftWords(5 * H + 20 * 60_000), leftWords(H), leftWords(40 * 60_000), leftWords(61_000), leftWords(5_000)], ['5h', '1h', '40 min', 'a minute', 'a minute']);

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
