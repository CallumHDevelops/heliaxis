/**
 * GET /api/prospectpv/tiles/{z}/{x}/{y} — OS basemap tiles, fetched with the key
 * on the server so it never reaches the browser or a tile URL. Staff only.
 *
 * UNVERIFIED (docs.os.uk wasn't reachable): the OS Maps API ZXY path, the layer
 * name and its zoom range. Decision 5 (basemap product and licence) is still
 * open, so the layer is a setting: PROSPECTPV_OS_TILE_LAYER (default Light_3857).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { staffOrNull } from '@/lib/prospectpv/server/auth';
import { osKey } from '@/lib/prospectpv/server/osPlaces';

export const dynamic = 'force-dynamic';

const LAYERS = new Set(['Road_3857', 'Outdoor_3857', 'Light_3857']);
const MAX_ZOOM = 20;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ z: string; x: string; y: string }> }) {
  if (!(await staffOrNull())) return new NextResponse(null, { status: 401 });
  const { z, x, y } = await ctx.params;
  const [zi, xi, yi] = [z, x, y.replace(/\.png$/, '')].map((v) => (/^\d{1,2}$|^\d{1,7}$/.test(v) ? Number(v) : NaN)) as [number, number, number];
  const n = 2 ** zi;
  if (![zi, xi, yi].every(Number.isInteger) || zi < 0 || zi > MAX_ZOOM || xi >= n || yi >= n) return new NextResponse(null, { status: 400 });

  const layer = LAYERS.has(process.env.PROSPECTPV_OS_TILE_LAYER ?? '') ? process.env.PROSPECTPV_OS_TILE_LAYER! : 'Light_3857';
  let key: string;
  try { key = osKey(); } catch { return new NextResponse(null, { status: 503 }); }

  const url = `https://api.os.uk/maps/raster/v1/zxy/${layer}/${zi}/${xi}/${yi}.png?key=${encodeURIComponent(key)}`;
  let up: Response;
  try {
    up = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
  if (!up.ok) return new NextResponse(null, { status: up.status === 404 ? 404 : 502 });
  return new NextResponse(up.body, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=86400' },
  });
}
