/**
 * A WhatsApp template's wording with its blanks filled in, for the chat: what the customer saw.
 * No imports: scripts/test-template-fill.mjs loads this file straight into node.
 */

type Parts = { header: string | null; body: string; footer: string | null; buttons: string[] };

export function fillTemplate(t: Parts, params: string[]): string {
  const fill = (s: string) => s.replace(/\{\{(\d+)\}\}/g, (all, n: string) => params[Number(n) - 1] ?? all);
  // A picture or document header ("[image]") isn't something to show as text.
  const header = t.header && !/^\[.*\]$/.test(t.header) ? fill(t.header) : '';
  const lines = [header, fill(t.body), t.footer ?? ''].filter(Boolean);
  if (t.buttons.length) lines.push(t.buttons.map((b) => `[${b}]`).join(' '));
  return lines.join('\n\n');
}

/** "Template “name” (a, b)", how sends were saved before the wording was kept. */
export function parseTemplateNote(body: string | null): { name: string; raw: string } | null {
  const m = body?.match(/^Template “([a-z0-9_]+)”(?: \(([\s\S]*)\))?$/);
  return m ? { name: m[1], raw: m[2] ?? '' } : null;
}
