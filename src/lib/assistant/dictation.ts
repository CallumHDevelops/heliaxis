/*
 * Turning the browser's speech-to-text results into the words that were said (Metis's mic button).
 *
 * Chrome on Android doesn't do continuous listening properly: rather than one result per sentence it
 * hands back each in-between guess as a result of its own — "hey", "hey", "hey mattis", "hey mattis a
 * couple"… — and adding those up gave "heyheyhey mattishey mattis a couple". So the phone listens one
 * sentence at a time and starts again (AssistantView), and whatever comes back is folded here: a result
 * that only repeats or grows the one before it replaces it instead of being added on.
 */

/** Lower-case words with the punctuation taken off, for comparing guesses. */
function words(s: string) {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .split(' ')
    .filter(Boolean);
}

/** True when `a` is the start of `b` — the last word of `a` may be cut short ("hey matt" → "hey mattis a"). */
function startsWith(b: string[], a: string[]) {
  if (!a.length || a.length > b.length) return false;
  return a.every((w, i) => (i === a.length - 1 ? b[i].startsWith(w) : b[i] === w));
}

/**
 * What was said, from the transcripts of a recognition session's results in order.
 * `oneSentence`: the session was started for a single sentence, so every result is a guess at that
 * same sentence and the latest one is the best.
 */
export function heard(transcripts: string[], oneSentence = false): string {
  const parts = transcripts.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (oneSentence) return parts.at(-1) ?? '';
  const out: string[] = [];
  for (const t of parts) {
    const prev = out.at(-1);
    if (prev !== undefined) {
      const p = words(prev);
      const w = words(t);
      if (startsWith(p, w)) continue; // the same guess again, or an earlier, shorter one
      if (startsWith(w, p)) {
        out[out.length - 1] = t; // the same sentence, grown
        continue;
      }
    }
    out.push(t);
  }
  return out.join(' ');
}

/** Voice typing doesn't know the name: "hey Mattis" / "Matisse, can you…" are Metis. */
const MISHEARD = 'mattis|matisse|mattys|mathis|matis|metis|mettis|metus|mattes';
const GREETING = new RegExp(`\\b(hey|hi|hiya|hello|ok|okay|right|thanks|thank you|cheers|morning|evening)(,?\\s+)(?:${MISHEARD})\\b`, 'gi');
const OPENING = new RegExp(`^(?:${MISHEARD})\\b`, 'i');

export function fixName(s: string) {
  return s.replace(GREETING, '$1$2Metis').replace(OPENING, 'Metis');
}

/** Text already in the box, then what's been said, with one space between. */
export function joinSaid(...parts: string[]) {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' ');
}
