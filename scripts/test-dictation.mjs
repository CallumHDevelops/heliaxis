// Hestia's mic (src/lib/assistant/dictation.ts): Chrome on Android hands back every in-between guess as a
// result of its own, which used to add up to "heyheyhey mattishey mattis…". Folding keeps what was said once.
// Usage: node --experimental-strip-types scripts/test-dictation.mjs
const { fixName, heard, joinSaid } = await import('../src/lib/assistant/dictation.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

// ── The phone in the screenshot: each guess at the same sentence came back as its own result ──
const android = [
  'hey', 'hey', 'hey', 'hey mattis', 'hey mattis', 'hey mattis', 'hey mattis a couple', 'hey mattis a couple of',
  'hey mattis a couple of', 'hey mattis a couple of things', 'hey mattis a couple of things then',
];
eq('growing guesses fold into one sentence', heard(android), 'hey mattis a couple of things then');
eq('…and the name is put right', fixName(heard(['hey', 'hey hester', 'hey hester a couple of things then'])), 'hey Hestia a couple of things then');
eq('a guess with the last word cut short', heard(['hey matt', 'hey mattis a']), 'hey mattis a');
eq('an earlier, shorter guess after a longer one is dropped', heard(['send the quote to dave', 'send the']), 'send the quote to dave');
eq('case and punctuation don’t stop a fold', heard(['Call Dave', 'call dave, tomorrow.']), 'call dave, tomorrow.');
eq('a new sentence after a pause is added on', heard(['hey mattis a couple of things', 'first call dave']), 'hey mattis a couple of things first call dave');
eq('a new sentence that grows is still one sentence', heard(['first one', 'call', 'call dave', 'call dave tomorrow']), 'first one call dave tomorrow');

// ── Chrome on a computer: one result per sentence, later ones starting with a space ──
eq('separate sentences join with one space', heard(['Book a survey for Jones', ' and send the EV guide', ' to Smith']), 'Book a survey for Jones and send the EV guide to Smith');
eq('two sentences that start the same both stay', heard(['call dave tomorrow', 'call sarah on friday']), 'call dave tomorrow call sarah on friday');
eq('the still-changing last guess is shown', heard(['Book a survey', ' and sen']), 'Book a survey and sen');
eq('empty and blank results are ignored', heard(['', '  ', 'hello   there ']), 'hello there');
eq('nothing heard', heard([]), '');

// ── One sentence at a time (Android): the latest guess is the sentence ──
eq('one sentence: latest guess wins', heard(['hey matters', 'hey mattis a couple'], true), 'hey mattis a couple');
eq('one sentence: a blank last result keeps the guess before', heard(['hey mattis', ''], true), 'hey mattis');
eq('one sentence: nothing heard', heard([], true), '');

// ── The name ──
eq('hey Hester', fixName('hey hester can you add a note'), 'hey Hestia can you add a note');
eq('Hesta first', fixName('Hesta, add a task for Esther'), 'Hestia, add a task for Esther');
eq('thanks, hester', fixName('thanks, hester'), 'thanks, Hestia');
eq('ok Fiesta', fixName('OK Fiesta'), 'OK Hestia');
eq('a customer called Hester is left alone', fixName('add a note to John Hester'), 'add a note to John Hester');
eq('Esther the colleague is left alone', fixName('Esther needs the battery guide'), 'Esther needs the battery guide');
eq('a word that only starts the same is left alone', fixName('mattress delivery'), 'mattress delivery');

// ── Joining what was in the box with what was said ──
eq('typed text then dictation', joinSaid('Re: Jones ', 'add a note'), 'Re: Jones add a note');
eq('nothing typed', joinSaid('', 'add a note'), 'add a note');
eq('nothing said yet', joinSaid('Re: Jones', ''), 'Re: Jones');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
