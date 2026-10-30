/**
 * "How your system works": three moments of a day and where the electricity goes. Pure data, drawn by the PDF and by the web page.
 * Nodes sit on a small grid: home at the top, the sun's panels on the left, the grid on the right and the battery underneath.
 */
export type Node = 'home' | 'solar' | 'grid' | 'battery';
export type Flow = [Node, Node];
export type State = { title: string; caption: string; flows: Flow[]; off: Node[] };

/** Where each node's centre is, in a 160 × 150 panel. */
export const NODE_AT: Record<Node, { x: number; y: number }> = { home: { x: 80, y: 24 }, solar: { x: 24, y: 78 }, grid: { x: 136, y: 78 }, battery: { x: 80, y: 128 } };
export const NODE_LABEL: Record<Node, string> = { home: 'Home', solar: 'Solar', grid: 'Grid', battery: 'Battery' };
export const NODE_SIZE = 30;

export function howItWorks(hasBattery: boolean): State[] {
  const b = hasBattery;
  return [
    {
      title: 'Sunny: more than you need',
      caption: b ? 'Your panels power the home first. Extra charges the battery, and once that is full the rest is sent to the grid.' : 'Your panels power the home first. The extra is sent to the grid.',
      flows: [['solar', 'home'], ...(b ? ([['solar', 'battery']] as Flow[]) : []), ['solar', 'grid']],
      off: [],
    },
    {
      title: 'Cloudy or evening: not enough',
      caption: b ? 'Your panels and then your battery power the home. The grid tops up only what is left.' : 'Your panels power what they can. The grid supplies the rest.',
      flows: [['solar', 'home'], ...(b ? ([['battery', 'home']] as Flow[]) : []), ['grid', 'home']],
      off: [],
    },
    {
      title: 'Night',
      caption: b ? 'The panels rest. Your battery powers the home, and the grid takes over when it runs low.' : 'The panels rest. The home runs on the grid.',
      flows: [...(b ? ([['battery', 'home']] as Flow[]) : []), ['grid', 'home']],
      off: ['solar'],
    },
  ];
}

/** The arrow between two nodes, from the edge of one to the edge of the other, for a panel at (0, 0). */
export function arrow(from: Node, to: Node): { x1: number; y1: number; x2: number; y2: number } {
  const a = NODE_AT[from];
  const b = NODE_AT[to];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const pad = NODE_SIZE / 2 + 4;
  return { x1: a.x + ux * pad, y1: a.y + uy * pad, x2: b.x - ux * pad, y2: b.y - uy * pad };
}
