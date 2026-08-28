// "My Brand" kit — a single per-workspace brand (logo, colours, fonts) that
// overrides the Heliaxis defaults on posts. Seeds the white-label direction.

export interface BrandKit {
  logo_light: string; // data-URL, shown on dark/photo posts
  logo_dark: string; // data-URL, shown on light posts
  color_accent: string; // hex
  color_ink: string; // hex
  color_paper: string; // hex
  font_heading: string; // literal CSS family, '' = Heliaxis default
  font_body: string; // literal CSS family, '' = default
}

export const HELIAXIS_DEFAULTS = {
  color_accent: '#F8BC1E',
  color_ink: '#211F18',
  color_paper: '#F7F2E7',
};

export const BLANK_BRAND: BrandKit = {
  logo_light: '',
  logo_dark: '',
  color_accent: HELIAXIS_DEFAULTS.color_accent,
  color_ink: HELIAXIS_DEFAULTS.color_ink,
  color_paper: HELIAXIS_DEFAULTS.color_paper,
  font_heading: '',
  font_body: '',
};

// Curated fonts, all preloaded via the <link> in app/layout.tsx. Value is the
// literal CSS family the canvas uses; '' means keep the built-in Heliaxis font.
export const HEADING_FONTS: { label: string; value: string }[] = [
  { label: 'Heliaxis (default)', value: '' },
  { label: 'Poppins', value: 'Poppins' },
  { label: 'Montserrat', value: 'Montserrat' },
  { label: 'Playfair Display', value: 'Playfair Display' },
  { label: 'Oswald', value: 'Oswald' },
  { label: 'Bebas Neue', value: 'Bebas Neue' },
];
export const BODY_FONTS: { label: string; value: string }[] = [
  { label: 'Default', value: '' },
  { label: 'Inter', value: 'Inter' },
  { label: 'Roboto', value: 'Roboto' },
  { label: 'Lato', value: 'Lato' },
  { label: 'Work Sans', value: 'Work Sans' },
];

function toHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

// Pull the dominant, reasonably-saturated colour out of a logo image to use as
// the brand accent. Falls back to the Heliaxis gold.
export function extractAccent(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const S = 72;
        const c = document.createElement('canvas');
        c.width = S;
        c.height = S;
        const ctx = c.getContext('2d');
        if (!ctx) return resolve(HELIAXIS_DEFAULTS.color_accent);
        ctx.drawImage(img, 0, 0, S, S);
        const data = ctx.getImageData(0, 0, S, S).data;
        const buckets: Record<string, { n: number; r: number; g: number; b: number }> = {};
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue; // transparent
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const mx = Math.max(r, g, b);
          const mn = Math.min(r, g, b);
          const sat = mx === 0 ? 0 : (mx - mn) / mx;
          if (sat < 0.28 || lum < 45 || lum > 225) continue; // skip greys / near b&w
          const key = `${r >> 4},${g >> 4},${b >> 4}`;
          const bk = (buckets[key] ??= { n: 0, r: 0, g: 0, b: 0 });
          bk.n++;
          bk.r += r;
          bk.g += g;
          bk.b += b;
        }
        let best: { n: number; r: number; g: number; b: number } | null = null;
        for (const k in buckets) if (!best || buckets[k].n > best.n) best = buckets[k];
        resolve(best ? toHex(best.r / best.n, best.g / best.n, best.b / best.n) : HELIAXIS_DEFAULTS.color_accent);
      } catch {
        resolve(HELIAXIS_DEFAULTS.color_accent);
      }
    };
    img.onerror = () => resolve(HELIAXIS_DEFAULTS.color_accent);
    img.src = dataUrl;
  });
}
