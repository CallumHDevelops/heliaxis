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
    solarPanels?: { center?: GLatLng; orientation?: string; segmentIndex?: number }[];
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
  const usable = segs.filter((s) => Math.abs(aspectFromBearing(s.azimuthDegrees!)) <= 120);
  const main = (usable.length ? usable : segs).reduce((a, s) => (area(s) > area(a) ? s : a));
  const bearing = Math.round(main.azimuthDegrees!);
  const aspect = aspectFromBearing(bearing);
  const maxArea = sp.maxArrayAreaMeters2 ?? 0;
  // Shading: how much less Google's own best layout makes per kW than an unshaded roof like this one would.
  const best = (sp.solarPanelConfigs ?? []).reduce<{ panelsCount?: number; yearlyEnergyDcKwh?: number } | null>((a, c) => ((c.panelsCount ?? 0) > (a?.panelsCount ?? 0) ? c : a), null);
  const cap = (sp.panelCapacityWatts ?? 250) / 1000;
  const googleYield = best?.panelsCount && best.yearlyEnergyDcKwh ? best.yearlyEnergyDcKwh / (best.panelsCount * cap) : 0;
  const ratio = googleYield && fallbackYieldPerKwp ? googleYield / fallbackYieldPerKwp : 1;
  const shade: Shade = ratio >= 0.93 ? 'none' : ratio >= 0.82 ? 'some' : 'lots';
  return {
    aspect,
    bearing,
    angle: Math.max(0, Math.min(60, Math.round(main.pitchDegrees!))),
    areaM2: Math.round(area(main)),
    maxPanels: Math.max(0, Math.floor((maxArea || segs.reduce((s, x) => s + area(x), 0) * 0.6) / PANEL_AREA_M2)),
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
    .slice(0, 80)
    .flatMap((p) => {
      const seg = segs[p.segmentIndex ?? 0];
      if (typeof p.center?.latitude !== 'number' || typeof p.center?.longitude !== 'number' || typeof seg?.azimuthDegrees !== 'number') return [];
      return [{ lat: p.center.latitude, lng: p.center.longitude, o: p.orientation === 'LANDSCAPE' ? ('l' as const) : ('p' as const), az: seg.azimuthDegrees }];
    });
  if (!panels.length) return null;
  const c = b?.center;
  return {
    centre: typeof c?.latitude === 'number' && typeof c?.longitude === 'number' ? { lat: c.latitude, lng: c.longitude } : fallbackCentre,
    panels,
    panelW: sp?.panelWidthMeters ?? 1.045,
    panelH: sp?.panelHeightMeters ?? 1.879,
  };
}
