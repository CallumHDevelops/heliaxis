/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * StudioEngine — wraps a fabric.js canvas with the print model:
 *  - 1 canvas unit = 1 pt; origin = top-left of the media (bleed) box
 *  - a paper sheet on a dark pasteboard, with bleed / trim / safe / fold / zone guides
 *  - printer templates drawn under or over the artwork (never a canvas object)
 *  - snapping, zoom/pan, history, pages (serialise/load), keyboard shortcuts
 * React components drive it through its methods and listen with on().
 */
import type { PageGeometry, TemplateRef } from '@/lib/design/types';
import { PT_PER_MM, MM_PER_PT } from '@/lib/design/types';
import { BRAND_COLOURS, FONT_STACK, LOGO_RULES, TEXT_STYLES, brandColour, type TextStyleDef } from './brand';
import { typeScale } from './formats';

export type FabricNS = typeof import('fabric');
export type EngineEvent = 'selection' | 'change' | 'zoom' | 'history' | 'page';

/** Extra properties saved with every object. */
export const CUSTOM_PROPS = [
  'id', 'name', 'role', 'styleId', 'assetPath', 'brandBg', 'iconName', 'logoId', 'locked', 'srcName',
  // BrandButton
  'label', 'labelFont', 'labelWeight', 'labelSize', 'labelFill', 'labelSpacing', 'padX', 'padY',
  // cropped photos
  'focalX', 'focalY',
];

/** Vertical position of a single-line label's baseline, as a fraction of its size (cap-height centring). */
export const LABEL_BASELINE = 0.35;

const PASTEBOARD = '#1b1a15';
const C_BLEED = '#e5484d';
const C_TRIM = '#16a6c9';
const C_SAFE = '#d6409f';
const C_FOLD = '#8f63ff';
const C_SNAP = '#ff3fb4';

export const mm = (v: number) => v * PT_PER_MM;
export const toMm = (v: number) => v * MM_PER_PT;
let seq = 0;
export const uid = () => `o${Date.now().toString(36)}${(seq++).toString(36)}`;

export type BrandBgSpec = { base: string; glow: boolean; grid: boolean; dark: boolean };

/** Point on the brand grid's fade mask: CSS linear-gradient(150deg, #000, transparent 80%). */
export function gridMask(px: number, py: number, w: number, h: number) {
  const a = (150 * Math.PI) / 180;
  const dx = Math.sin(a), dy = -Math.cos(a); // y-down screen vector for a CSS angle
  const L = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
  const t = ((px - w / 2) * dx + (py - h / 2) * dy) / L + 0.5;
  return Math.max(0, Math.min(1, 1 - t / 0.8));
}
export const gridPitch = (w: number, h: number) => Math.max(w, h) / 24;

/** Registers fabric subclasses once per page load. */
let registered = false;
// The custom classes (module namespaces are frozen, so they can't live on the fabric import).
let BrandBgClass: any = null;
let BrandButtonClass: any = null;
function registerClasses(f: FabricNS) {
  if (registered) return;
  registered = true;
  (f.FabricObject as any).customProperties = CUSTOM_PROPS;
  // Brand-wide control styling.
  Object.assign((f.FabricObject as any).ownDefaults, {
    transparentCorners: false,
    cornerColor: '#F8BC1E',
    cornerStrokeColor: '#211F18',
    borderColor: '#F8BC1E',
    cornerStyle: 'circle',
    cornerSize: 9,
    borderScaleFactor: 1.5,
    padding: 0,
  });

  /** The Heliaxis card fill: solid base + gold glow (top-right) + fading hairline grid. */
  class BrandBg extends (f.Rect as any) {
    static type = 'BrandBg';
    declare brandBg: BrandBgSpec;
    _render(ctx: CanvasRenderingContext2D) {
      const spec: BrandBgSpec = this.brandBg || { base: '#211F18', glow: true, grid: true, dark: true };
      const w = this.width, h = this.height, x = -w / 2, y = -h / 2;
      ctx.save();
      ctx.fillStyle = spec.base;
      ctx.fillRect(x, y, w, h);
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      if (spec.glow) {
        // radial-gradient(80% 90% at 92% -10%, rgba(248,188,30,.2), transparent 46%)
        const cx = x + w * 0.92, cy = y - h * 0.1, rx = w * 0.8, ry = h * 0.9;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, ry / rx);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        const a = spec.dark ? 0.2 : 0.1;
        g.addColorStop(0, `rgba(248,188,30,${a})`);
        g.addColorStop(0.46, 'rgba(248,188,30,0)');
        ctx.fillStyle = g;
        ctx.fillRect(-rx * 2, -rx * 2, rx * 4, rx * 4);
        ctx.restore();
      }
      if (spec.grid) {
        const p = gridPitch(w, h);
        const col = spec.dark ? '247,242,231' : '33,31,24';
        const base = spec.dark ? 0.05 : 0.045;
        ctx.lineWidth = Math.max(0.35, p / 120);
        for (let gx = p; gx < w; gx += p) {
          for (let gy = 0; gy < h; gy += p) {
            const m = gridMask(gx, gy + p / 2, w, h);
            if (m <= 0.01) continue;
            ctx.strokeStyle = `rgba(${col},${(base * m).toFixed(4)})`;
            ctx.beginPath();
            ctx.moveTo(x + gx, y + gy);
            ctx.lineTo(x + gx, y + Math.min(h, gy + p));
            ctx.stroke();
          }
        }
        for (let gy = p; gy < h; gy += p) {
          for (let gx = 0; gx < w; gx += p) {
            const m = gridMask(gx + p / 2, gy, w, h);
            if (m <= 0.01) continue;
            ctx.strokeStyle = `rgba(${col},${(base * m).toFixed(4)})`;
            ctx.beginPath();
            ctx.moveTo(x + gx, y + gy);
            ctx.lineTo(x + Math.min(w, gx + p), y + gy);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }
  }
  f.classRegistry.setClass(BrandBg as any, 'BrandBg');
  BrandBgClass = BrandBg;

  /**
   * A CTA button / chip: a rounded rect that carries a single-line label and sizes itself to it.
   * Label is edited in the inspector; it renders the same on canvas and in the PDF (outlined).
   */
  class BrandButton extends (f.Rect as any) {
    static type = 'BrandButton';
    declare label: string;
    declare labelFont: string;
    declare labelWeight: number;
    declare labelSize: number;
    declare labelFill: string;
    declare labelSpacing: number;
    declare padX: number;
    declare padY: number;
    labelFontCss() {
      return `${this.labelWeight || 700} ${this.labelSize || 11}px ${this.labelFont}`;
    }
    /** Resize the pill to its label (keeps the centre). */
    fitLabel() {
      const cv = document.createElement('canvas').getContext('2d')!;
      cv.font = this.labelFontCss();
      const sp = ((this.labelSpacing || 0) / 1000) * (this.labelSize || 11);
      const tw = cv.measureText(this.label || '').width + sp * Math.max(0, [...(this.label || '')].length - 1);
      const c = this.getCenterPoint();
      this.set({ width: tw + 2 * (this.padX || 0), height: (this.labelSize || 11) * 0.72 + 2 * (this.padY || 0) });
      this.setPositionByOrigin(c, 'center', 'center');
      this.setCoords();
    }
    _render(ctx: CanvasRenderingContext2D) {
      super._render(ctx);
      ctx.save();
      ctx.font = this.labelFontCss();
      ctx.fillStyle = this.labelFill || '#211F18';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const sp = this.labelSpacing || 0;
      if (sp && 'letterSpacing' in ctx) (ctx as any).letterSpacing = `${(sp / 1000) * (this.labelSize || 11)}px`;
      ctx.fillText(this.label || '', 0, (this.labelSize || 11) * LABEL_BASELINE);
      ctx.restore();
    }
  }
  f.classRegistry.setClass(BrandButton as any, 'BrandButton');
  BrandButtonClass = BrandButton;
}

export type TemplateLayer = { ref: TemplateRef; image: HTMLCanvasElement | null };

export class StudioEngine {
  f: FabricNS;
  canvas: any;
  g: PageGeometry;
  W = 0; // media width in pt
  H = 0;
  zoom = 1;
  showGuides = true;
  /** Hide everything outside the trim, as it will look once cut. */
  trimPreview = false;
  template: TemplateLayer | null = null;
  private snapLines: { axis: 'x' | 'y'; at: number }[] = [];
  private listeners = new Set<(e: EngineEvent) => void>();
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private histTimer: ReturnType<typeof setTimeout> | undefined;
  private suspended = 0;
  private panning: { x: number; y: number } | null = null;
  private spaceDown = false;
  private clipboard: any[] | null = null;
  private ro: ResizeObserver | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private keyUpHandler: ((e: KeyboardEvent) => void) | null = null;
  fitMode = true;

  constructor(f: FabricNS, el: HTMLCanvasElement, stage: HTMLElement, g: PageGeometry) {
    this.f = f;
    registerClasses(f);
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const engine = this;
    class StudioCanvas extends (f.Canvas as any) {
      _renderBackground(ctx: CanvasRenderingContext2D) {
        engine.drawSheet(ctx);
        super._renderBackground(ctx);
      }
      _renderOverlay(ctx: CanvasRenderingContext2D) {
        super._renderOverlay(ctx);
        engine.drawOverlay(ctx);
      }
    }
    this.canvas = new (StudioCanvas as any)(el, {
      preserveObjectStacking: true,
      controlsAboveOverlay: true,
      stopContextMenu: true,
      fireRightClick: true,
      selectionColor: 'rgba(248,188,30,0.08)',
      selectionBorderColor: '#F8BC1E',
      selectionLineWidth: 1,
      backgroundColor: '',
      uniformScaling: true,
      targetFindTolerance: 4,
    });
    this.g = g;
    this.applyGeometry(g, false);
    this.bindEvents(stage);
  }

  /* ---------------- events ---------------- */

  on(fn: (e: EngineEvent) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(e: EngineEvent) {
    for (const fn of this.listeners) fn(e);
  }

  private bindEvents(stage: HTMLElement) {
    const c = this.canvas;
    const sel = () => this.emit('selection');
    c.on('selection:created', sel);
    c.on('selection:updated', sel);
    c.on('selection:cleared', sel);
    c.on('object:modified', () => { this.snapLines = []; this.record(); sel(); });
    c.on('object:added', () => this.record());
    c.on('object:removed', () => this.record());
    c.on('text:changed', () => this.record());
    c.on('object:moving', (e: any) => this.snap(e.target));
    c.on('object:scaling', () => this.emit('selection'));
    c.on('mouse:up', () => { if (this.snapLines.length) { this.snapLines = []; c.requestRenderAll(); } });

    // Wheel: pan; Ctrl/⌘+wheel: zoom at the pointer.
    c.on('mouse:wheel', (opt: any) => {
      const e = opt.e as WheelEvent;
      e.preventDefault();
      e.stopPropagation();
      if (e.ctrlKey || e.metaKey) {
        const z = Math.min(64, Math.max(0.02, this.zoom * Math.pow(0.998, e.deltaY)));
        c.zoomToPoint(new this.f.Point(e.offsetX, e.offsetY), z);
        this.zoom = z;
        this.fitMode = false;
        this.emit('zoom');
      } else {
        c.relativePan(new this.f.Point(-e.deltaX, -e.deltaY));
        this.fitMode = false;
      }
      c.requestRenderAll();
    });

    // Space+drag or middle-button drag pans.
    c.on('mouse:down', (opt: any) => {
      const e = opt.e as MouseEvent;
      if (this.spaceDown || e.button === 1) {
        this.panning = { x: e.clientX, y: e.clientY };
        c.selection = false;
        c.discardActiveObject();
        c.setCursor('grabbing');
      }
    });
    c.on('mouse:move', (opt: any) => {
      if (!this.panning) return;
      const e = opt.e as MouseEvent;
      c.relativePan(new this.f.Point(e.clientX - this.panning.x, e.clientY - this.panning.y));
      this.panning = { x: e.clientX, y: e.clientY };
      this.fitMode = false;
    });
    c.on('mouse:up', () => {
      if (this.panning) {
        this.panning = null;
        c.selection = true;
        c.setCursor(this.spaceDown ? 'grab' : 'default');
      }
    });

    this.ro = new ResizeObserver(() => {
      const r = stage.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;
      c.setDimensions({ width: Math.floor(r.width), height: Math.floor(r.height) });
      if (this.fitMode) this.fit();
      else c.requestRenderAll();
    });
    this.ro.observe(stage);

    this.keyHandler = (e) => this.onKey(e);
    this.keyUpHandler = (e) => {
      if (e.code === 'Space') {
        this.spaceDown = false;
        c.defaultCursor = 'default';
        c.setCursor('default');
      }
    };
    window.addEventListener('keydown', this.keyHandler);
    window.addEventListener('keyup', this.keyUpHandler);
  }

  dispose() {
    this.ro?.disconnect();
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    if (this.keyUpHandler) window.removeEventListener('keyup', this.keyUpHandler);
    clearTimeout(this.histTimer);
    this.listeners.clear();
    try { this.canvas.dispose(); } catch { /* already gone */ }
  }

  /** Hook for app-level shortcuts (save, export) — set by the React shell. */
  onShortcut: ((k: 'save' | 'export') => void) | null = null;

  private onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const c = this.canvas;
    const active = c.getActiveObject();
    if (active?.isEditing) return; // typing inside a text box
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (e.code === 'Space' && !this.spaceDown) {
      this.spaceDown = true;
      c.defaultCursor = 'grab';
      c.setCursor('grab');
      e.preventDefault();
      return;
    }
    if (mod && k === 's') { e.preventDefault(); this.onShortcut?.('save'); return; }
    if (mod && k === 'e') { e.preventDefault(); this.onShortcut?.('export'); return; }
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
    if ((mod && k === 'y') || (mod && k === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); return; }
    if (mod && k === 'd') { e.preventDefault(); void this.duplicate(); return; }
    if (mod && k === 'c') { void this.copy(); return; }
    if (mod && k === 'v') { e.preventDefault(); void this.paste(); return; }
    if (mod && k === 'a') { e.preventDefault(); this.selectAll(); return; }
    if (mod && k === 'g') { e.preventDefault(); if (e.shiftKey) this.ungroup(); else this.group(); return; }
    if (mod && (k === '0')) { e.preventDefault(); this.fit(); return; }
    if (mod && (k === '=' || k === '+')) { e.preventDefault(); this.zoomBy(1.25); return; }
    if (mod && k === '-') { e.preventDefault(); this.zoomBy(0.8); return; }
    if (k === 'escape') { c.discardActiveObject(); c.requestRenderAll(); return; }
    if ((k === 'delete' || k === 'backspace') && active) { e.preventDefault(); this.removeSelected(); return; }
    if (active && k.startsWith('arrow')) {
      e.preventDefault();
      const step = mm(e.shiftKey ? 5 : 0.5);
      const dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0;
      const dy = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0;
      active.set({ left: active.left + dx, top: active.top + dy });
      active.setCoords();
      c.requestRenderAll();
      this.record();
      this.emit('selection');
    }
  }

  /* ---------------- geometry, zoom ---------------- */

  applyGeometry(g: PageGeometry, refit = true) {
    this.g = g;
    this.W = mm(g.mediaW);
    this.H = mm(g.mediaH);
    if (refit) this.fit();
    this.canvas.requestRenderAll();
    this.emit('change');
  }

  trimPt() {
    const t = this.g.trim;
    return { x: mm(t.x), y: mm(t.y), w: mm(t.w), h: mm(t.h) };
  }
  safePt() {
    const t = this.trimPt();
    const s = mm(this.g.safe);
    return { x: t.x + s, y: t.y + s, w: t.w - 2 * s, h: t.h - 2 * s };
  }

  fit() {
    const c = this.canvas;
    const cw = c.getWidth(), ch = c.getHeight();
    if (!cw || !ch || !this.W) return;
    const pad = Math.min(48, Math.max(16, cw * 0.05));
    const z = Math.min((cw - 2 * pad) / this.W, (ch - 2 * pad) / this.H);
    this.zoom = z;
    c.setViewportTransform([z, 0, 0, z, (cw - this.W * z) / 2, (ch - this.H * z) / 2]);
    this.fitMode = true;
    c.requestRenderAll();
    this.emit('zoom');
  }
  zoomBy(k: number) {
    const c = this.canvas;
    const z = Math.min(64, Math.max(0.02, this.zoom * k));
    c.zoomToPoint(new this.f.Point(c.getWidth() / 2, c.getHeight() / 2), z);
    this.zoom = z;
    this.fitMode = false;
    c.requestRenderAll();
    this.emit('zoom');
  }
  /** 100% = actual printed size on a 96 dpi screen. */
  actualSize() {
    const k = 96 / 72 / this.zoom;
    this.zoomBy(k);
  }

  /* ---------------- drawing: sheet, template, guides ---------------- */

  drawSheet(ctx: CanvasRenderingContext2D) {
    const c = this.canvas;
    const v = c.viewportTransform;
    ctx.save();
    ctx.fillStyle = PASTEBOARD;
    ctx.fillRect(0, 0, c.getWidth(), c.getHeight());
    ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.shadowColor = 'transparent';
    const t = this.template;
    if (t?.image && t.ref.mode === 'under') {
      ctx.globalAlpha = t.ref.opacity;
      ctx.drawImage(t.image, 0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  drawOverlay(ctx: CanvasRenderingContext2D) {
    const c = this.canvas;
    const v = c.viewportTransform;
    const z = v[0];
    const t = this.template;
    ctx.save();
    ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
    if (t?.image && t.ref.mode === 'over' && !this.trimPreview) {
      // the template's white is already knocked out (renderTemplate), so draw it straight on top
      ctx.globalAlpha = t.ref.opacity;
      ctx.drawImage(t.image, 0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Dim (or, in trim preview, hide) everything off the sheet.
    const box = this.trimPreview ? this.trimPt() : { x: 0, y: 0, w: this.W, h: this.H };
    const sx = v[4] + box.x * z, sy = v[5] + box.y * z, sw = box.w * z, sh = box.h * z;
    const cw = c.getWidth(), ch = c.getHeight();
    ctx.save();
    ctx.fillStyle = this.trimPreview ? PASTEBOARD : 'rgba(27,26,21,0.82)';
    ctx.fillRect(0, 0, cw, Math.max(0, sy));
    ctx.fillRect(0, sy + sh, cw, Math.max(0, ch - sy - sh));
    ctx.fillRect(0, sy, Math.max(0, sx), sh);
    ctx.fillRect(sx + sw, sy, Math.max(0, cw - sx - sw), sh);
    ctx.restore();

    if (!this.showGuides || this.trimPreview) {
      this.drawSnaps(ctx);
      return;
    }
    ctx.save();
    ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
    const px = 1 / z;
    const line = (color: string, dash: number[] | null, w = 1) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = w * px;
      ctx.setLineDash(dash ? dash.map((d) => d * px) : []);
    };
    // zones (wrap-round / no-go) — hatched
    for (const zn of this.g.zones ?? []) {
      const b = { x: mm(zn.box.x), y: mm(zn.box.y), w: mm(zn.box.w), h: mm(zn.box.h) };
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x, b.y, b.w, b.h);
      ctx.clip();
      ctx.fillStyle = zn.kind === 'wrap' ? 'rgba(22,166,201,0.10)' : 'rgba(229,72,77,0.10)';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      line(zn.kind === 'wrap' ? 'rgba(22,166,201,0.35)' : 'rgba(229,72,77,0.35)', null, 1);
      const step = 12 * px;
      ctx.beginPath();
      for (let d = -b.h; d < b.w; d += step) {
        ctx.moveTo(b.x + d, b.y);
        ctx.lineTo(b.x + d + b.h, b.y + b.h);
      }
      ctx.stroke();
      ctx.restore();
    }
    // bleed edge
    if (this.g.trim.x > 0.01) {
      line(C_BLEED, [5, 3]);
      ctx.strokeRect(0, 0, this.W, this.H);
    }
    // trim (cut)
    const tr = this.trimPt();
    line(C_TRIM, null, 1.2);
    ctx.strokeRect(tr.x, tr.y, tr.w, tr.h);
    // safe area
    const sf = this.safePt();
    if (this.g.safe > 0.01) {
      line(C_SAFE, [3, 3]);
      ctx.strokeRect(sf.x, sf.y, sf.w, sf.h);
    }
    // folds
    line(C_FOLD, [8, 4], 1.2);
    for (const fo of this.g.folds ?? []) {
      ctx.beginPath();
      if (fo.axis === 'x') { ctx.moveTo(mm(fo.at), 0); ctx.lineTo(mm(fo.at), this.H); }
      else { ctx.moveTo(0, mm(fo.at)); ctx.lineTo(this.W, mm(fo.at)); }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // logo clear-space halo for a selected logo
    const a = c.getActiveObject();
    if (a && a.role === 'logo') {
      const br = a.getBoundingRect();
      const pad = br.height * LOGO_RULES.clearSpace;
      ctx.fillStyle = 'rgba(214,64,159,0.08)';
      ctx.fillRect(br.left - pad, br.top - pad, br.width + 2 * pad, br.height + 2 * pad);
      line(C_SAFE, [2, 2]);
      ctx.strokeRect(br.left - pad, br.top - pad, br.width + 2 * pad, br.height + 2 * pad);
    }
    ctx.restore();
    this.drawSnaps(ctx);
  }

  private drawSnaps(ctx: CanvasRenderingContext2D) {
    if (!this.snapLines.length) return;
    const v = this.canvas.viewportTransform;
    ctx.save();
    ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
    ctx.strokeStyle = C_SNAP;
    ctx.lineWidth = 1 / v[0];
    for (const s of this.snapLines) {
      ctx.beginPath();
      if (s.axis === 'x') { ctx.moveTo(s.at, -this.H); ctx.lineTo(s.at, this.H * 2); }
      else { ctx.moveTo(-this.W, s.at); ctx.lineTo(this.W * 2, s.at); }
      ctx.stroke();
    }
    ctx.restore();
  }

  setTemplate(t: TemplateLayer | null) {
    this.template = t;
    this.canvas.requestRenderAll();
    this.emit('change');
  }
  setGuides(show: boolean) {
    this.showGuides = show;
    this.canvas.requestRenderAll();
  }
  setTrimPreview(on: boolean) {
    this.trimPreview = on;
    this.canvas.requestRenderAll();
  }

  /* ---------------- snapping ---------------- */

  private snap(o: any) {
    if (!o) return;
    const tol = 7 / this.zoom;
    const tr = this.trimPt(), sf = this.safePt();
    const xs = [0, this.W / 2, this.W, tr.x, tr.x + tr.w / 2, tr.x + tr.w, sf.x, sf.x + sf.w];
    const ys = [0, this.H / 2, this.H, tr.y, tr.y + tr.h / 2, tr.y + tr.h, sf.y, sf.y + sf.h];
    for (const fo of this.g.folds ?? []) (fo.axis === 'x' ? xs : ys).push(mm(fo.at));
    const others = this.canvas.getObjects().filter((x: any) => x !== o && x.visible && x.role !== 'background' && !(o.getObjects?.()?.includes(x)));
    for (const x of others.slice(0, 120)) {
      const b = x.getBoundingRect();
      xs.push(b.left, b.left + b.width / 2, b.left + b.width);
      ys.push(b.top, b.top + b.height / 2, b.top + b.height);
    }
    const b = o.getBoundingRect();
    const edgesX = [b.left, b.left + b.width / 2, b.left + b.width];
    const edgesY = [b.top, b.top + b.height / 2, b.top + b.height];
    const best = (edges: number[], cands: number[]) => {
      let d = Infinity, at = 0;
      for (const e of edges) for (const c of cands) {
        const dd = c - e;
        if (Math.abs(dd) < Math.abs(d)) { d = dd; at = c; }
      }
      return Math.abs(d) <= tol ? { d, at } : null;
    };
    const sx = best(edgesX, xs), sy = best(edgesY, ys);
    this.snapLines = [];
    if (sx) { o.left += sx.d; this.snapLines.push({ axis: 'x', at: sx.at }); }
    if (sy) { o.top += sy.d; this.snapLines.push({ axis: 'y', at: sy.at }); }
    o.setCoords();
  }

  /* ---------------- history ---------------- */

  serialize(): Record<string, unknown> {
    return this.canvas.toObject(CUSTOM_PROPS);
  }

  /** Called after any change; debounced snapshot for undo. */
  record() {
    if (this.suspended) return;
    clearTimeout(this.histTimer);
    this.histTimer = setTimeout(() => {
      const snap = JSON.stringify(this.serialize());
      if (this.undoStack[this.undoStack.length - 1] === snap) return;
      this.undoStack.push(snap);
      if (this.undoStack.length > 80) this.undoStack.shift();
      this.redoStack = [];
      this.emit('history');
      this.emit('change');
    }, 220);
  }
  canUndo() { return this.undoStack.length > 1; }
  canRedo() { return this.redoStack.length > 0; }
  async undo() {
    if (this.undoStack.length < 2) return;
    this.redoStack.push(this.undoStack.pop()!);
    await this.loadJson(JSON.parse(this.undoStack[this.undoStack.length - 1]), false);
    this.emit('history');
    this.emit('change');
  }
  async redo() {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push(s);
    await this.loadJson(JSON.parse(s), false);
    this.emit('history');
    this.emit('change');
  }

  /** Replace the canvas contents. resetHistory=true starts a fresh undo stack (page switch / open). */
  async loadJson(json: Record<string, unknown>, resetHistory = true) {
    this.suspended++;
    try {
      const c = this.canvas;
      c.discardActiveObject();
      await c.loadFromJSON(json);
      c.backgroundColor = '';
      for (const o of c.getObjects()) this.applyRoleControls(o);
      c.requestRenderAll();
    } finally {
      this.suspended--;
    }
    if (resetHistory) {
      this.undoStack = [JSON.stringify(this.serialize())];
      this.redoStack = [];
      this.emit('history');
    }
    this.emit('selection');
  }

  /* ---------------- objects ---------------- */

  objects(): any[] {
    return this.canvas.getObjects();
  }
  active(): any {
    return this.canvas.getActiveObject();
  }
  activeList(): any[] {
    return this.canvas.getActiveObjects();
  }

  /** Locks + control rules per role (logos never stretch; backgrounds stay put). */
  applyRoleControls(o: any) {
    if (o.role === 'logo' || o.role === 'spark' || o.role === 'icon') {
      o.setControlsVisibility?.({ ml: false, mr: false, mt: false, mb: false });
      o.lockSkewingX = o.lockSkewingY = true;
    }
    if (o.locked) {
      o.set({ lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true, hasControls: false });
    }
  }

  add(o: any, select = true) {
    o.id ??= uid();
    this.applyRoleControls(o);
    this.canvas.add(o);
    if (select) this.canvas.setActiveObject(o);
    this.canvas.requestRenderAll();
    this.emit('selection');
    return o;
  }

  centreInSafe(o: any) {
    const s = this.safePt();
    o.set({ left: s.x + s.w / 2, top: s.y + s.h / 2, originX: 'center', originY: 'center' });
    o.setCoords();
    // normalise back to top-left origin so exports and the inspector agree
    const p = o.getPointByOrigin('left', 'top');
    o.set({ originX: 'left', originY: 'top', left: p.x, top: p.y });
    o.setCoords();
  }

  styleSize(st: TextStyleDef) {
    return Math.max(st.min, Math.round(st.size * typeScale(this.g) * 4) / 4);
  }

  addText(styleId = 'body', text?: string) {
    const st = TEXT_STYLES.find((s) => s.id === styleId) ?? TEXT_STYLES[0];
    const s = this.safePt();
    const raw = text ?? st.sample;
    const tb = new this.f.Textbox(st.uppercase ? raw.toUpperCase() : raw, {
      width: Math.min(s.w, Math.max(mm(30), s.w * (st.id === 'body' || st.id === 'small' ? 0.7 : 0.85))),
      fontFamily: st.fontFamily,
      fontWeight: st.fontWeight,
      fontSize: this.styleSize(st),
      lineHeight: st.lineHeight,
      charSpacing: st.charSpacing,
      fill: brandColour(st.colour).hex,
      textAlign: 'left',
      splitByGrapheme: false,
      // fabric pads every object by its stroke width even when there's no stroke; text has none,
      // so drop it and the frame lines up exactly with guides and the safe area.
      strokeWidth: 0,
    }) as any;
    tb.styleId = st.id;
    tb.role = 'text';
    tb.name = st.name;
    this.centreInSafe(tb);
    return this.add(tb);
  }

  applyTextStyle(styleId: string) {
    const st = TEXT_STYLES.find((s) => s.id === styleId);
    if (!st) return;
    for (const o of this.activeList()) {
      if (!this.isText(o)) continue;
      o.set({
        fontFamily: st.fontFamily,
        fontWeight: st.fontWeight,
        fontSize: this.styleSize(st),
        lineHeight: st.lineHeight,
        charSpacing: st.charSpacing,
        fill: brandColour(st.colour).hex,
      });
      if (st.uppercase) o.set('text', String(o.text).toUpperCase());
      o.removeStyle?.('fill');
      o.styleId = st.id;
      o.initDimensions?.();
      o.setCoords();
    }
    this.canvas.requestRenderAll();
    this.record();
    this.emit('selection');
  }

  isText(o: any) {
    return o && (o.type === 'textbox' || o.type === 'i-text' || o.type === 'text');
  }

  addRect(fill = '#F8BC1E') {
    const s = this.safePt();
    const r = new this.f.Rect({ width: s.w * 0.4, height: s.h * 0.2, fill, rx: 0, ry: 0, strokeWidth: 0 }) as any;
    r.role = 'shape';
    r.name = 'Box';
    this.centreInSafe(r);
    return this.add(r);
  }
  addEllipse(fill = '#F8BC1E') {
    const s = this.safePt();
    const d = Math.min(s.w, s.h) * 0.3;
    const e = new this.f.Ellipse({ rx: d / 2, ry: d / 2, fill, strokeWidth: 0 }) as any;
    e.role = 'shape';
    e.name = 'Circle';
    this.centreInSafe(e);
    return this.add(e);
  }
  addLine(stroke = '#211F18') {
    const s = this.safePt();
    const l = new this.f.Line([0, 0, s.w * 0.5, 0], { stroke, strokeWidth: Math.max(0.5, mm(0.3)), strokeLineCap: 'butt' }) as any;
    l.role = 'shape';
    l.name = 'Line';
    this.centreInSafe(l);
    return this.add(l);
  }

  /** A brand background filling the whole bleed area, placed behind everything. */
  addBrandBg(spec: BrandBgSpec, cover: 'media' | 'top-half' = 'media') {
    const BrandBg = BrandBgClass;
    const h = cover === 'media' ? this.H : this.H / 2;
    const o = new BrandBg({ left: 0, top: 0, width: this.W, height: h, fill: spec.base, strokeWidth: 0 }) as any;
    o.brandBg = spec;
    o.role = 'background';
    o.name = spec.dark ? 'Dark brand background' : 'Light brand background';
    this.add(o);
    this.canvas.sendObjectToBack(o);
    this.canvas.requestRenderAll();
    this.record();
    return o;
  }

  /** A CTA button ('solid') or an accreditation-style chip ('chip'). */
  addButton(label: string, variant: 'solid' | 'dark' | 'chip' | 'chip-dark' = 'solid', select = true) {
    const BrandButton = BrandButtonClass;
    const scale = Math.max(0.6, Math.min(4, Math.sqrt(this.safePt().w * this.safePt().h) / Math.sqrt(mm(148) * mm(210))));
    const chip = variant === 'chip' || variant === 'chip-dark';
    const size = chip ? Math.max(6, 7 * scale) : Math.max(7, 11 * scale);
    const o = new BrandButton({
      width: 10,
      height: 10,
      rx: mm(chip ? 0.4 : 0.6),
      ry: mm(chip ? 0.4 : 0.6),
      fill: variant === 'solid' ? '#F8BC1E' : variant === 'dark' ? '#211F18' : 'rgba(0,0,0,0)',
      stroke: variant === 'chip' ? 'rgba(33,31,24,0.35)' : variant === 'chip-dark' ? 'rgba(247,242,231,0.4)' : null,
      strokeWidth: chip ? 0.6 : 0,
    }) as any;
    Object.assign(o, {
      label: chip ? label.toUpperCase() : label,
      labelFont: chip ? FONT_STACK['HX Mono'] : FONT_STACK['HX Ezra'],
      labelWeight: chip ? 600 : 700,
      labelSize: size,
      labelFill: variant === 'solid' ? '#211F18' : variant === 'dark' ? '#F8BC1E' : variant === 'chip' ? '#211F18' : '#F7F2E7',
      labelSpacing: chip ? 80 : 0,
      padX: size * (chip ? 0.8 : 1.3),
      padY: size * (chip ? 0.55 : 0.8),
      role: chip ? 'chip' : 'button',
      name: chip ? `Chip · ${label}` : 'Button',
    });
    o.fitLabel();
    if (select) this.centreInSafe(o);
    return this.add(o, select);
  }

  /** Update a button's label/props and re-fit the pill. */
  setButton(props: Record<string, unknown>) {
    for (const o of this.activeList()) {
      if (o.type !== 'brandbutton') continue;
      Object.assign(o, props);
      o.fitLabel();
      o.dirty = true;
    }
    this.canvas.requestRenderAll();
    this.record();
    this.emit('selection');
  }

  /** A photo placeholder frame. Drop a photo onto it (or "Fill frame") to replace it. */
  addFrame(w?: number, h?: number) {
    const s = this.safePt();
    const fw = w ?? s.w * 0.6, fh = h ?? s.h * 0.35;
    const rect = new this.f.Rect({ width: fw, height: fh, fill: '#EFE8D8', stroke: 'rgba(33,31,24,0.25)', strokeWidth: 0.6, strokeDashArray: [3, 2], strokeUniform: true, originX: 'center', originY: 'center', left: 0, top: 0 });
    const lbl = new this.f.Textbox('PHOTO', {
      width: fw * 0.9, fontFamily: FONT_STACK['HX Mono'], fontWeight: 600, fontSize: Math.max(6, Math.min(fw, fh) * 0.08),
      charSpacing: 140, fill: '#A69F8E', textAlign: 'center', originX: 'center', originY: 'center', left: 0, top: 0,
    });
    const g = new this.f.Group([rect, lbl], { subTargetCheck: false }) as any;
    g.role = 'photo-slot';
    g.name = 'Photo frame';
    this.centreInSafe(g);
    return this.add(g);
  }

  /**
   * Put a photo into a frame/image's box, cropped to FILL it (focal point fx/fy 0–1),
   * replacing the frame. Uses fabric's native crop (cropX/cropY + width/height).
   */
  async fillFrame(target: any, url: string, opts: { assetPath?: string; name?: string } = {}) {
    const b = target.getBoundingRect();
    const img = (await this.f.FabricImage.fromURL(url, { crossOrigin: 'anonymous' })) as any;
    const el = img.getElement();
    const NW = el.naturalWidth || img.width, NH = el.naturalHeight || img.height;
    img.assetPath = opts.assetPath ?? null;
    img.role = 'photo';
    img.name = opts.name ?? 'Photo';
    img.srcName = opts.name ?? null;
    this.cropToBox(img, NW, NH, b.width, b.height, 0.5, 0.5);
    img.set({ left: b.left, top: b.top, angle: 0 });
    img.setCoords();
    const c = this.canvas;
    const idx = c.getObjects().indexOf(target);
    c.remove(target);
    c.insertAt(Math.max(0, idx), img);
    this.applyRoleControls(img);
    c.setActiveObject(img);
    c.requestRenderAll();
    this.record();
    this.emit('selection');
    return img;
  }

  /** Crop an image to fill a w×h box (pt) with its focal point at fx, fy. */
  cropToBox(img: any, NW: number, NH: number, w: number, h: number, fx: number, fy: number) {
    const k = Math.max(w / NW, h / NH); // pt per source px (cover)
    const vw = w / k, vh = h / k; // visible source px
    const cropX = Math.max(0, Math.min(NW - vw, fx * NW - vw / 2));
    const cropY = Math.max(0, Math.min(NH - vh, fy * NH - vh / 2));
    img.set({ cropX, cropY, width: vw, height: vh, scaleX: k, scaleY: k });
    img.focalX = fx;
    img.focalY = fy;
  }

  /** Move a cropped photo's focal point (keeps its box). */
  setFocal(fx: number, fy: number) {
    const img = this.active();
    if (!img || img.type !== 'image') return;
    const el = img.getElement();
    const NW = el.naturalWidth || img.width, NH = el.naturalHeight || img.height;
    const w = img.width * img.scaleX, h = img.height * img.scaleY;
    const left = img.left, top = img.top;
    this.cropToBox(img, NW, NH, w, h, fx, fy);
    img.set({ left, top });
    img.setCoords();
    img.dirty = true;
    this.canvas.requestRenderAll();
    this.record();
    this.emit('selection');
  }

  async addImage(url: string, opts: { assetPath?: string; name?: string; role?: string; widthPt?: number } = {}) {
    const img = (await this.f.FabricImage.fromURL(url, { crossOrigin: 'anonymous' })) as any;
    const s = this.safePt();
    const target = opts.widthPt ?? Math.min(s.w * 0.6, s.h * 0.6 * (img.width / img.height));
    img.scale(target / img.width);
    img.assetPath = opts.assetPath ?? null;
    img.role = opts.role ?? 'photo';
    img.name = opts.name ?? 'Image';
    img.srcName = opts.name ?? null;
    this.centreInSafe(img);
    return this.add(img);
  }

  async addSvg(svgText: string, opts: { role: string; name: string; widthPt?: number; logoId?: string; iconName?: string }) {
    const { objects, options } = await this.f.loadSVGFromString(svgText);
    const parts = objects.filter(Boolean) as any[];
    const o = (parts.length === 1 ? parts[0] : this.f.util.groupSVGElements(parts, options)) as any;
    const s = this.safePt();
    const w = opts.widthPt ?? s.w * 0.4;
    o.scale(w / (o.width || 1));
    o.role = opts.role;
    o.name = opts.name;
    if (opts.logoId) o.logoId = opts.logoId;
    if (opts.iconName) o.iconName = opts.iconName;
    this.centreInSafe(o);
    return this.add(o);
  }

  /** Recolour vector paths inside an object (icons) — fills and strokes that aren't transparent. */
  recolourVector(o: any, map: (c: string) => string) {
    const visit = (x: any) => {
      if (x.getObjects) x.getObjects().forEach(visit);
      if (typeof x.fill === 'string' && x.fill && x.fill !== 'none') x.set('fill', map(x.fill));
      if (typeof x.stroke === 'string' && x.stroke && x.stroke !== 'none') x.set('stroke', map(x.stroke));
    };
    visit(o);
    o.dirty = true;
    this.canvas.requestRenderAll();
    this.record();
  }

  setFill(hex: string) {
    const c = this.canvas;
    const a = c.getActiveObject();
    if (!a) return;
    if (this.isText(a) && a.isEditing && a.selectionStart !== a.selectionEnd) {
      a.setSelectionStyles({ fill: hex });
    } else {
      for (const o of this.activeList()) {
        if (o.role === 'logo' || o.role === 'spark') continue; // never recolour the logo
        if (o.type === 'brandbg') {
          o.brandBg = { ...o.brandBg, base: hex, dark: luminance(hex) < 0.4 };
          o.set('fill', hex);
        } else if (o.type === 'line') o.set('stroke', hex);
        else if (o.getObjects && !this.isText(o)) this.recolourVector(o, () => hex);
        else {
          o.set('fill', hex);
          o.removeStyle?.('fill');
        }
        o.dirty = true;
      }
    }
    c.requestRenderAll();
    this.record();
    this.emit('selection');
  }

  rotateTo(deg: number) {
    const o = this.active();
    if (!o) return;
    o.rotate(deg);
    o.setCoords();
    this.canvas.requestRenderAll();
    this.record();
    this.emit('selection');
  }

  setBrandBg(patch: Partial<BrandBgSpec>) {
    const o = this.active();
    if (!o || o.type !== 'brandbg') return;
    o.brandBg = { ...(o.brandBg || { base: '#211F18', glow: true, grid: true, dark: true }), ...patch };
    o.dirty = true;
    this.canvas.requestRenderAll();
    this.record();
    this.emit('selection');
  }

  /** Stretch the selected background over the whole sheet (to the bleed edge) and send it back. */
  fillBleed() {
    const o = this.active();
    if (!o) return;
    o.set({ left: 0, top: 0, width: this.W, height: this.H, scaleX: 1, scaleY: 1, angle: 0 });
    o.setCoords();
    this.canvas.sendObjectToBack(o);
    this.canvas.requestRenderAll();
    this.record();
    this.emit('selection');
  }

  /** Icons: strokes take the tone; the 30% gold tint fill stays gold. */
  setIconTone(hex: string) {
    const o = this.active();
    if (!o) return;
    const visit = (x: any) => {
      if (x.getObjects) x.getObjects().forEach(visit);
      if (typeof x.stroke === 'string' && x.stroke && x.stroke !== 'none') x.set('stroke', hex);
    };
    visit(o);
    o.dirty = true;
    this.canvas.requestRenderAll();
    this.record();
  }

  toggleVisible(o: any) {
    o.set('visible', o.visible === false);
    this.canvas.requestRenderAll();
    this.record();
    this.emit('selection');
  }

  select(o: any) {
    this.canvas.setActiveObject(o);
    this.canvas.requestRenderAll();
    this.emit('selection');
  }

  /** Highlight the selected words in solar gold (brand accent). */
  accentSelection() {
    const a = this.active();
    if (!this.isText(a)) return false;
    if (a.isEditing && a.selectionStart !== a.selectionEnd) {
      a.setSelectionStyles({ fill: brandColour('solar').hex });
      this.canvas.requestRenderAll();
      this.record();
      return true;
    }
    return false;
  }

  set(props: Record<string, unknown>) {
    for (const o of this.activeList()) {
      o.set(props);
      if (this.isText(o)) o.initDimensions?.();
      o.setCoords();
      o.dirty = true;
    }
    this.canvas.requestRenderAll();
    this.record();
    this.emit('selection');
  }

  /** Geometry in mm for the inspector (bounding box, top-left of media). */
  boxMm(o: any) {
    const b = o.getBoundingRect();
    return { x: toMm(b.left), y: toMm(b.top), w: toMm(b.width), h: toMm(b.height) };
  }
  moveTo(xMm: number | null, yMm: number | null) {
    const o = this.active();
    if (!o) return;
    const b = o.getBoundingRect();
    if (xMm != null) o.left += mm(xMm) - b.left;
    if (yMm != null) o.top += mm(yMm) - b.top;
    o.setCoords();
    this.canvas.requestRenderAll();
    this.record();
    this.emit('selection');
  }
  resizeTo(wMm: number | null, hMm: number | null, keepRatio = true) {
    const o = this.active();
    if (!o) return;
    const b = o.getBoundingRect();
    if (this.isText(o) && wMm != null) {
      o.set('width', mm(wMm) / (o.scaleX || 1));
      o.initDimensions?.();
    } else {
      const kx = wMm != null ? mm(wMm) / b.width : null;
      const ky = hMm != null ? mm(hMm) / b.height : null;
      const lockRatio = keepRatio || o.role === 'logo' || o.role === 'spark' || o.role === 'icon';
      if (lockRatio) {
        const k = kx ?? ky ?? 1;
        o.set({ scaleX: o.scaleX * k, scaleY: o.scaleY * k });
      } else {
        if (kx) o.set('scaleX', o.scaleX * kx);
        if (ky) o.set('scaleY', o.scaleY * ky);
      }
    }
    o.setCoords();
    this.canvas.requestRenderAll();
    this.record();
    this.emit('selection');
  }

  /** Align the selection (or a single object) to the page trim, safe area, or each other. */
  align(where: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom', to: 'trim' | 'safe' | 'selection' = 'safe') {
    const list = this.activeList();
    if (!list.length) return;
    const c = this.canvas;
    let ref: { x: number; y: number; w: number; h: number };
    if (to === 'selection' && list.length > 1) {
      const a = c.getActiveObject().getBoundingRect();
      ref = { x: a.left, y: a.top, w: a.width, h: a.height };
    } else ref = to === 'trim' ? this.trimPt() : this.safePt();
    // operate on the whole active selection as one when aligning to the page
    const targets = to === 'selection' ? list : [c.getActiveObject()];
    for (const o of targets) {
      const b = o.getBoundingRect();
      let dx = 0, dy = 0;
      if (where === 'left') dx = ref.x - b.left;
      if (where === 'hcenter') dx = ref.x + ref.w / 2 - (b.left + b.width / 2);
      if (where === 'right') dx = ref.x + ref.w - (b.left + b.width);
      if (where === 'top') dy = ref.y - b.top;
      if (where === 'vcenter') dy = ref.y + ref.h / 2 - (b.top + b.height / 2);
      if (where === 'bottom') dy = ref.y + ref.h - (b.top + b.height);
      o.set({ left: o.left + dx, top: o.top + dy });
      o.setCoords();
    }
    c.requestRenderAll();
    this.record();
    this.emit('selection');
  }

  arrange(dir: 'front' | 'forward' | 'backward' | 'back') {
    const c = this.canvas;
    for (const o of this.activeList()) {
      if (dir === 'front') c.bringObjectToFront(o);
      if (dir === 'forward') c.bringObjectForward(o);
      if (dir === 'backward') c.sendObjectBackwards(o);
      if (dir === 'back') c.sendObjectToBack(o);
    }
    c.requestRenderAll();
    this.record();
    this.emit('selection');
  }

  setLocked(locked: boolean) {
    for (const o of this.activeList()) {
      o.locked = locked;
      o.set({ lockMovementX: locked, lockMovementY: locked, lockScalingX: locked, lockScalingY: locked, lockRotation: locked, hasControls: !locked });
      if (!locked) this.applyRoleControls(o);
    }
    this.canvas.requestRenderAll();
    this.record();
    this.emit('selection');
  }

  removeSelected() {
    const c = this.canvas;
    const list = this.activeList();
    if (!list.length) return;
    c.discardActiveObject();
    for (const o of list) c.remove(o);
    c.requestRenderAll();
    this.emit('selection');
  }

  async duplicate() {
    const c = this.canvas;
    const a = c.getActiveObject();
    if (!a) return;
    const clone = await a.clone(CUSTOM_PROPS);
    c.discardActiveObject();
    const off = mm(4);
    if (clone.type === 'activeselection' || clone.type === 'activeSelection') {
      clone.canvas = c;
      clone.forEachObject((o: any) => { o.id = uid(); this.applyRoleControls(o); c.add(o); });
      clone.set({ left: clone.left + off, top: clone.top + off });
      clone.setCoords();
      c.setActiveObject(clone);
    } else {
      clone.set({ left: clone.left + off, top: clone.top + off });
      clone.id = uid();
      this.add(clone);
    }
    c.requestRenderAll();
    this.emit('selection');
  }

  async copy() {
    const list = this.activeList();
    if (!list.length) return;
    this.clipboard = await Promise.all(list.map((o: any) => o.clone(CUSTOM_PROPS)));
  }
  async paste() {
    if (!this.clipboard?.length) return;
    const c = this.canvas;
    c.discardActiveObject();
    const added: any[] = [];
    for (const src of this.clipboard) {
      const o = await src.clone(CUSTOM_PROPS);
      o.set({ left: o.left + mm(4), top: o.top + mm(4) });
      o.id = uid();
      this.applyRoleControls(o);
      c.add(o);
      added.push(o);
    }
    this.clipboard = await Promise.all(added.map((o: any) => o.clone(CUSTOM_PROPS)));
    if (added.length === 1) c.setActiveObject(added[0]);
    else c.setActiveObject(new this.f.ActiveSelection(added, { canvas: c }));
    c.requestRenderAll();
    this.emit('selection');
  }

  selectAll() {
    const c = this.canvas;
    const objs = c.getObjects().filter((o: any) => o.selectable !== false && !o.locked);
    if (!objs.length) return;
    c.discardActiveObject();
    c.setActiveObject(objs.length === 1 ? objs[0] : new this.f.ActiveSelection(objs, { canvas: c }));
    c.requestRenderAll();
    this.emit('selection');
  }

  group() {
    const c = this.canvas;
    const list = this.activeList();
    if (list.length < 2) return;
    c.discardActiveObject();
    for (const o of list) c.remove(o);
    const g = new this.f.Group(list, { subTargetCheck: false }) as any;
    g.role = 'group';
    g.name = 'Group';
    this.add(g);
    this.record();
  }
  ungroup() {
    const c = this.canvas;
    const g = c.getActiveObject();
    if (!g || g.type !== 'group' || g.role === 'logo' || g.role === 'icon') return;
    c.discardActiveObject();
    const items = g.removeAll();
    c.remove(g);
    for (const o of items) { o.id ??= uid(); c.add(o); }
    c.setActiveObject(new this.f.ActiveSelection(items, { canvas: c }));
    c.requestRenderAll();
    this.record();
    this.emit('selection');
  }

  /** A small JPEG of the page for project thumbnails / page strip. */
  thumbnail(maxPx = 480, quality = 0.82) {
    const c = this.canvas;
    const vpt = c.viewportTransform.slice();
    const active = c.getActiveObject();
    c.discardActiveObject();
    const prevGuides = this.showGuides, prevTrim = this.trimPreview;
    this.showGuides = false;
    this.trimPreview = false;
    c.setViewportTransform([1, 0, 0, 1, 0, 0]);
    const tr = this.trimPt();
    const mult = maxPx / Math.max(tr.w, tr.h);
    let url = '';
    try {
      url = c.toDataURL({ format: 'jpeg', quality, multiplier: mult, left: tr.x, top: tr.y, width: tr.w, height: tr.h });
    } catch {
      url = '';
    }
    c.setViewportTransform(vpt);
    this.showGuides = prevGuides;
    this.trimPreview = prevTrim;
    if (active) c.setActiveObject(active);
    c.requestRenderAll();
    return url;
  }

  /** Colours used on the page (for the brand check). */
  coloursUsed() {
    const out = new Map<string, number>();
    const visit = (o: any) => {
      if (o.getObjects && o.type !== 'textbox') o.getObjects().forEach(visit);
      for (const k of ['fill', 'stroke']) {
        const v = o[k];
        if (typeof v === 'string' && /^#|rgb/i.test(v)) out.set(v.toUpperCase(), (out.get(v.toUpperCase()) ?? 0) + 1);
      }
    };
    this.objects().forEach(visit);
    return out;
  }

  brandSwatches() {
    return BRAND_COLOURS;
  }
}

export function luminance(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 1;
  const n = m[1];
  const ch = (i: number) => {
    const v = parseInt(n.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
}
export function contrast(a: string, b: string) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
