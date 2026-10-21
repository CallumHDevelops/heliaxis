'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FORMATS,
  BRAND_PALETTE,
  BRAND_LOGOS,
  PT_PER_MM,
  type Format,
} from './formats';

const FONTS = ['Ezra', 'Hanken Grotesk', 'JetBrains Mono', 'Arial', 'Georgia', 'Impact', 'Times New Roman'];

/** px per mm for the working canvas: crisp for small items, capped so big
 *  banners stay a manageable size on screen (export rescales to target DPI). */
function workPxPerMm(f: Format) {
  const fit = 1400 / Math.max(f.w, f.h);
  return Math.min(fit, 6);
}

export function DesignStudio() {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<any>(null); // the fabric module
  const canvasRef = useRef<any>(null); // the fabric.Canvas
  const bgRef = useRef<any>(null); // locked background image (imported PDF)
  const fileImgRef = useRef<HTMLInputElement | null>(null);
  const filePdfRef = useRef<HTMLInputElement | null>(null);

  const [ready, setReady] = useState(false);
  const [format, setFormat] = useState<Format>(FORMATS[0]);
  const [sel, setSel] = useState<any>(null); // selected object (plain snapshot trigger)
  const [busy, setBusy] = useState('');

  // History (undo) — snapshots of canvas JSON.
  const histRef = useRef<string[]>([]);
  const restoringRef = useRef(false);

  const pushHistory = useCallback(() => {
    const c = canvasRef.current;
    if (!c || restoringRef.current) return;
    try {
      histRef.current.push(JSON.stringify(c.toJSON()));
      if (histRef.current.length > 40) histRef.current.shift();
    } catch {
      /* ignore */
    }
  }, []);

  // Init fabric canvas once.
  useEffect(() => {
    let disposed = false;
    (async () => {
      const fabric = await import('fabric');
      if (disposed || !canvasElRef.current) return;
      fabricRef.current = fabric;
      const c = new fabric.Canvas(canvasElRef.current, {
        backgroundColor: '#ffffff',
        preserveObjectStacking: true,
      });
      canvasRef.current = c;
      const f = FORMATS[0];
      const ppm = workPxPerMm(f);
      c.setDimensions({ width: Math.round(f.w * ppm), height: Math.round(f.h * ppm) });

      const syncSel = () => setSel(c.getActiveObject() ?? null);
      c.on('selection:created', syncSel);
      c.on('selection:updated', syncSel);
      c.on('selection:cleared', () => setSel(null));
      c.on('object:added', pushHistory);
      c.on('object:modified', () => { pushHistory(); syncSel(); });
      c.on('object:removed', pushHistory);

      // Ensure brand fonts are ready before first text render.
      try { await (document as any).fonts?.ready; } catch { /* ignore */ }
      setReady(true);
    })();
    return () => {
      disposed = true;
      try { canvasRef.current?.dispose(); } catch { /* ignore */ }
      canvasRef.current = null;
    };
  }, [pushHistory]);

  // Resize canvas when the format changes.
  const applyFormat = useCallback((f: Format) => {
    setFormat(f);
    const c = canvasRef.current;
    if (!c) return;
    const ppm = workPxPerMm(f);
    c.setDimensions({ width: Math.round(f.w * ppm), height: Math.round(f.h * ppm) });
    c.requestRenderAll();
  }, []);

  const add = useCallback((obj: any) => {
    const c = canvasRef.current;
    if (!c) return;
    c.add(obj);
    c.setActiveObject(obj);
    c.requestRenderAll();
    setSel(obj);
  }, []);

  const addText = useCallback((heading = false) => {
    const fabric = fabricRef.current;
    const c = canvasRef.current;
    if (!fabric || !c) return;
    const t = new fabric.Textbox(heading ? 'Heading' : 'Your text here', {
      left: c.getWidth() * 0.12,
      top: c.getHeight() * 0.12,
      width: c.getWidth() * 0.76,
      fontSize: heading ? Math.round(c.getHeight() * 0.1) : Math.round(c.getHeight() * 0.045),
      fontFamily: heading ? 'Ezra' : 'Hanken Grotesk',
      fontWeight: heading ? 800 : 400,
      fill: '#211F18',
    });
    add(t);
  }, [add]);

  const addRect = useCallback(() => {
    const fabric = fabricRef.current;
    const c = canvasRef.current;
    if (!fabric || !c) return;
    add(new fabric.Rect({
      left: c.getWidth() * 0.2, top: c.getHeight() * 0.2,
      width: c.getWidth() * 0.4, height: c.getHeight() * 0.2,
      fill: '#F8BC1E',
    }));
  }, [add]);

  const addImageFromUrl = useCallback(async (url: string, crossOrigin = false) => {
    const fabric = fabricRef.current;
    const c = canvasRef.current;
    if (!fabric || !c) return;
    const img = await fabric.FabricImage.fromURL(url, crossOrigin ? { crossOrigin: 'anonymous' } : undefined);
    const maxW = c.getWidth() * 0.6;
    if (img.width && img.width > maxW) img.scale(maxW / img.width);
    img.set({ left: c.getWidth() * 0.2, top: c.getHeight() * 0.2 });
    add(img);
  }, [add]);

  const onUploadImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const url = URL.createObjectURL(file);
    void addImageFromUrl(url);
  }, [addImageFromUrl]);

  const onImportPdf = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const fabric = fabricRef.current;
    const c = canvasRef.current;
    if (!fabric || !c) return;
    setBusy('Rendering PDF…');
    try {
      const pdfjs: any = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      const data = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data }).promise;
      const page = await pdf.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const scale = c.getWidth() / base.width;
      const viewport = page.getViewport({ scale });
      const off = document.createElement('canvas');
      off.width = Math.round(viewport.width);
      off.height = Math.round(viewport.height);
      const ctx = off.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const url = off.toDataURL('image/png');
      const img = await fabric.FabricImage.fromURL(url);
      img.set({ left: 0, top: 0, selectable: false, evented: false });
      img.scaleToWidth(c.getWidth());
      if (bgRef.current) c.remove(bgRef.current);
      bgRef.current = img;
      c.add(img);
      (c as any).sendObjectToBack(img);
      c.requestRenderAll();
    } catch (err) {
      alert('Could not read that PDF. ' + (err instanceof Error ? err.message : ''));
    } finally {
      setBusy('');
    }
  }, []);

  const setFill = useCallback((hex: string) => {
    const c = canvasRef.current;
    const o = c?.getActiveObject();
    if (!o) return;
    o.set('fill', hex);
    c.requestRenderAll();
    setSel({ ...o });
  }, []);

  const mutate = useCallback((fn: (o: any) => void) => {
    const c = canvasRef.current;
    const o = c?.getActiveObject();
    if (!o) return;
    fn(o);
    o.setCoords?.();
    c.requestRenderAll();
    setSel({ ...o });
  }, []);

  const removeSel = useCallback(() => {
    const c = canvasRef.current;
    const o = c?.getActiveObject();
    if (!o) return;
    if (o === bgRef.current) bgRef.current = null;
    c.remove(o);
    c.discardActiveObject();
    c.requestRenderAll();
    setSel(null);
  }, []);

  const duplicate = useCallback(async () => {
    const c = canvasRef.current;
    const o = c?.getActiveObject();
    if (!o) return;
    const clone = await o.clone();
    clone.set({ left: (o.left || 0) + 16, top: (o.top || 0) + 16 });
    add(clone);
  }, [add]);

  const layer = useCallback((dir: 'front' | 'back') => {
    const c = canvasRef.current;
    const o = c?.getActiveObject();
    if (!o) return;
    if (dir === 'front') (c as any).bringObjectToFront(o);
    else (c as any).sendObjectToBack(o);
    // keep the PDF background pinned behind everything
    if (bgRef.current) (c as any).sendObjectToBack(bgRef.current);
    c.requestRenderAll();
  }, []);

  const undo = useCallback(() => {
    const c = canvasRef.current;
    if (!c || histRef.current.length < 2) return;
    restoringRef.current = true;
    histRef.current.pop(); // current
    const prev = histRef.current[histRef.current.length - 1];
    c.loadFromJSON(prev).then(() => {
      // re-find the background (first non-selectable image) so the ref stays valid
      bgRef.current = c.getObjects().find((x: any) => x.selectable === false) ?? null;
      c.requestRenderAll();
      restoringRef.current = false;
      setSel(null);
    });
  }, []);

  const exportPng = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.discardActiveObject();
    c.requestRenderAll();
    const ppm = workPxPerMm(format);
    const target = format.group === 'Large format' ? 100 : 150;
    const internalDpi = ppm * 25.4;
    let mult = target / internalDpi;
    const maxDim = Math.max(c.getWidth(), c.getHeight()) * mult;
    if (maxDim > 6000) mult *= 6000 / maxDim;
    const url = c.toDataURL({ format: 'png', multiplier: mult });
    const a = document.createElement('a');
    a.href = url;
    a.download = `heliaxis-${format.id}.png`;
    a.click();
  }, [format]);

  const exportPdf = useCallback(async () => {
    const c = canvasRef.current;
    if (!c) return;
    setBusy('Building PDF…');
    try {
      c.discardActiveObject();
      c.requestRenderAll();
      const ppm = workPxPerMm(format);
      const target = format.group === 'Large format' ? 100 : 150;
      const internalDpi = ppm * 25.4;
      let mult = target / internalDpi;
      const maxDim = Math.max(c.getWidth(), c.getHeight()) * mult;
      if (maxDim > 6000) mult *= 6000 / maxDim;
      const dataUrl = c.toDataURL({ format: 'png', multiplier: mult });
      const { PDFDocument } = await import('pdf-lib');
      const pdf = await PDFDocument.create();
      const pageW = format.w * PT_PER_MM;
      const pageH = format.h * PT_PER_MM;
      const page = pdf.addPage([pageW, pageH]);
      const png = await pdf.embedPng(dataUrl);
      page.drawImage(png, { x: 0, y: 0, width: pageW, height: pageH });
      const bytes = await pdf.save();
      const blob = new Blob([bytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `heliaxis-${format.id}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      alert('Export failed. ' + (err instanceof Error ? err.message : ''));
    } finally {
      setBusy('');
    }
  }, [format]);

  const isText = sel && (sel.type === 'textbox' || sel.type === 'i-text' || sel.type === 'text');

  return (
    <div className="ds">
      <div className="ds-top">
        <button className="ds-btn" onClick={() => addText(true)} disabled={!ready}>+ Heading</button>
        <button className="ds-btn" onClick={() => addText(false)} disabled={!ready}>+ Text</button>
        <button className="ds-btn" onClick={addRect} disabled={!ready}>+ Box</button>
        <button className="ds-btn" onClick={() => fileImgRef.current?.click()} disabled={!ready}>+ Image</button>
        <button className="ds-btn" onClick={undo} disabled={!ready}>↶ Undo</button>
        <span className="sp" />
        <span className="ds-dim">{format.w}×{format.h} mm</span>
        <button className="ds-btn" onClick={exportPng} disabled={!ready}>Export PNG</button>
        <button className="ds-btn solar" onClick={exportPdf} disabled={!ready || !!busy}>{busy || 'Export PDF'}</button>
      </div>

      <div className="ds-body">
        {/* LEFT: format, brand, PDF import */}
        <div className="ds-left">
          <div className="ds-sec">
            <h3>Format</h3>
            <select
              className="ds-sel ds-full"
              value={format.id}
              onChange={(e) => applyFormat(FORMATS.find((f) => f.id === e.target.value) || FORMATS[0])}
            >
              {['Print', 'Large format', 'Digital'].map((g) => (
                <optgroup key={g} label={g}>
                  {FORMATS.filter((f) => f.group === g).map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="ds-sec">
            <h3>Template background</h3>
            <button className="ds-btn ds-full" onClick={() => filePdfRef.current?.click()} disabled={!ready}>
              Import PDF background
            </button>
            <p className="ds-hint">Upload a supplier template or artwork PDF — page 1 is placed as a locked background to design over.</p>
          </div>

          <div className="ds-sec">
            <h3>Brand logos</h3>
            <div className="ds-row" style={{ flexDirection: 'column' }}>
              {BRAND_LOGOS.map((l) => (
                <button
                  key={l.asset}
                  className={`ds-logo ds-full ${l.dark ? 'dark' : 'light'}`}
                  onClick={() => addImageFromUrl(`/api/brand/asset/${l.asset}`, true)}
                  disabled={!ready}
                  title={`Add ${l.name}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/brand/view/${l.asset}`} alt={l.name} />
                </button>
              ))}
            </div>
          </div>

          <div className="ds-sec">
            <h3>Brand colours</h3>
            <div className="ds-swatches">
              {BRAND_PALETTE.map((p) => (
                <button
                  key={p.hex}
                  className="ds-sw"
                  style={{ background: p.hex }}
                  title={`${p.name} ${p.hex}`}
                  onClick={() => setFill(p.hex)}
                />
              ))}
            </div>
            <p className="ds-hint">Select an object, then click a colour to fill it.</p>
          </div>
        </div>

        {/* STAGE */}
        <div className="ds-stage">
          <div className="ds-canvas-wrap">
            <canvas ref={canvasElRef} />
          </div>
        </div>

        {/* RIGHT: selection properties */}
        <div className="ds-right">
          <div className="ds-sec">
            <h3>Selected</h3>
            {!sel ? (
              <p className="ds-empty">Nothing selected. Add text, a box or an image, or click an element on the canvas.</p>
            ) : (
              <>
                {isText && (
                  <>
                    <div className="ds-field">
                      <label>Text</label>
                      <textarea
                        value={sel.text || ''}
                        onChange={(e) => mutate((o) => o.set('text', e.target.value))}
                      />
                    </div>
                    <div className="ds-field">
                      <label>Font</label>
                      <select
                        className="ds-sel ds-full"
                        value={sel.fontFamily || 'Hanken Grotesk'}
                        onChange={(e) => mutate((o) => o.set('fontFamily', e.target.value))}
                      >
                        {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                    <div className="ds-field">
                      <label>Size</label>
                      <input
                        type="number"
                        value={Math.round(sel.fontSize || 0)}
                        onChange={(e) => mutate((o) => o.set('fontSize', Number(e.target.value) || 1))}
                      />
                    </div>
                    <div className="ds-row" style={{ marginBottom: 11 }}>
                      <button className="ds-btn" onClick={() => mutate((o) => o.set('fontWeight', o.fontWeight === 800 || o.fontWeight === 'bold' ? 400 : 800))}>Bold</button>
                      <button className="ds-btn" onClick={() => mutate((o) => o.set('textAlign', 'left'))}>Left</button>
                      <button className="ds-btn" onClick={() => mutate((o) => o.set('textAlign', 'center'))}>Centre</button>
                    </div>
                  </>
                )}
                <div className="ds-field">
                  <label>Colour</label>
                  <input
                    type="color"
                    value={typeof sel.fill === 'string' ? sel.fill : '#211F18'}
                    onChange={(e) => setFill(e.target.value)}
                  />
                </div>
                <div className="ds-field">
                  <label>Opacity</label>
                  <input
                    type="range" min={0} max={1} step={0.05}
                    value={sel.opacity ?? 1}
                    onChange={(e) => mutate((o) => o.set('opacity', Number(e.target.value)))}
                  />
                </div>
                <div className="ds-row">
                  <button className="ds-btn" onClick={() => layer('front')}>Bring front</button>
                  <button className="ds-btn" onClick={() => layer('back')}>Send back</button>
                </div>
                <div className="ds-row" style={{ marginTop: 7 }}>
                  <button className="ds-btn" onClick={duplicate}>Duplicate</button>
                  <button className="ds-btn ghost" onClick={removeSel}>Delete</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <input ref={fileImgRef} type="file" accept="image/*" hidden onChange={onUploadImage} />
      <input ref={filePdfRef} type="file" accept="application/pdf" hidden onChange={onImportPdf} />
    </div>
  );
}
