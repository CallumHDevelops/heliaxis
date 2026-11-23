/**
 * A person's name as a key for spotting the same person twice: "Mr Steve  WARD" and "steve ward" are the same key. Needs a first and a
 * last name (a single name like "David" matches too many people), and ignores titles and accents. Pure.
 */
const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'prof', 'sir', 'lady', 'lord']);
const NOT_A_NAME = /^(meta lead|whatsapp|unknown|customer|no name|test)\b/i;

export function nameKey(name: string | null | undefined): string | null {
  const raw = String(name ?? '').trim();
  if (!raw || NOT_A_NAME.test(raw) || /\d/.test(raw)) return null;
  const words = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’-]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !TITLES.has(w));
  if (words.length < 2 || words.join('').length < 5) return null;
  return words.join(' ');
}
