/**
 * Letter short codes (spec 7.1): 8 characters from an unambiguous alphabet
 * (no 0/O/1/I). 32 symbols, so each byte maps without modulo bias. 40 bits of
 * entropy; uniqueness is enforced by the unique constraint on
 * pv_letters.short_code, so callers retry on conflict.
 */

export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 8;
const CODE_PATTERN = /^[2-9A-HJ-NP-Z]{8}$/;

export function generateShortCode(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const bytes = random(new Uint8Array(CODE_LENGTH));
  let code = '';
  for (const b of bytes) code += CODE_ALPHABET[b & 31];
  return code;
}

/** Upper-cases and trims; returns null if it can never be a valid code. */
export function normaliseShortCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const code = input.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

/** Inserts with a fresh code until the unique constraint is satisfied. */
export async function withUniqueShortCode<T>(
  insert: (code: string) => Promise<{ data: T | null; error: { code?: string } | null }>,
  attempts = 5,
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    const { data, error } = await insert(generateShortCode());
    if (!error && data) return data;
    if (error?.code !== '23505') throw error; // not a unique violation
  }
  throw new Error('Could not allocate a unique short code');
}

export function landingUrl(baseUrl: string, code: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/r/${code}`;
}

/**
 * Pulls a letter code out of whatever someone typed: the bare code, or the
 * whole address from the letter ("heliaxis.co.uk/r/7KQ4M2XA"). null if none.
 */
export function extractShortCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const text = input.trim();
  const direct = normaliseShortCode(text);
  if (direct) return direct;
  const m = text.match(/\/r\/([^/?#\s]+)/i);
  return m ? normaliseShortCode(m[1]) : null;
}
