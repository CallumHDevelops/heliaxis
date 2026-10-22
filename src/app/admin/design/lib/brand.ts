/**
 * The Heliaxis brand, built into the Design studio. Source: /branding (brand-body.html),
 * brand-kit/heliaxis-brand-spec.md and the site tokens. Where the guidelines are silent
 * (CMYK, logo minimum size, clear space) values are marked SUGGESTED.
 */

export type CMYK = [number, number, number, number]; // 0–100

/** Naive sRGB → CMYK (no ICC profile). Printers convert properly; override in Print colours. */
export function hexToCmyk(hex: string): CMYK {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 0.999) return [0, 0, 0, 100];
  const c = (1 - r - k) / (1 - k);
  const m = (1 - g - k) / (1 - k);
  const y = (1 - b - k) / (1 - k);
  return [c, m, y, k].map((v) => Math.round(v * 100)) as CMYK;
}

export type BrandColour = {
  id: string;
  name: string;
  hex: string;
  role: string;
  /** Text colour that reads on this colour (from the brand page swatches). */
  textOn: 'ink' | 'paper';
  /** Not a brand colour — status only (flagged by the brand check). */
  statusOnly?: boolean;
};

export const BRAND_COLOURS: BrandColour[] = [
  { id: 'ink', name: 'Ink', hex: '#211F18', role: 'Primary dark — dark backgrounds, headings on light', textOn: 'paper' },
  { id: 'solar', name: 'Solar gold', hex: '#F8BC1E', role: 'Accent — CTAs, the spark, highlight words. Never body text.', textOn: 'ink' },
  { id: 'amber', name: 'Amber', hex: '#E39A0C', role: 'Gold, deeper', textOn: 'ink' },
  { id: 'amber2', name: 'Amber deep', hex: '#C77F04', role: 'Eyebrows and labels on light', textOn: 'paper' },
  { id: 'paper', name: 'Paper', hex: '#F7F2E7', role: 'Primary light background', textOn: 'ink' },
  { id: 'paper2', name: 'Paper 2', hex: '#EFE8D8', role: 'Tiles and bands', textOn: 'ink' },
  { id: 'card', name: 'Card', hex: '#FFFDF8', role: 'Card surface on light', textOn: 'ink' },
  { id: 'ink2', name: 'Ink 2', hex: '#2C2820', role: 'Cards on dark', textOn: 'paper' },
  { id: 'muted', name: 'Muted', hex: '#6E6A5E', role: 'Secondary text on light', textOn: 'paper' },
  { id: 'mutedD', name: 'Muted (dark)', hex: '#A69F8E', role: 'Secondary text on dark', textOn: 'ink' },
  { id: 'white', name: 'White (unprinted)', hex: '#FFFFFF', role: 'Bare paper', textOn: 'ink' },
  { id: 'ok', name: 'Success green', hex: '#3F7D4E', role: 'Status only — never a brand colour', textOn: 'paper', statusOnly: true },
];

export const brandColour = (id: string) => BRAND_COLOURS.find((c) => c.id === id)!;

/** Hairlines from the site tokens (rgba over the background). */
export const HAIRLINE = { light: 'rgba(33,31,24,0.14)', dark: 'rgba(247,242,231,0.16)' };

const norm = (h: string) => h.trim().toUpperCase();
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = m[1];
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
/** The brand colour this hex is (within a small tolerance), or null if off-brand. */
export function matchBrand(hex: unknown): BrandColour | null {
  if (typeof hex !== 'string') return null;
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  let best: BrandColour | null = null;
  let bestD = Infinity;
  for (const c of BRAND_COLOURS) {
    const b = hexToRgb(c.hex)!;
    const d = Math.hypot(rgb[0] - b[0], rgb[1] - b[1], rgb[2] - b[2]);
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= 6 ? best : null;
}
export const isBrandHex = (hex: unknown) => typeof hex === 'string' && !!matchBrand(hex) && !matchBrand(hex)!.statusOnly;
export const sameHex = (a: string, b: string) => norm(a) === norm(b);

/* ---------- Type ---------- */

/**
 * The studio registers the brand fonts under private family names, from the same files the
 * PDF exporter outlines — so on-screen metrics and printed glyphs can never come from
 * different font versions. Stacks give an explicit fallback chain (Ezra has no …, ŵ/ŷ or
 * arrows; Hanken has no ↑↓) that the exporter follows glyph by glyph, exactly like the canvas.
 */
export const FONTS = {
  display: 'HX Ezra',
  body: 'HX Hanken',
  mono: 'HX Mono',
} as const;
export const FONT_STACK: Record<string, string> = {
  'HX Ezra': '"HX Ezra", "HX Hanken", "HX Mono"',
  'HX Hanken': '"HX Hanken", "HX Mono"',
  'HX Mono': '"HX Mono", "HX Hanken"',
};
export const FONT_LABEL: Record<string, string> = {
  'HX Ezra': 'Ezra — display',
  'HX Hanken': 'Hanken Grotesk — body',
  'HX Mono': 'JetBrains Mono — labels',
};
export const BRAND_FONTS: string[] = [FONTS.display, FONTS.body, FONTS.mono];
/** Weights each family offers in the editor. */
export const FONT_WEIGHTS: Record<string, number[]> = {
  'HX Ezra': [400, 500, 600, 700, 800, 900],
  'HX Hanken': [400, 500, 600, 700],
  'HX Mono': [400, 500, 600],
};

/** Families in a CSS-style stack, unquoted: '"HX Ezra", "HX Hanken"' → ['HX Ezra', 'HX Hanken']. */
export function familyChain(stack: string): string[] {
  return String(stack || '')
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}
export const primaryFamily = (stack: string) => familyChain(stack)[0] ?? '';

export type TextStyleDef = {
  id: string;
  name: string;
  hint: string;
  fontFamily: string;
  fontWeight: number;
  /** Size in pt on an A5 page — scaled by format (formats.ts typeScale). */
  size: number;
  /** Hard minimum in pt, whatever the format. */
  min: number;
  lineHeight: number;
  /** fabric units: 1/1000 em. */
  charSpacing: number;
  uppercase?: boolean;
  colour: string; // brand colour id
  sample: string;
};

export const TEXT_STYLES: TextStyleDef[] = [
  { id: 'eyebrow', name: 'Eyebrow', hint: 'Mono caps, wide tracking — above a headline', fontFamily: FONT_STACK[FONTS.mono], fontWeight: 600, size: 8.5, min: 6.5, lineHeight: 1.2, charSpacing: 140, uppercase: true, colour: 'amber2', sample: 'Solar · South Wales' },
  { id: 'display', name: 'Display', hint: 'Ezra Black — the big message', fontFamily: FONT_STACK[FONTS.display], fontWeight: 900, size: 34, min: 12, lineHeight: 1.0, charSpacing: -20, colour: 'ink', sample: 'Energy that revolves around you.' },
  { id: 'heading', name: 'Heading', hint: 'Ezra ExtraBold — section titles', fontFamily: FONT_STACK[FONTS.display], fontWeight: 800, size: 22, min: 10, lineHeight: 1.05, charSpacing: -15, colour: 'ink', sample: 'Own your energy' },
  { id: 'subheading', name: 'Subheading', hint: 'Ezra Bold — card titles', fontFamily: FONT_STACK[FONTS.display], fontWeight: 700, size: 14, min: 8, lineHeight: 1.15, charSpacing: -10, colour: 'ink', sample: 'Solar, battery & EV' },
  { id: 'lead', name: 'Lead', hint: 'Hanken SemiBold — the intro line', fontFamily: FONT_STACK[FONTS.body], fontWeight: 600, size: 12.5, min: 7.5, lineHeight: 1.3, charSpacing: 0, colour: 'ink', sample: 'MCS-certified installers designing around your energy use.' },
  { id: 'body', name: 'Body', hint: 'Hanken Regular — paragraphs', fontFamily: FONT_STACK[FONTS.body], fontWeight: 400, size: 10, min: 7, lineHeight: 1.45, charSpacing: 0, colour: 'ink', sample: 'We survey, design and install solar, batteries, heat pumps and EV chargers across South Wales.' },
  { id: 'small', name: 'Small print', hint: 'Captions and terms', fontFamily: FONT_STACK[FONTS.body], fontWeight: 400, size: 7.5, min: 6, lineHeight: 1.4, charSpacing: 0, colour: 'muted', sample: 'Savings depend on your usage and system size.' },
  { id: 'label', name: 'Label', hint: 'Mono caps — data, indices, footers', fontFamily: FONT_STACK[FONTS.mono], fontWeight: 500, size: 7, min: 6.5, lineHeight: 1.2, charSpacing: 80, uppercase: true, colour: 'muted', sample: 'HELIAXIS.CO.UK · 01633 965205' },
  { id: 'stat', name: 'Stat', hint: 'Ezra Black — a big number', fontFamily: FONT_STACK[FONTS.display], fontWeight: 900, size: 40, min: 14, lineHeight: 1.0, charSpacing: -20, colour: 'solar', sample: '£1,240' },
];

/* ---------- Logos & marks ---------- */

export type LogoDef = {
  id: string;
  name: string;
  /** Vector asset used on the canvas and in print exports. */
  asset: string;
  /** Raster fallback (digital). */
  raster?: string;
  onDark: boolean;
  role: 'logo' | 'spark';
};

export const LOGOS: LogoDef[] = [
  { id: 'logo', name: 'Logo · on light', asset: 'heliaxis-logo-vector.svg', raster: 'heliaxis-logo.png', onDark: false, role: 'logo' },
  { id: 'logo-light', name: 'Logo · on dark', asset: 'heliaxis-logo-vector-light.svg', raster: 'heliaxis-logo-light.png', onDark: true, role: 'logo' },
  { id: 'spark', name: 'Spark', asset: 'heliaxis-spark.svg', onDark: false, role: 'spark' },
];

/** SUGGESTED (the guidelines say only "give it clear space" and set no minimum). */
export const LOGO_RULES = {
  minWidthMm: 25,
  /** Clear space on every side, as a fraction of the logo's height. */
  clearSpace: 0.5,
};

export const ICON_NAMES = [
  'solar', 'panel', 'battery', 'battery-full', 'ev', 'charger', 'led', 'bulb', 'heatpump', 'radiator', 'thermostat', 'flame',
  'snowflake', 'sun', 'bolt', 'plug', 'meter', 'gauge', 'thermometer', 'wind', 'leaf', 'droplet', 'monitor', 'house', 'building',
  'factory', 'warehouse', 'tractor', 'care', 'hotel', 'shop', 'roof', 'shield', 'award', 'star', 'quote', 'handshake', 'users',
  'hardhat', 'wrench', 'cog', 'truck', 'calendar', 'clock', 'mail', 'mappin', 'chart', 'trending', 'coin', 'pound', 'percent',
  'piggy', 'calculator', 'document', 'check', 'download', 'estimator', 'fund', 'grant', 'ppa', 'phone', 'agri', 'home', 'eco',
  'recycle', 'clipboard',
];

/* ---------- Words ---------- */

export const STRAPLINES = [
  'Energy that revolves around you.',
  'Own your energy.',
  'Your axis to the sun.',
  'Powered by the sun, built around you.',
];
export const CTAS = ['Get my free quote →', 'Book a free survey →', 'Estimate my savings', 'Learn more →'];
export const CONTACT = { web: 'heliaxis.co.uk', phone: '01633 965205', email: 'hello@heliaxis.co.uk', area: 'South Wales' };
export const ACCREDITATIONS = ['MCS', 'RECC', 'NICEIC', 'TrustMark'];

/** The do's and don'ts shown in the Brand panel and enforced by the brand check. */
export const BRAND_RULES = [
  'Charcoal logo on light backgrounds, reversed logo on dark.',
  'Never recolour, stretch or add effects to the logo or spark — the spark is always gold.',
  'Gold is an accent (CTAs, a highlighted word) — never body text.',
  'Headlines: Ezra, short (≤ 10–15 words), with the key word in gold.',
  'Eyebrows and labels: JetBrains Mono, capitals, wide tracking.',
  'Green is for status only — never a brand colour.',
  'Hairline borders, not drop shadows; keep corners tight (≤ 1 mm).',
  'Real install photography only — no clip art.',
  'UK English and £. Benefit first, honest urgency.',
];
