/**
 * The text for a <script type="application/ld+json"> from a page's stored structured data: JSON text (what the
 * Search content studio publishes) or an object. Bad JSON gives null. "<" is escaped so nothing inside the JSON can
 * close the script tag.
 */
export function jsonLdScript(ld: unknown): string | null {
  let v: unknown = ld;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v && typeof v === 'object' ? JSON.stringify(v).replace(/</g, '\\u003c') : null;
}
