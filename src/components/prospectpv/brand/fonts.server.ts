/**
 * Server-only: @font-face rules with fonts inlined as data URIs, so PDF
 * rendering never depends on the network and Chromium embeds the fonts.
 *
 * Hanken Grotesk and JetBrains Mono come from @fontsource. Ezra is self-hosted
 * and [TBC]: drop Ezra-Regular.woff2 / Ezra-Bold.woff2 / Ezra-Black.woff2 into
 * public/fonts/ezra/ and they are picked up automatically.
 */
import fs from 'node:fs';
import path from 'node:path';

function dataUri(file: string): string | null {
  try {
    return `data:font/woff2;base64,${fs.readFileSync(file).toString('base64')}`;
  } catch {
    return null;
  }
}

function fontsource(pkg: string, family: string, weights: number[]): string {
  // Found from the project root (as Ezra is), so it works the same in a Next build and on Vercel, where next.config lists these files.
  const dir = path.join(process.cwd(), 'node_modules', ...pkg.split('/'), 'files');
  const slug = pkg.split('/')[1];
  return weights
    .map((w) => {
      const uri = dataUri(path.join(dir, `${slug}-latin-${w}-normal.woff2`));
      return uri ? `@font-face{font-family:'${family}';font-style:normal;font-weight:${w};font-display:block;src:url(${uri}) format('woff2')}` : '';
    })
    .join('\n');
}

function ezra(): string {
  const dir = path.join(process.cwd(), 'public', 'fonts', 'ezra');
  const faces: [string, number][] = [['Ezra-Regular.woff2', 400], ['Ezra-Bold.woff2', 700], ['Ezra-Black.woff2', 900]];
  return faces
    .map(([file, w]) => {
      const uri = dataUri(path.join(dir, file));
      return uri ? `@font-face{font-family:'Ezra';font-weight:${w};font-display:block;src:url(${uri}) format('woff2')}` : '';
    })
    .join('\n');
}

let cached: string | null = null;

export function embeddedFontCss(): string {
  cached ??= [
    fontsource('@fontsource/hanken-grotesk', 'Hanken Grotesk', [400, 500, 600, 700, 800, 900]),
    fontsource('@fontsource/jetbrains-mono', 'JetBrains Mono', [400, 500, 600, 700]),
    ezra(),
  ].join('\n');
  return cached;
}
