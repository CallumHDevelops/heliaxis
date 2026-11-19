/**
 * M5 citations: does the name, address and phone a directory shows match Settings › Business facts? Pure, so the
 * normalising rules (phone formats, address abbreviations, "Ltd" and "Limited") are tested.
 */

/** UK phone numbers to one form: digits only, +44 / 0044 / (0) turned into a leading 0. */
export function normalisePhone(v: string | null | undefined): string {
  let s = String(v ?? '').trim();
  if (!s) return '';
  s = s.replace(/\(0\)/g, '');
  let d = s.replace(/[^\d+]/g, '');
  if (d.startsWith('+44')) d = `0${d.slice(3)}`;
  else if (d.startsWith('0044')) d = `0${d.slice(4)}`;
  else if (d.startsWith('44') && d.length === 12) d = `0${d.slice(2)}`;
  d = d.replace(/\D/g, '');
  return d;
}

const NAME_SUFFIX = /\b(limited|ltd|llp|plc|uk|group)\b\.?/g;

/** Business names without case, punctuation or a company suffix: "HELIAXIS LTD." = "Heliaxis Limited" = "Heliaxis". */
export function normaliseName(v: string | null | undefined): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(NAME_SUFFIX, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

/** The UK postcode in an address, upper case with no space ("NP20 1AB" → "NP201AB"), or ''. */
export function postcodeOf(v: string | null | undefined): string {
  const m = POSTCODE.exec(String(v ?? ''));
  return m ? `${m[1]}${m[2]}`.toUpperCase() : '';
}

const ABBR: Record<string, string> = {
  rd: 'road',
  st: 'street',
  ave: 'avenue',
  av: 'avenue',
  ln: 'lane',
  dr: 'drive',
  cl: 'close',
  ct: 'court',
  cres: 'crescent',
  pl: 'place',
  sq: 'square',
  terr: 'terrace',
  tce: 'terrace',
  pk: 'park',
  ind: 'industrial',
  est: 'estate',
  bus: 'business',
  ctr: 'centre',
  center: 'centre',
  hse: 'house',
  bldg: 'building',
  no: '',
};
/** Words that say where, not which address: left out of the comparison. */
const FILLER = new Set(['uk', 'united', 'kingdom', 'gb', 'wales', 'cymru', 'england', 'gwent', 'monmouthshire', 'and', 'the', 'of', 'unit', 'units', 'flat', 'suite']);

/** An address as a set of words: lower case, abbreviations spelled out, postcode and filler removed. */
export function addressWords(v: string | null | undefined): string[] {
  const s = String(v ?? '')
    .replace(POSTCODE, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');
  const words = s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w in ABBR ? ABBR[w] : w))
    .filter((w) => w && !FILLER.has(w));
  return [...new Set(words)];
}

/** The same address? Same postcode (when both have one) and most of the shorter address's words in the longer one. */
export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = postcodeOf(a);
  const pb = postcodeOf(b);
  if (pa && pb && pa !== pb) return false;
  const wa = addressWords(a);
  const wb = addressWords(b);
  // Only a postcode on one side: the postcodes decide.
  if (!wa.length || !wb.length) return !!pa && pa === pb;
  // Numbers must agree: "12 High Street" is not "21 High Street".
  const nums = (ws: string[]) => ws.filter((w) => /^\d+[a-z]?$/.test(w)).sort().join(',');
  if (nums(wa) && nums(wb) && nums(wa) !== nums(wb)) return false;
  const [short, long] = wa.length <= wb.length ? [wa, new Set(wb)] : [wb, new Set(wa)];
  const hit = short.filter((w) => long.has(w)).length;
  return hit / short.length >= 0.75;
}

export type NapField = 'name' | 'address' | 'phone';
export type NapCheck = { field: NapField; state: 'match' | 'mismatch' | 'not_shown' | 'no_fact'; shown: string; fact: string };

export type BusinessFacts = { name: string; address: string; phone: string };
export type Shown = { name_shown?: string | null; address_shown?: string | null; phone_shown?: string | null };

/** Each of name, address and phone on a listing against the business facts. */
export function compareNap(facts: BusinessFacts, shown: Shown): NapCheck[] {
  const one = (field: NapField, fact: string, s: string | null | undefined, same: (a: string, b: string) => boolean): NapCheck => {
    const v = String(s ?? '').trim();
    const f = String(fact ?? '').trim();
    if (!v) return { field, state: 'not_shown', shown: '', fact: f };
    if (!f) return { field, state: 'no_fact', shown: v, fact: '' };
    return { field, state: same(f, v) ? 'match' : 'mismatch', shown: v, fact: f };
  };
  return [
    one('name', facts.name, shown.name_shown, (a, b) => normaliseName(a) === normaliseName(b)),
    one('address', facts.address, shown.address_shown, sameAddress),
    one('phone', facts.phone, shown.phone_shown, (a, b) => normalisePhone(a) === normalisePhone(b)),
  ];
}

/** True when any shown value disagrees with the facts. */
export const napMismatch = (checks: NapCheck[]) => checks.some((c) => c.state === 'mismatch');
