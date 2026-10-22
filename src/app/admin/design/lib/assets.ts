/** Brand SVG assets (logos, spark, icons) — fetched once from the brand kit and cached. */

const cache = new Map<string, Promise<string>>();

export function brandSvg(name: string): Promise<string> {
  if (!cache.has(name)) {
    cache.set(
      name,
      fetch(`/api/brand/asset/${name}`, { credentials: 'same-origin' }).then((r) => {
        if (!r.ok) throw new Error(`Couldn’t load ${name}`);
        return r.text();
      }),
    );
  }
  return cache.get(name)!;
}

export type IconTone = 'ink' | 'paper' | 'gold';
const TONE: Record<IconTone, string> = { ink: '#211F18', paper: '#F7F2E7', gold: '#F8BC1E' };

/** One icon from the sprite as a standalone SVG, stroked in the chosen tone (gold tint kept). */
export async function iconSvg(name: string, tone: IconTone = 'ink'): Promise<string> {
  const sprite = await brandSvg('heliaxis-icons.svg');
  const m = new RegExp(`<symbol id="ic-${name}"([^>]*)>([\\s\\S]*?)</symbol>`).exec(sprite);
  if (!m) throw new Error(`No icon called ${name}`);
  const attrs = m[1].replace(/\sid="[^"]*"/, '').replace(/viewBox="[^"]*"/, '');
  const stroke = TONE[tone];
  const g = attrs.replace(/stroke="#211F18"/i, `stroke="${stroke}"`);
  // The invisible 24×24 box keeps every icon on the same footprint — without it fabric sizes an
  // icon by its drawn extent, so a tall narrow one (battery) comes out bigger than its neighbours.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="0" y="0" width="24" height="24" fill="none" stroke="none" stroke-width="0"/><g${g}>${m[2]}</g></svg>`;
}
