'use client';

import { useEffect, useRef, useState } from 'react';
import { THEME_EVENT } from '@/lib/theme/shared';
import './signature-pad.css';

/**
 * The ink of a saved signature: dark, on a transparent ground, whatever the theme on screen, so the
 * documents and PDFs it goes into never change. On screen the ink is the pad's own colour
 * (signature-pad.css: this same ink on light, the theme's text colour on a dark pad).
 */
const SAVED_INK = '#1a1a3a';
type Rgb = readonly [number, number, number];
const SAVED_RGB = hexRgb(SAVED_INK);

/** Draw-to-sign canvas. Calls onChange with a trimmed PNG data URL (or null when cleared). */
export function SignaturePad({ onChange, height = 160 }: { onChange: (dataUrl: string | null) => void; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvasRef.current!;
    // The canvas's size as last fitted: -1 before the first fit (and again when `height` changes).
    let lastW = -1;
    let lastRatio = 1;
    const fit = () => {
      const ratio = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      // A phone's address bar showing or hiding as the page scrolls fires resize with the same width:
      // the signature stays as it is.
      if (w === lastW && ratio === lastRatio) return;
      const first = lastW < 0;
      // Rotated, or the window really changed width: keep the ink (resizing the canvas wipes it).
      let keep: HTMLCanvasElement | null = null;
      if (!first && c.width && c.height) {
        keep = document.createElement('canvas');
        keep.width = c.width;
        keep.height = c.height;
        keep.getContext('2d')!.drawImage(c, 0, 0);
      }
      const was = { w: lastW, ratio: lastRatio };
      lastW = w;
      lastRatio = ratio;
      c.width = w * ratio;
      c.height = height * ratio;
      const ctx = c.getContext('2d')!;
      ctx.scale(ratio, ratio);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = screenInk(c);
      if (keep) {
        // Back where it was, shrunk to fit if the pad got narrower. What was sent with onChange is still the signature.
        const scale = Math.min(1, w / Math.max(1, was.w));
        ctx.drawImage(keep, 0, 0, (keep.width / was.ratio) * scale, (keep.height / was.ratio) * scale);
        return;
      }
      setEmpty(true);
      onChange(null);
    };
    fit();
    window.addEventListener('resize', fit);
    // Light or dark changed (the toggle, the phone, another tab): what's drawn so far takes the new ink.
    let ink = screenInk(c);
    const retheme = () => {
      const now = screenInk(c);
      if (now === ink) return;
      ink = now;
      repaint(c, inkRgb(now));
      c.getContext('2d')!.strokeStyle = now;
    };
    window.addEventListener(THEME_EVENT, retheme);
    return () => {
      window.removeEventListener('resize', fit);
      window.removeEventListener(THEME_EVENT, retheme);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function down(e: React.PointerEvent) {
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = screenInk(canvasRef.current!);
    ctx.fill();
  }

  function move(e: React.PointerEvent) {
    if (!drawing.current || !last.current) return;
    const p = pos(e);
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (empty) setEmpty(false);
  }

  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    setEmpty(false);
    onChange(trimmed(canvasRef.current!));
  }

  function clear() {
    const c = canvasRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  }

  return (
    <div className="sigpad">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height, touchAction: 'none', display: 'block', cursor: 'crosshair' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        aria-label="Signature drawing area"
      />
      <div className="sigpad-foot">
        <span>{empty ? 'Sign above with your finger, stylus or mouse' : 'Signature captured'}</span>
        <button type="button" onClick={clear} disabled={empty}>Clear</button>
      </div>
    </div>
  );
}

function hexRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The pad's ink on screen, as the canvas's CSS colour says (light or dark, or a paper island's). */
function screenInk(c: HTMLCanvasElement): string {
  return getComputedStyle(c).color || SAVED_INK;
}

function inkRgb(css: string): Rgb {
  const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(css);
  return m ? [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])] : SAVED_RGB;
}

const sameRgb = (a: Rgb, b: Rgb) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** Every inked pixel to one colour, keeping its coverage (the strokes are one colour, anti-aliased by alpha). */
function repaint(c: HTMLCanvasElement, rgb: Rgb) {
  if (!c.width || !c.height) return;
  const ctx = c.getContext('2d')!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    d[i] = rgb[0];
    d[i + 1] = rgb[1];
    d[i + 2] = rgb[2];
  }
  ctx.putImageData(img, 0, 0);
}

/** Crop to the inked area so the stored image is small and sits nicely on the signature line. Always the saved (dark) ink. */
function trimmed(c: HTMLCanvasElement): string {
  const ctx = c.getContext('2d')!;
  const { width, height } = c;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return c.toDataURL('image/png');
  // Drawn in the dark theme's light ink: saved in the dark one all the same.
  const recolour = !sameRgb(inkRgb(screenInk(c)), SAVED_RGB);
  const pad = 8;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width, maxX + pad);
  maxY = Math.min(height, maxY + pad);
  const out = document.createElement('canvas');
  out.width = maxX - minX;
  out.height = maxY - minY;
  out.getContext('2d')!.drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  if (recolour) repaint(out, SAVED_RGB);
  return out.toDataURL('image/png');
}
