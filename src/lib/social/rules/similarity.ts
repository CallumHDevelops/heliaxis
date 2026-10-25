/** Word-level similarity helpers: how far a reworded line has drifted from its approved wording. */

export function words(s: string): string[] {
  return (s.toLowerCase().replace(/[‘’]/g, "'").match(/[\p{L}\p{N}'%£]+/gu) ?? []).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean);
}

/** Edit distance between two word lists. */
export function editDistance(a: string[], b: string[]): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** 1 = identical wording, 0 = nothing in common. */
export function similarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  const longest = Math.max(wa.length, wb.length);
  if (longest === 0) return 1;
  return 1 - editDistance(wa, wb) / longest;
}

/** The longest run of consecutive words (after normalising) that the two texts share. */
export function longestSharedRun(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  let best = 0;
  let prev = new Array<number>(wb.length + 1).fill(0);
  for (let i = 1; i <= wa.length; i++) {
    const cur = new Array<number>(wb.length + 1).fill(0);
    for (let j = 1; j <= wb.length; j++) {
      if (wa[i - 1] === wb[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) best = cur[j];
      }
    }
    prev = cur;
  }
  return best;
}

/**
 * The checks on a "light rewording" (docs/social-monitoring/04-reply-engine.md §5): close to the approved
 * wording, and no new numbers, prices, links or names. If it fails, the caller uses the approved wording.
 */
export function lightRewordOk(variant: string, reworded: string, allowedCapitalised: string[] = []): boolean {
  if (similarity(variant, reworded) < 0.75) return false;
  const introduces = (re: RegExp) => re.test(reworded) && !re.test(variant);
  if (introduces(/\d/) || introduces(/[£%]/) || introduces(/https?:|www\.|\.co\.uk|\.com/i)) return false;
  const known = new Set([...words(variant), ...allowedCapitalised.map((w) => w.toLowerCase())]);
  for (const sentence of reworded.split(/(?<=[.!?])\s+/)) {
    const ws = sentence.match(/[\p{L}'’]+/gu) ?? [];
    for (const w of ws.slice(1)) {
      if (/^[A-Z]/.test(w) && w.length > 1 && !known.has(w.toLowerCase())) return false;
    }
  }
  return true;
}
