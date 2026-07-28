/** Escape plain text for safe HTML insertion. */
export function escHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render title/headline copy with optional solar-gold accent spans.
 * Wrap accent words in **double asterisks** — e.g. "Cut bills with **Welsh sunshine.**"
 * Outputs `<span class="y">…</span>` to match the original Heliaxis site design.
 */
export function accentText(s: unknown): string {
  const raw = String(s ?? '');
  if (!raw) return '';

  return raw
    .split(/(\*\*.+?\*\*)/g)
    .map((part) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return `<span class="y">${escHtml(part.slice(2, -2))}</span>`;
      }
      return escHtml(part);
    })
    .join('');
}
