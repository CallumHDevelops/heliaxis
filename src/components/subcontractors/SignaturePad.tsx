'use client';

import { useEffect, useRef, useState } from 'react';
import './signature-pad.css';

/** Draw-to-sign canvas. Calls onChange with a trimmed PNG data URL (or null when cleared). */
export function SignaturePad({ onChange, height = 160 }: { onChange: (dataUrl: string | null) => void; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvasRef.current!;
    const fit = () => {
      const ratio = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      c.width = w * ratio;
      c.height = height * ratio;
      const ctx = c.getContext('2d')!;
      ctx.scale(ratio, ratio);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = '#1a1a3a';
      setEmpty(true);
      onChange(null);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
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
    ctx.fillStyle = '#1a1a3a';
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

/** Crop to the inked area so the stored image is small and sits nicely on the signature line. */
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
  const pad = 8;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width, maxX + pad);
  maxY = Math.min(height, maxY + pad);
  const out = document.createElement('canvas');
  out.width = maxX - minX;
  out.height = maxY - minY;
  out.getContext('2d')!.drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
