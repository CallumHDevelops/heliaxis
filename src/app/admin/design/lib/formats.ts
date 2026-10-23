import type { Box, PageGeometry, Zone } from '@/lib/design/types';

/**
 * Print and digital formats. Trim sizes in mm. Fold positions and zones are measured
 * from the TRIM top-left; geometryFor() converts them to media (bleed-box) coordinates.
 */
export type FormatGroup = 'Stationery' | 'Leaflets & flyers' | 'Posters' | 'Large format' | 'Digital';

export type FormatDef = {
  id: string;
  label: string;
  group: FormatGroup;
  trimW: number;
  trimH: number;
  bleed: number;
  safe: number;
  pages: string[];
  folds?: { axis: 'x' | 'y'; at: number }[];
  zones?: { label: string; kind: Zone['kind']; box: Box }[];
  note?: string;
  /** Target resolution for photos (and raster fallbacks) at the placed size. */
  dpi: number;
  /** Digital formats: exact pixel size (1 canvas unit = 1 px). */
  px?: { w: number; h: number };
};

const pxToMm = (px: number) => (px * 25.4) / 72;

function digital(id: string, label: string, w: number, h: number): FormatDef {
  return {
    id, label, group: 'Digital', trimW: pxToMm(w), trimH: pxToMm(h), bleed: 0,
    // brand social posts keep ~7% padding
    safe: pxToMm(Math.round(Math.min(w, h) * 0.07)), pages: ['Image'], dpi: 72, px: { w, h },
  };
}

export const FORMATS: FormatDef[] = [
  { id: 'bcard', label: 'Business card · 85×55', group: 'Stationery', trimW: 85, trimH: 55, bleed: 3, safe: 4, pages: ['Front', 'Back'], dpi: 300 },
  { id: 'bcard-p', label: 'Business card (portrait) · 55×85', group: 'Stationery', trimW: 55, trimH: 85, bleed: 3, safe: 4, pages: ['Front', 'Back'], dpi: 300 },
  { id: 'comp', label: 'Compliment slip · 210×99', group: 'Stationery', trimW: 210, trimH: 99, bleed: 3, safe: 6, pages: ['Front'], dpi: 300 },
  { id: 'letterhead', label: 'Letterhead · A4', group: 'Stationery', trimW: 210, trimH: 297, bleed: 3, safe: 12, pages: ['Page'], dpi: 300 },

  { id: 'a6', label: 'A6 flyer · 105×148', group: 'Leaflets & flyers', trimW: 105, trimH: 148, bleed: 3, safe: 5, pages: ['Front', 'Back'], dpi: 300 },
  { id: 'a5', label: 'A5 flyer · 148×210', group: 'Leaflets & flyers', trimW: 148, trimH: 210, bleed: 3, safe: 5, pages: ['Front', 'Back'], dpi: 300 },
  { id: 'dl', label: 'DL flyer · 99×210', group: 'Leaflets & flyers', trimW: 99, trimH: 210, bleed: 3, safe: 5, pages: ['Front', 'Back'], dpi: 300 },
  { id: 'a4', label: 'A4 flyer · 210×297', group: 'Leaflets & flyers', trimW: 210, trimH: 297, bleed: 3, safe: 6, pages: ['Front', 'Back'], dpi: 300 },
  {
    id: 'a4-a5fold', label: 'A4 → A5 folded leaflet', group: 'Leaflets & flyers', trimW: 297, trimH: 210, bleed: 3, safe: 5,
    pages: ['Outside', 'Inside'], folds: [{ axis: 'x', at: 148.5 }], dpi: 300,
    note: 'Outside: back cover on the left, front cover on the right.',
  },
  {
    id: 'a4-dlfold', label: 'A4 → DL tri-fold leaflet', group: 'Leaflets & flyers', trimW: 297, trimH: 210, bleed: 3, safe: 5,
    pages: ['Outside', 'Inside'], folds: [{ axis: 'x', at: 99 }, { axis: 'x', at: 198 }], dpi: 300,
    note: 'Roll folds usually make the tucked-in panel 2–3 mm narrower — check your printer’s template.',
  },

  { id: 'a3', label: 'A3 poster · 297×420', group: 'Posters', trimW: 297, trimH: 420, bleed: 3, safe: 10, pages: ['Poster'], dpi: 300 },
  { id: 'a2', label: 'A2 poster · 420×594', group: 'Posters', trimW: 420, trimH: 594, bleed: 3, safe: 12, pages: ['Poster'], dpi: 200 },
  { id: 'a1', label: 'A1 poster · 594×841', group: 'Posters', trimW: 594, trimH: 841, bleed: 3, safe: 15, pages: ['Poster'], dpi: 150 },

  {
    id: 'popup33', label: 'Pop-up 3×3 straight fabric · 2960×2260', group: 'Large format',
    // instantprint "Straight Fabric Pop-Up 3 x 3", at full size (their artwork template is drawn at 25%).
    // The wrap-round panels: 97.38 mm a side on that 25% template, so 389.52 mm here.
    trimW: 2960, trimH: 2260, bleed: 30, safe: 30, pages: ['Graphic'], dpi: 75,
    zones: [
      { label: 'Wraps round the frame side — not seen from the front', kind: 'wrap', box: { x: 0, y: 0, w: 389.52, h: 2260 } },
      { label: 'Wraps round the frame side — not seen from the front', kind: 'wrap', box: { x: 2570.48, y: 0, w: 389.52, h: 2260 } },
    ],
    note: '2960×2260 mm finished (3020×2320 mm with bleed). Photos 75 dpi at full size (that’s 300 dpi on instantprint’s 25% template).',
  },
  {
    id: 'rollup', label: 'Roller banner · 850×2000', group: 'Large format', trimW: 850, trimH: 2000, bleed: 5, safe: 25, pages: ['Banner'], dpi: 100,
    zones: [{ label: 'Often hidden in the base — check your printer’s template', kind: 'nogo', box: { x: 0, y: 1880, w: 850, h: 120 } }],
    note: 'Many roller banners hide the bottom 100–150 mm inside the base.',
  },
  { id: 'pvc31', label: 'PVC banner · 3000×1000', group: 'Large format', trimW: 3000, trimH: 1000, bleed: 0, safe: 30, pages: ['Banner'], dpi: 80, note: 'Keep text clear of hems and eyelets — check your printer’s spec.' },

  digital('sq', 'Social post · 1080×1080', 1080, 1080),
  digital('story', 'Story · 1080×1920', 1080, 1920),
  digital('li-post', 'LinkedIn post · 1200×627', 1200, 627),
  digital('li-banner', 'LinkedIn banner · 1584×396', 1584, 396),
];

export const FORMAT_GROUPS: FormatGroup[] = ['Stationery', 'Leaflets & flyers', 'Posters', 'Large format', 'Digital'];

export const formatById = (id: string) => FORMATS.find((f) => f.id === id);

/** Page geometry (media-box coordinates, mm) for a format. */
export function geometryFor(f: FormatDef): PageGeometry {
  const b = f.bleed;
  return {
    mediaW: f.trimW + 2 * b,
    mediaH: f.trimH + 2 * b,
    trim: { x: b, y: b, w: f.trimW, h: f.trimH },
    safe: f.safe,
    folds: f.folds?.map((fo) => ({ axis: fo.axis, at: fo.at + b })),
    zones: f.zones?.map((z) => ({ label: z.label, kind: z.kind, box: { ...z.box, x: z.box.x + b, y: z.box.y + b } })),
    note: f.note ?? null,
  };
}

/**
 * The print format with this finished size (±1 mm), if any — so a printer's template picks up
 * what we know about it (a pop-up's wrap-round zones, the matching starting layouts).
 */
export function matchFormat(g: PageGeometry): FormatDef | undefined {
  return FORMATS.find((f) => !f.px && f.id !== 'letterhead' && Math.abs(f.trimW - g.trim.w) <= 1 && Math.abs(f.trimH - g.trim.h) <= 1);
}

/** A format's zones placed on another geometry's trim (e.g. a printer template with a different bleed). */
export function zonesOnTrim(f: FormatDef, trim: Box): Zone[] | undefined {
  return f.zones?.map((z) => ({ label: z.label, kind: z.kind, box: { ...z.box, x: z.box.x + trim.x, y: z.box.y + trim.y } }));
}

/**
 * The photo resolution to aim for at the placed size: the format's own, else by the print's size
 * (a banner or pop-up is seen from metres away — 300 dpi at 3 m would fail every real photo).
 */
export function targetDpi(f: FormatDef | undefined, g: PageGeometry) {
  if (f) return f.dpi;
  const long = Math.max(g.trim.w, g.trim.h);
  return long >= 1500 ? 75 : long >= 1000 ? 100 : long >= 500 ? 150 : 300;
}

/** A custom size. */
export function customGeometry(trimW: number, trimH: number, bleed: number, safe: number): PageGeometry {
  return { mediaW: trimW + 2 * bleed, mediaH: trimH + 2 * bleed, trim: { x: bleed, y: bleed, w: trimW, h: trimH }, safe, note: null };
}

/**
 * Type scale relative to an A5 page, so presets suit a business card and a banner alike.
 * Each style also has a hard minimum (see brand.ts).
 */
export function typeScale(g: PageGeometry) {
  const a5 = Math.sqrt(148 * 210);
  return Math.sqrt(g.trim.w * g.trim.h) / a5;
}
