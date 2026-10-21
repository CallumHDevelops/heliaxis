/** Print formats for the Design studio. All sizes in millimetres (trim size). */
export type Format = {
  id: string;
  label: string;
  /** Trim width/height in mm. */
  w: number;
  h: number;
  /** Bleed in mm added all round for print (0 = large format / none). */
  bleed: number;
  group: string;
};

export const FORMATS: Format[] = [
  { id: 'bcard', label: 'Business card (85×55)', w: 85, h: 55, bleed: 3, group: 'Print' },
  { id: 'dl', label: 'DL flyer (99×210)', w: 99, h: 210, bleed: 3, group: 'Print' },
  { id: 'a6', label: 'A6 flyer (105×148)', w: 105, h: 148, bleed: 3, group: 'Print' },
  { id: 'a5', label: 'A5 leaflet (148×210)', w: 148, h: 210, bleed: 3, group: 'Print' },
  { id: 'a4', label: 'A4 (210×297)', w: 210, h: 297, bleed: 3, group: 'Print' },
  { id: 'a3', label: 'A3 poster (297×420)', w: 297, h: 420, bleed: 3, group: 'Print' },
  { id: 'rollup', label: 'Roller banner (850×2000)', w: 850, h: 2000, bleed: 0, group: 'Large format' },
  { id: 'banner31', label: 'PVC banner (3000×1000)', w: 3000, h: 1000, bleed: 0, group: 'Large format' },
  { id: 'sq', label: 'Social square (1080×1080)', w: 271, h: 271, bleed: 0, group: 'Digital' },
];

export const MM_PER_IN = 25.4;
export const PT_PER_MM = 72 / MM_PER_IN; // 2.8346 — PDF points per mm
/** On-screen working resolution: 96 DPI. */
export const EDIT_PX_PER_MM = 96 / MM_PER_IN; // 3.7795

export const BRAND_PALETTE: { name: string; hex: string }[] = [
  { name: 'Ink', hex: '#211F18' },
  { name: 'Solar gold', hex: '#F8BC1E' },
  { name: 'Amber', hex: '#E39A0C' },
  { name: 'Amber deep', hex: '#C77F04' },
  { name: 'Cream', hex: '#F7F2E7' },
  { name: 'Paper 2', hex: '#EFE8D8' },
  { name: 'Card', hex: '#FFFDF8' },
  { name: 'Green', hex: '#3F7D4E' },
  { name: 'White', hex: '#FFFFFF' },
];

/** Brand logos available from /api/brand/asset (admin session or partner cookie). */
export const BRAND_LOGOS: { name: string; asset: string; dark?: boolean }[] = [
  { name: 'Logo (on light)', asset: 'heliaxis-logo.png' },
  { name: 'Logo (on dark)', asset: 'heliaxis-logo-light.png', dark: true },
  { name: 'Spark mark', asset: 'heliaxis-spark.svg' },
];
