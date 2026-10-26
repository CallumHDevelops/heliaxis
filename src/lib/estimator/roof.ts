import { inside } from './overlay';
import { DIRECTIONS, type DirectionKey, type Shade } from './calc';

/**
 * Turning Google's Solar API answer for a building into what the estimator needs: the main roof's direction,
 * pitch and size, how many panels fit, and how shaded it is. Pure, so it can be tested with a sample answer.
 * Google's azimuth is degrees clockwise from north (180 = south); PVGIS wants degrees from south (west positive).
 */

export type GoogleSegment = {
  pitchDegrees?: number;
  azimuthDegrees?: number;
  stats?: { areaMeters2?: number; groundAreaMeters2?: number };
};
type GLatLng = { latitude?: number; longitude?: number };
export type GoogleBuilding = {
  center?: GLatLng;
  imageryQuality?: string;
  solarPotential?: {
    maxArrayPanelsCount?: number;
    maxArrayAreaMeters2?: number;
    panelCapacityWatts?: number;
    panelHeightMeters?: number;
    panelWidthMeters?: number;
    solarPanels?: { center?: GLatLng; orientation?: string; segmentIndex?: number; yearlyEnergyDcKwh?: number }[];
    roofSegmentStats?: GoogleSegment[];
    solarPanelConfigs?: { panelsCount?: number; yearlyEnergyDcKwh?: number }[];
    wholeRoofStats?: { areaMeters2?: number };
  };
};

export type RoofFound = {
  /** Degrees from south, west positive (what PVGIS takes). */
  aspect: number;
  /** Compass bearing of the main roof face, 0 to 360 (180 = south). */
  bearing: number;
  angle: number;
  areaM2: number;
  /** Panels (of the estimator's size) the roof has room for. */
  maxPanels: number;
  direction: DirectionKey;
  shade: Shade;
  /** Roof faces found (the main one is described above). */
  segments: number;
  quality: string;
};

const PANEL_AREA_M2 = 1.95; // a 450 W panel, about 1.76 m x 1.13 m, with a little spacing

/** Degrees from south, west positive, from a compass bearing. */
export const aspectFromBearing = (bearing: number) => {
  let a = (((bearing - 180) % 360) + 540) % 360 - 180;
  if (a === -180) a = 180;
  return Math.round(a);
};

/** A roof face worth putting panels on: not turned away from the sun (within 100 degrees of south). */
export const usableAspect = (bearing: number) => Math.abs(aspectFromBearing(bearing)) <= 100;

const directionFor = (aspect: number): DirectionKey => {
  const abs = Math.abs(aspect);
  return DIRECTIONS.reduce((best, d) => (Math.abs(d.aspect - abs) < Math.abs(best.aspect - abs) ? d : best), DIRECTIONS[0]).key;
};

/**
 * The main roof face: the largest one that does not face north, else the largest of all. `null` if Google has
 * no usable roof for this building.
 */
export function roofFromGoogle(b: GoogleBuilding | null | undefined, fallbackYieldPerKwp: number): RoofFound | null {
  const sp = b?.solarPotential;
  const segs = (sp?.roofSegmentStats ?? []).filter((s) => typeof s.azimuthDegrees === 'number' && typeof s.pitchDegrees === 'number' && (s.stats?.areaMeters2 ?? 0) > 3);
  if (!sp || !segs.length) return null;
  const area = (s: GoogleSegment) => s.stats?.areaMeters2 ?? 0;
  const usable = segs.filter((s) => usableAspect(s.azimuthDegrees!));
  const main = (usable.length ? usable : segs).reduce((a, s) => (area(s) > area(a) ? s : a));
  const bearing = Math.round(main.azimuthDegrees!);
  const aspect = aspectFromBearing(bearing);
  const all = sp.roofSegmentStats ?? [];
  // Google's own layout puts panels on every face, north ones too. We only count and judge the faces that face the sun.
  const good = (sp.solarPanels ?? []).filter((p) => {
    const seg = all[p.segmentIndex ?? 0];
    return typeof seg?.azimuthDegrees === 'number' && usableAspect(seg.azimuthDegrees);
  });
  const usableArea = (usable.length ? usable : segs).reduce((n, x) => n + area(x), 0);
  const maxPanels = good.length ? good.length : Math.max(0, Math.floor((usableArea * 0.6) / PANEL_AREA_M2));
  // Shading: Google's yield on those faces (its figure is before system losses, so take 14% off like PVGIS) against an unshaded roof like this one.
  const cap = (sp.panelCapacityWatts ?? 250) / 1000;
  const withEnergy = good.filter((p) => (p.yearlyEnergyDcKwh ?? 0) > 0);
  const googleYield = withEnergy.length ? withEnergy.reduce((n, p) => n + (p.yearlyEnergyDcKwh ?? 0), 0) / (withEnergy.length * cap) : 0;
  const ratio = googleYield && fallbackYieldPerKwp ? (googleYield * 0.86) / fallbackYieldPerKwp : 1;
  const shade: Shade = ratio >= 0.93 ? 'none' : ratio >= 0.82 ? 'some' : 'lots';
  return {
    aspect,
    bearing,
    angle: Math.max(0, Math.min(60, Math.round(main.pitchDegrees!))),
    areaM2: Math.round(area(main)),
    maxPanels,
    direction: directionFor(aspect),
    shade,
    segments: segs.length,
    quality: b?.imageryQuality ?? '',
  };
}

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const compassWord = (bearing: number) => POINTS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];

/** What the picture needs: where each panel of Google's layout sits (best first), its size, and the building's centre. */
export type MapPanel = { lat: number; lng: number; o: 'p' | 'l'; az: number };
export type MapData = { centre: { lat: number; lng: number }; panels: MapPanel[]; panelW: number; panelH: number };

export function mapFromGoogle(b: GoogleBuilding | null | undefined, fallbackCentre: { lat: number; lng: number }): MapData | null {
  const sp = b?.solarPotential;
  const segs = sp?.roofSegmentStats ?? [];
  const panels: MapPanel[] = (sp?.solarPanels ?? [])
    .flatMap((p) => {
      const seg = segs[p.segmentIndex ?? 0];
      if (typeof p.center?.latitude !== 'number' || typeof p.center?.longitude !== 'number' || typeof seg?.azimuthDegrees !== 'number' || !usableAspect(seg.azimuthDegrees)) return [];
      return [{ lat: p.center.latitude, lng: p.center.longitude, o: p.orientation === 'LANDSCAPE' ? ('l' as const) : ('p' as const), az: seg.azimuthDegrees }];
    });
  if (!panels.length) return null;
  panels.splice(80);
  const c = b?.center;
  return {
    centre: typeof c?.latitude === 'number' && typeof c?.longitude === 'number' ? { lat: c.latitude, lng: c.longitude } : fallbackCentre,
    panels,
    panelW: sp?.panelWidthMeters ?? 1.045,
    panelH: sp?.panelHeightMeters ?? 1.879,
  };
}

const M_PER_DEG = 111320;

/**
 * Tidies Google's panel layout for the picture: drops panels that fall outside the building's outline (with a little give for the
 * outline and the imagery not lining up exactly) and small stray groups, such as two panels on a lean-to or a bay, keeping the
 * order (best first). Without an outline only the stray groups go.
 */
export function tidyPanels(panels: MapPanel[], outline: { lat: number; lng: number }[] | null, linkM = 2.6): MapPanel[] {
  if (panels.length < 2) return panels;
  const kept = outline && outline.length >= 4
    ? panels.filter((p) => {
        const dLat = 1.2 / M_PER_DEG;
        const dLng = 1.2 / (M_PER_DEG * Math.cos((p.lat * Math.PI) / 180));
        return [[0, 0], [dLat, 0], [-dLat, 0], [0, dLng], [0, -dLng]].some(([a, b]) => inside({ lat: p.lat + a, lng: p.lng + b }, outline));
      })
    : panels;
  const dist = (a: MapPanel, b: MapPanel) => Math.hypot((a.lat - b.lat) * M_PER_DEG, (a.lng - b.lng) * M_PER_DEG * Math.cos((a.lat * Math.PI) / 180));
  const group = kept.map(() => -1);
  let n = 0;
  for (let i = 0; i < kept.length; i++) {
    if (group[i] >= 0) continue;
    const stack = [i];
    group[i] = n;
    while (stack.length) {
      const a = stack.pop()!;
      for (let j = 0; j < kept.length; j++) if (group[j] < 0 && dist(kept[a], kept[j]) <= linkM) { group[j] = n; stack.push(j); }
    }
    n++;
  }
  const size = Array.from({ length: n }, (_, g) => group.filter((x) => x === g).length);
  const biggest = Math.max(0, ...size);
  const min = Math.max(3, Math.ceil(biggest * 0.25));
  const out = kept.filter((_, i) => size[group[i]] >= min);
  return out.length ? out : kept.length ? kept : panels;
}
