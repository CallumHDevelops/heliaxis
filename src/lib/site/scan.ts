'use client';

/**
 * Barcode and QR scanning on the phone, with no signal. Chrome on Android has a BarcodeDetector that
 * reads every format needed; elsewhere (iPhones, Firefox) the barcode-detector ponyfill does it with
 * ZXing compiled to WebAssembly, served from /portal/site/zxing_reader.wasm (kept by the service
 * worker) so it never fetches from a CDN. Loaded only when a scan is asked for.
 */

export const FORMATS = ['qr_code', 'data_matrix', 'code_128', 'code_39', 'pdf417'] as const;

export type Found = { rawValue: string; format: string };
type Detector = { detect(source: ImageBitmapSource): Promise<Found[]> };
type NativeDetector = { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> };

let detector: Promise<Detector> | null = null;

/** The detector: native when it covers every format, else the bundled one. */
export function getDetector(): Promise<Detector> {
  detector ??= (async () => {
    const Native = (globalThis as unknown as { BarcodeDetector?: NativeDetector }).BarcodeDetector;
    if (Native) {
      try {
        const supported = await Native.getSupportedFormats();
        if (FORMATS.every((f) => supported.includes(f))) return new Native({ formats: [...FORMATS] });
      } catch {
        // Fall through to the bundled detector.
      }
    }
    const m = await import('barcode-detector/ponyfill');
    m.prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? '/portal/site/zxing_reader.wasm' : prefix + path) },
    });
    return new m.BarcodeDetector({ formats: [...FORMATS] }) as unknown as Detector;
  })().catch((e) => {
    detector = null;
    throw e;
  });
  return detector;
}

/** Every code in a still photo (the label photo taken anyway: no camera permission, no signal). */
export async function scanImage(blob: Blob): Promise<string[]> {
  const d = await getDetector();
  const bmp = await createImageBitmap(blob);
  try {
    const found = await d.detect(bmp);
    return [...new Set(found.map((f) => f.rawValue).filter(Boolean))];
  } finally {
    bmp.close?.();
  }
}

let ctx: AudioContext | null = null;
/** A short beep, and a buzz on Android, when a code is added. */
export function beep() {
  try {
    ctx ??= new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 1800;
    g.gain.value = 0.08;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.09);
  } catch {
    // No sound: the count still goes up.
  }
  navigator.vibrate?.(60);
}
