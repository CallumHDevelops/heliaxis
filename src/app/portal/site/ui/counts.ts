/**
 * The counters over a photo slot (PhotoSlot, so every form's slots and the put right's) and a
 * serial list (ScanField and the scanner). Pure, so scripts/test-site-app.mjs checks the words.
 */

/** "1 of 2 needed" until there are enough, then "3 photos ✓" (more than needed is fine: never "3 of 2 ✓"). */
export function photoCount(n: number, need: number): string {
  const photos = `${n} photo${n === 1 ? '' : 's'}`;
  if (need) return n >= need ? `${photos} ✓` : `${n} of ${need} needed`;
  return n ? photos : 'Only if there’s something to show';
}

/**
 * "1 of 2" until the list is complete, "2 scanned ✓" when it is, and "2 scanned, 1 expected" when
 * there are more serials than the job has of that thing (the rules flag that too, so no tick).
 */
export function scanCount(n: number, need: number): { text: string; done: boolean } {
  if (!need) return { text: n ? `${n} scanned` : 'None yet', done: false };
  if (n < need) return { text: `${n} of ${need}`, done: false };
  if (n === need) return { text: `${n} scanned ✓`, done: true };
  return { text: `${n} scanned, ${need} expected`, done: false };
}
