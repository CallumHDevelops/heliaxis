'use client';

/**
 * Is a label photo sharp and light enough to read? A greyscale copy about 640 px wide, the variance
 * of its Laplacian (low = blurry) and its mean brightness (low = too dark). Only ever a prompt ("That
 * looks blurry. Take it again?"): the person can keep the photo anyway.
 */

const BLURRY_BELOW = 60;
const DARK_BELOW = 45;

export type Sharpness = { blurry: boolean; dark: boolean; variance: number; brightness: number };

export async function checkSharpness(blob: Blob): Promise<Sharpness | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, 640 / Math.max(bmp.width, bmp.height));
    const w = Math.max(3, Math.round(bmp.width * scale));
    const h = Math.max(3, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext('2d', { willReadFrequently: true });
    if (!c) return null;
    c.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const px = c.getImageData(0, 0, w, h).data;
    const grey = new Float32Array(w * h);
    let sum = 0;
    for (let i = 0; i < w * h; i++) {
      const g = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      grey[i] = g;
      sum += g;
    }
    let n = 0;
    let mean = 0;
    let m2 = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const lap = grey[i - w] + grey[i + w] + grey[i - 1] + grey[i + 1] - 4 * grey[i];
        n++;
        const d = lap - mean;
        mean += d / n;
        m2 += d * (lap - mean);
      }
    }
    const variance = n > 1 ? m2 / (n - 1) : 0;
    const brightness = sum / (w * h);
    return { blurry: variance < BLURRY_BELOW, dark: brightness < DARK_BELOW, variance: Math.round(variance), brightness: Math.round(brightness) };
  } catch {
    return null;
  }
}
