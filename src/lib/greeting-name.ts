/** How to greet someone from the name on their record: "Sam Williams" → "Sam", "Mrs Smith" → "Mrs Smith" (never just "Mrs"). */
const TITLE = /^(mr|mrs|ms|miss|mx|dr|prof|rev|sir|lady|lord)\.?$/i;

export function greetingName(full: string | null | undefined): string {
  const words = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (!TITLE.test(words[0])) return words[0];
  // A title first: the first name if there is one ("Mrs Jane Smith" → "Jane"), else the title with the surname ("Mrs Smith").
  if (words.length >= 3) return words[1];
  return words.join(' ');
}

/** "Hollyberry House,, NP26 5SA" → "Hollyberry House, NP26 5SA": empty and doubled commas out. */
export const tidyAddress = (a: string | null | undefined): string =>
  String(a ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .join(', ');
