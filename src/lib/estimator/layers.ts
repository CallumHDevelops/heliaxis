import 'server-only';
import { fromArrayBuffer } from 'geotiff';
import { convergence, toUtm } from './utm';
import { cellXY, detectFaces, hull, packFaces, type Grid } from './planes';
import { inside, type LngLat } from './overlay';
import type { MapPanel } from './roof';

/**
 * The roof from Google's height maps (Solar API "data layers"): a height map of the area at 25 cm, a mask of buildings and the
 * yearly sun on every point, all as GeoTIFFs. We cut out this house (with the building outline, so a terrace is not taken as
 * one roof), find its faces from the heights and pack panels on them. Null whenever any step fails: the caller then uses
 * Google's own panel layout.
 */
const RADIUS_M = 25;
const CELL_M = 0.2;
const PANEL_W = 1.05;
const PANEL_H = 1.76;

type Layer = { w: number; h: number; e0: number; n0: number; sx: number; sy: number; zone: number; data: ArrayLike<number> };

async function readLayer(url: string, key: string, referer: string): Promise<Layer | null> {
  const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}key=${key}`, { headers: { Referer: referer }, signal: AbortSignal.timeout(12000) }).catch(() => null);
  if (!r || !r.ok) return null;
  const tiff = await fromArrayBuffer(await r.arrayBuffer());
  const img = await tiff.getImage();
  const epsg = Number(img.getGeoKeys().ProjectedCSTypeGeoKey);
  if (!(epsg >= 32601 && epsg <= 32660)) return null;
  const [e0, n0] = img.getOrigin();
  const [sx, sy] = img.getResolution();
  const bands = (await img.readRasters({ interleave: false })) as unknown as ArrayLike<number>[];
  return { w: img.getWidth(), h: img.getHeight(), e0, n0, sx, sy: Math.abs(sy), zone: epsg - 32600, data: bands[0] };
}

const at = (l: Layer, e: number, n: number): number => {
  const col = Math.floor((e - l.e0) / l.sx);
  const row = Math.floor((l.n0 - n) / l.sy);
  return col < 0 || row < 0 || col >= l.w || row >= l.h ? NaN : l.data[row * l.w + col];
};

/** Height at a point, blended between the four nearest samples. */
const heightAt = (l: Layer, e: number, n: number): number => {
  const fc = (e - l.e0) / l.sx - 0.5;
  const fr = (l.n0 - n) / l.sy - 0.5;
  const c0 = Math.floor(fc);
  const r0 = Math.floor(fr);
  const tc = fc - c0;
  const tr = fr - r0;
  const v = (c: number, r: number) => (c < 0 || r < 0 || c >= l.w || r >= l.h ? NaN : l.data[r * l.w + c]);
  const a = [v(c0, r0), v(c0 + 1, r0), v(c0, r0 + 1), v(c0 + 1, r0 + 1)];
  if (a.some((x) => !(x > -1000))) return NaN;
  return a[0] * (1 - tc) * (1 - tr) + a[1] * tc * (1 - tr) + a[2] * (1 - tc) * tr + a[3] * tc * tr;
};

export type RoofAnalysis = {
  panels: MapPanel[];
  faces: LngLat[][];
  main: { bearing: number; pitch: number; areaM2: number } | null;
  panelW: number;
  panelH: number;
  /** Yearly sun per kW (shade included) averaged over the panels laid. */
  fluxMean: number | null;
};

export async function analyseRoof(centre: LngLat, outline: LngLat[] | null, key: string, referer: string): Promise<{ ok: true; roof: RoofAnalysis } | { ok: false; why: string }> {
  if (process.env.SOLAR_DATA_LAYERS === 'off') return { ok: false, why: 'data layers switched off' };
  try {
    const u = new URL('https://solar.googleapis.com/v1/dataLayers:get');
    u.searchParams.set('location.latitude', String(centre.lat));
    u.searchParams.set('location.longitude', String(centre.lng));
    u.searchParams.set('radiusMeters', String(RADIUS_M + 5));
    u.searchParams.set('view', 'IMAGERY_AND_ANNUAL_FLUX_LAYERS');
    u.searchParams.set('requiredQuality', 'MEDIUM');
    u.searchParams.set('pixelSizeMeters', '0.25');
    u.searchParams.set('key', key);
    const r = await fetch(u, { headers: { Referer: referer }, signal: AbortSignal.timeout(10000) }).catch(() => null);
    if (!r) return { ok: false, why: 'data layers did not answer' };
    if (!r.ok) return { ok: false, why: `data layers returned ${r.status}: ${(await r.text().catch(() => '')).replace(/key=[A-Za-z0-9_-]+/g, 'key=…').replace(/AIza[0-9A-Za-z_-]{20,}/g, '…').slice(0, 200)}` };
    const d = (await r.json()) as { dsmUrl?: string; maskUrl?: string; annualFluxUrl?: string };
    if (!d.dsmUrl) return { ok: false, why: 'data layers gave no height map' };
    const [dsm, mask, flux] = await Promise.all([readLayer(d.dsmUrl, key, referer), d.maskUrl ? readLayer(d.maskUrl, key, referer) : null, d.annualFluxUrl ? readLayer(d.annualFluxUrl, key, referer) : null]);
    if (!dsm) return { ok: false, why: 'could not read the height map' };

    // Our grid: true north up, centred on the building, so every layer is sampled where it really is.
    const zone = dsm.zone;
    const c = toUtm(centre.lat, centre.lng, zone);
    const gam = convergence(centre.lat, centre.lng, zone);
    const n = Math.round((RADIUS_M * 2) / CELL_M);
    const g: Grid = { n, cell: CELL_M, z: new Float32Array(n * n).fill(NaN), ok: new Uint8Array(n * n), flux: new Float32Array(n * n).fill(NaN) };
    const mPerLat = 111320;
    const mPerLng = 111320 * Math.cos((centre.lat * Math.PI) / 180);
    const inOutline = (x: number, y: number) => {
      if (!outline) return true;
      // A metre of give each way: the outline and the picture never line up exactly.
      return [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inside({ lat: centre.lat + (y + dy) / mPerLat, lng: centre.lng + (x + dx) / mPerLng }, outline));
    };
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const { x, y } = cellXY(g, i, j);
        const e = c.e + x * Math.cos(gam) - y * Math.sin(gam);
        const nn = c.n + x * Math.sin(gam) + y * Math.cos(gam);
        const z = heightAt(dsm, e, nn);
        if (!Number.isFinite(z)) continue;
        g.z[j * n + i] = z;
        const m = mask ? at(mask, e, nn) : 1;
        if (m > 0 && inOutline(x, y)) g.ok[j * n + i] = 1;
        if (flux) {
          const f = at(flux, e, nn);
          if (f > 0) g.flux[j * n + i] = f;
        }
      }
    }
    if (!outline) {
      // Without an outline, keep only the building the point is on (a connected patch of mask within a few metres).
      const start = g.ok.findIndex((v, k) => v === 1 && Math.hypot(cellXY(g, k % n, (k - (k % n)) / n).x, cellXY(g, k % n, (k - (k % n)) / n).y) < 6);
      if (start < 0) return { ok: false, why: 'no building at that point' };
      const keep = new Uint8Array(n * n);
      const stack = [start];
      keep[start] = 1;
      while (stack.length) {
        const k = stack.pop()!;
        const ki = k % n;
        const kj = (k - ki) / n;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = ki + di;
          const nj = kj + dj;
          if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
          const m = nj * n + ni;
          if (g.ok[m] === 1 && !keep[m]) { keep[m] = 1; stack.push(m); }
        }
      }
      g.ok = keep;
    }
    const faces = detectFaces(g);
    if (!faces.length) return { ok: false, why: 'no roof faces found in the height map' };
    const placed = packFaces(g, faces, { panelW: PANEL_W, panelH: PANEL_H, clearance: 0.4, gap: 0.02 });
    const toLL = (x: number, y: number): LngLat => ({ lat: centre.lat + y / mPerLat, lng: centre.lng + x / mPerLng });
    const usable = faces.filter((f) => f.bearing >= 80 && f.bearing <= 280);
    const mainFace = (usable.length ? usable : faces).reduce((a, b) => (b.areaM2 > a.areaM2 ? b : a));
    const flat = placed.filter((p) => p.flux > 0);
    return {
      ok: true,
      roof: {
        panels: placed.slice(0, 120).map((p) => ({ ...toLL(p.x, p.y), o: p.o, az: p.az, pt: p.pt })),
        faces: faces.filter((f) => f.areaM2 >= 4).map((f) => hull(g, f.cells).map((h) => toLL(h.x, h.y))),
        main: { bearing: Math.round(mainFace.bearing), pitch: Math.round(mainFace.pitch), areaM2: Math.round(mainFace.areaM2) },
        panelW: PANEL_W,
        panelH: PANEL_H,
        fluxMean: flat.length ? flat.reduce((a, p) => a + p.flux, 0) / flat.length : null,
      },
    };
  } catch (e) {
    return { ok: false, why: `roof analysis failed: ${String(e).slice(0, 120)}` };
  }
}
