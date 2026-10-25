/**
 * Brand fonts for the Design studio. The canvas (FontFace API) and the PDF exporter
 * (fontkit) load the SAME files, so text metrics on screen match the printed outlines.
 */
import { familyChain } from './brand';

type FaceFile = { url: string; weight: string; variable?: boolean };

export const FONT_FILES: Record<string, FaceFile[]> = {
  'HX Ezra': [400, 500, 600, 700, 800, 900].map((w) => ({ url: `/fonts/Ezra-${w}.woff2`, weight: String(w) })),
  'HX Hanken': [{ url: '/fonts/HankenGrotesk-VF.ttf', weight: '100 900', variable: true }],
  'HX Mono': [{ url: '/fonts/JetBrainsMono-VF.ttf', weight: '100 800', variable: true }],
};

let loading: Promise<void> | null = null;

/** Register + load every brand face before any text is measured. Safe to call repeatedly. */
export function loadBrandFonts(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const faces: FontFace[] = [];
    for (const [family, files] of Object.entries(FONT_FILES)) {
      for (const f of files) {
        const face = new FontFace(family, `url(${f.url})`, { weight: f.weight, style: 'normal', display: 'block' });
        document.fonts.add(face);
        faces.push(face);
      }
    }
    await Promise.allSettled(faces.map((f) => f.load()));
    // Variable faces: make sure the instances we use are realised before measuring.
    const probes = ['400', '500', '600', '700', '800', '900'].flatMap((w) =>
      Object.keys(FONT_FILES).map((fam) => document.fonts.load(`${w} 40px "${fam}"`)),
    );
    await Promise.allSettled(probes);
  })();
  return loading;
}

/* ---------------- exporter side (fontkit) ---------------- */

type FK = typeof import('fontkit');
let fkMod: Promise<FK> | null = null;
const fontCache = new Map<string, Promise<any>>(); // eslint-disable-line @typescript-eslint/no-explicit-any

export function fontkit(): Promise<FK> {
  fkMod ??= import('fontkit');
  return fkMod;
}

/** Nearest available static weight for a family (Ezra ships 400–900). */
function fileFor(family: string, weight: number): FaceFile | null {
  const files = FONT_FILES[family];
  if (!files?.length) return null;
  if (files[0].variable) return files[0];
  let best = files[0];
  for (const f of files) if (Math.abs(Number(f.weight) - weight) < Math.abs(Number(best.weight) - weight)) best = f;
  return best;
}

/**
 * fontkit font for a family + weight (variable fonts instanced at that weight). Null if the
 * family isn't a brand font (the exporter then rasterises that text instead).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fontFor(family: string, weight: number): Promise<any | null> {
  const file = fileFor(family, weight);
  if (!file) return null;
  const key = `${family}|${file.variable ? weight : file.weight}`;
  if (!fontCache.has(key)) {
    fontCache.set(
      key,
      (async () => {
        const fk = await fontkit();
        const buf = new Uint8Array(await (await fetch(file.url)).arrayBuffer());
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const font: any = fk.create(buf as any);
        return file.variable && font.variationAxes?.wght ? font.getVariation({ wght: weight }) : font;
      })(),
    );
  }
  return fontCache.get(key)!;
}

export const normWeight = (w: unknown) => (w === 'bold' ? 700 : w === 'normal' || w == null ? 400 : Number(w) || 400);

/** All fonts in a stack (in order) for per-glyph fallback. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fontChain(stack: string, weight: number): Promise<any[]> {
  const fams = familyChain(stack);
  const fonts = await Promise.all(fams.map((f) => fontFor(f, weight)));
  return fonts.filter(Boolean);
}

export const isBrandStack = (stack: string) => !!FONT_FILES[familyChain(stack)[0] ?? ''];
