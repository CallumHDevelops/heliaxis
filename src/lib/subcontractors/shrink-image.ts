/**
 * Shrink a big phone photo in the browser before it uploads — a 6 MB camera JPEG becomes
 * ~600 KB, which matters on a building site's mobile signal. The server still converts it
 * to PDF (and properly handles HEIC, which browsers other than Safari can't decode).
 *
 * Drawn through an <img>, which applies the photo's EXIF rotation in every current browser,
 * so the canvas output (which has no EXIF) comes out the right way up. Anything that fails
 * just returns the original file.
 */

const SHRINKABLE = /^image\/(jpeg|png|webp)$/;
const MIN_BYTES = 1_500_000;
const MAX_EDGE = 2400;

export async function shrinkImage(file: File): Promise<File> {
  if (!SHRINKABLE.test(file.type) || file.size < MIN_BYTES || typeof document === 'undefined') return file;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#fff'; // transparent PNGs onto white, as the PDF will show them
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    canvas.width = canvas.height = 0; // free the bitmap now (iOS keeps canvas memory around)
    if (!blob || blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
