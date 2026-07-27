import { ICON_SPRITE } from './iconSprite';

export interface IconPath {
  d: string;
  fill: boolean; // filled shape (accent tint) vs stroked line
}

let parsed: Record<string, IconPath[]> | null = null;

function ensure() {
  if (parsed) return;
  parsed = {};
  if (typeof DOMParser === 'undefined') return; // SSR — parsed lazily on the client
  try {
    const doc = new DOMParser().parseFromString(ICON_SPRITE, 'image/svg+xml');
    doc.querySelectorAll('symbol').forEach((sym) => {
      const id = sym.getAttribute('id');
      if (!id) return;
      parsed![id] = Array.from(sym.querySelectorAll('path')).map((p) => ({
        d: p.getAttribute('d') || '',
        fill: p.getAttribute('stroke') === 'none',
      }));
    });
  } catch {
    parsed = {};
  }
}

/** SVG path data for an icon id (e.g. "ic-solar"), split into fill vs stroke paths. */
export function getIconPaths(id: string): IconPath[] {
  ensure();
  return (parsed && parsed[id]) || [];
}

/** "ic-battery-full" -> "Battery Full" */
export function prettifyIcon(id: string): string {
  return id
    .replace(/^ic-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
