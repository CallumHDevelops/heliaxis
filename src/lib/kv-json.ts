/**
 * cms_kv keeps every value as text, so settings are saved as a JSON string and read back by parsing it.
 * (Saving a plain object into a text column is rejected by the database, which is why a save must check
 * for an error rather than assume it worked.)
 */
export function parseKv<T extends object>(value: unknown): Partial<T> {
  if (!value) return {};
  if (typeof value === 'object') return value as Partial<T>;
  if (typeof value !== 'string') return {};
  try {
    const v = JSON.parse(value);
    return v && typeof v === 'object' ? (v as Partial<T>) : {};
  } catch {
    return {};
  }
}

export const toKv = (value: object) => JSON.stringify(value);
