'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { drawMarkup, MARKUP_COLOURS, type Markup, type MarkupItem, type Pt } from '@/lib/surveys/markup';

/**
 * Draw on a survey photo: pen, arrow and text labels in solar yellow or red, with undo. One finger
 * always draws; two fingers zoom and move the photo. Everything is kept as 0..1 vectors (markup.ts),
 * so the drawing fits the photo at any size; SurveyForm saves it and the flattened JPEG.
 */

type Tool = 'pen' | 'arrow' | 'text';
type View = { s: number; tx: number; ty: number; fit: number };
type XY = { x: number; y: number };
type Gesture =
  | { kind: 'draw'; id: number; start: XY; moved: boolean }
  | { kind: 'pinch'; d0: number; m0: XY; v0: View }
  /** A pinch has ended with a finger still down: nothing until every finger is up. */
  | { kind: 'locked' };

/** Line width and text size, as a fraction of the photo's longer side. */
const PEN_W = 0.008;
const TEXT_SIZE = 0.045;
const MAX_PATH_NUMBERS = 3998;
const LABELS = ['Panels here', 'No panels', 'Inverter here', 'Battery here', 'Cable route', 'Scaffold here'];
const COLOUR_NAMES: Record<string, string> = { '#F8BC1E': 'Yellow', '#E02424': 'Red' };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
const mid = (a: XY, b: XY): XY => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function MarkupEditor({
  src,
  initial,
  title,
  onSave,
  onClose,
}: {
  src: string;
  initial: Markup | null;
  title: string;
  /** null removes the drawing. */
  onSave: (m: Markup | null) => Promise<void>;
  onClose: () => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement | null>(null);
  const view = useRef<View>({ s: 1, tx: 0, ty: 0, fit: 1 });
  const itemsRef = useRef<MarkupItem[]>(initial?.items ?? []);
  const live = useRef<MarkupItem | null>(null);
  const pointers = useRef(new Map<number, XY>());
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef<number | null>(null);
  const [items, setItems] = useState<MarkupItem[]>(initial?.items ?? []);
  const [tool, setTool] = useState<Tool>('pen');
  const [colour, setColour] = useState<string>(MARKUP_COLOURS[0]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [textAt, setTextAt] = useState<Pt | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  // The photo can move from the phone's copy to the uploaded one while you draw: keep the first.
  const [source] = useState(src);

  const paint = useCallback(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, c.width, c.height);
    const im = img.current;
    if (!im?.naturalWidth) return;
    const W = im.naturalWidth;
    const H = im.naturalHeight;
    const v = view.current;
    ctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.tx, dpr * v.ty);
    ctx.drawImage(im, 0, 0, W, H);
    drawMarkup(ctx, { v: 1, items: live.current ? [...itemsRef.current, live.current] : itemsRef.current }, W, H);
  }, []);

  const schedule = useCallback(() => {
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      paint();
    });
  }, [paint]);

  /** Size the canvas to the screen and fit the whole photo in it. */
  const fit = useCallback(() => {
    const c = canvas.current;
    const st = stage.current;
    if (!c || !st) return;
    const r = st.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.round(r.width * dpr));
    c.height = Math.max(1, Math.round(r.height * dpr));
    const im = img.current;
    if (im?.naturalWidth) {
      const f = Math.min(r.width / im.naturalWidth, r.height / im.naturalHeight);
      view.current = { fit: f, s: f, tx: (r.width - im.naturalWidth * f) / 2, ty: (r.height - im.naturalHeight * f) / 2 };
    }
    paint();
  }, [paint]);

  useEffect(() => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => {
      img.current = im;
      setLoaded(true);
    };
    im.onerror = () => setError('This photo can’t be opened without signal. Draw on it when you’re back in signal.');
    im.src = source;
    return () => {
      im.onload = null;
      im.onerror = null;
    };
  }, [source]);

  useEffect(() => {
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit, loaded]);

  useEffect(() => {
    paint();
  }, [items, paint]);

  useEffect(
    () => () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    },
    []
  );

  const commit = (next: MarkupItem[]) => {
    itemsRef.current = next;
    setItems(next);
  };

  const local = (e: React.PointerEvent<HTMLCanvasElement>): XY => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** Screen point → 0..1 of the photo. */
  const toPhoto = (p: XY): Pt | null => {
    const im = img.current;
    if (!im?.naturalWidth) return null;
    const v = view.current;
    return [clamp((p.x - v.tx) / v.s / im.naturalWidth, 0, 1), clamp((p.y - v.ty) / v.s / im.naturalHeight, 0, 1)];
  };

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!loaded || textAt) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    const pts = pointers.current;
    pts.set(e.pointerId, p);
    if (pts.size === 2) {
      // A second finger: zoom and move instead (a line just started is dropped).
      live.current = null;
      const [a, b] = [...pts.values()];
      gesture.current = { kind: 'pinch', d0: dist(a, b), m0: mid(a, b), v0: { ...view.current } };
      schedule();
      return;
    }
    if (pts.size > 2 || gesture.current) return;
    const n = toPhoto(p);
    if (!n) return;
    gesture.current = { kind: 'draw', id: e.pointerId, start: p, moved: false };
    live.current =
      tool === 'pen' ? { t: 'path', c: colour, w: PEN_W, pts: [n[0], n[1]] } : tool === 'arrow' ? { t: 'arrow', c: colour, w: PEN_W, a: n, b: n } : null;
    schedule();
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    const pts = pointers.current;
    if (!pts.has(e.pointerId)) return;
    const p = local(e);
    pts.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pinch' && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const v0 = g.v0;
      const s = clamp((v0.s * dist(a, b)) / g.d0, v0.fit, v0.fit * 8);
      const m = mid(a, b);
      // The bit of photo first under the fingers stays under them.
      const ix = (g.m0.x - v0.tx) / v0.s;
      const iy = (g.m0.y - v0.ty) / v0.s;
      view.current = { ...v0, s, tx: m.x - ix * s, ty: m.y - iy * s };
      schedule();
      return;
    }
    if (g.kind !== 'draw' || g.id !== e.pointerId) return;
    if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) > 6) g.moved = true;
    const it = live.current;
    const n = toPhoto(p);
    if (!it || !n) return;
    if (it.t === 'path') {
      const lx = it.pts[it.pts.length - 2];
      const ly = it.pts[it.pts.length - 1];
      if (Math.abs(n[0] - lx) + Math.abs(n[1] - ly) < 0.002 || it.pts.length >= MAX_PATH_NUMBERS) return;
      it.pts.push(n[0], n[1]);
    } else if (it.t === 'arrow') {
      it.b = n;
    }
    schedule();
  }

  function up(e: React.PointerEvent<HTMLCanvasElement>, cancelled = false) {
    const pts = pointers.current;
    if (!pts.delete(e.pointerId)) return;
    const g = gesture.current;
    if (g?.kind === 'pinch' || g?.kind === 'locked') {
      gesture.current = pts.size ? { kind: 'locked' } : null;
      return;
    }
    if (g?.kind !== 'draw' || g.id !== e.pointerId) return;
    gesture.current = null;
    const it = live.current;
    live.current = null;
    if (cancelled) {
      schedule();
      return;
    }
    if (tool === 'text') {
      const at = g.moved ? null : toPhoto(local(e));
      if (at) {
        setText('');
        setTextAt(at);
      }
      return;
    }
    if (!it || (it.t === 'arrow' && !g.moved)) {
      schedule(); // a tap isn't an arrow
      return;
    }
    commit([...itemsRef.current, it]);
  }

  function addText(label?: string) {
    const s = (label ?? text).replace(/\s+/g, ' ').trim().slice(0, 80);
    if (s && textAt) commit([...itemsRef.current, { t: 'text', c: colour, a: textAt, s, size: TEXT_SIZE }]);
    setTextAt(null);
    setText('');
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave(items.length ? { v: 1, items } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save the drawing. Try again.');
      setSaving(false);
    }
  }

  const changed = JSON.stringify(items) !== JSON.stringify(initial?.items ?? []);

  return (
    <div className="svm" role="dialog" aria-modal="true" aria-label={`Draw on ${title}`}>
      <div className="svm-top">
        <button
          type="button"
          className="svm-btn"
          onClick={() => {
            if (!changed || window.confirm('Leave without saving the drawing?')) onClose();
          }}
        >
          ✕ Cancel
        </button>
        <strong className="svm-title">{title}</strong>
        <button type="button" className="svm-btn svm-btn--save" disabled={saving || !loaded || (!changed && !!initial)} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="svm-stage" ref={stage}>
        <canvas
          ref={canvas}
          className="svm-canvas"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={(e) => up(e)}
          onPointerCancel={(e) => up(e, true)}
          aria-label="Drawing area: one finger draws, two fingers zoom and move"
        />
        {!loaded && !error && <p className="svm-msg">Opening the photo…</p>}
        {error && (
          <p className="svm-msg svm-msg--err" role="alert">
            {error}
          </p>
        )}
        {loaded && !items.length && !textAt && (
          <p className="svm-tip">{tool === 'text' ? 'Tap where the label goes.' : 'One finger draws. Two fingers zoom and move.'}</p>
        )}
      </div>

      <div className="svm-tools" role="toolbar" aria-label="Drawing tools">
        {(
          [
            ['pen', '✎ Pen'],
            ['arrow', '➚ Arrow'],
            ['text', 'T Text'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" className={tool === k ? 'svm-tool is-on' : 'svm-tool'} aria-pressed={tool === k} onClick={() => setTool(k)}>
            {label}
          </button>
        ))}
        {MARKUP_COLOURS.map((c) => (
          <button
            key={c}
            type="button"
            className={colour === c ? 'svm-tool svm-colour is-on' : 'svm-tool svm-colour'}
            aria-pressed={colour === c}
            onClick={() => setColour(c)}
          >
            <span className="svm-swatch" style={{ background: c }} />
            {COLOUR_NAMES[c] ?? c}
          </button>
        ))}
        <button type="button" className="svm-tool" disabled={!items.length} onClick={() => commit(items.slice(0, -1))}>
          ↶ Undo
        </button>
        <button type="button" className="svm-tool" disabled={!loaded} onClick={fit}>
          ⤢ Fit
        </button>
        {!!initial && (
          <button
            type="button"
            className="svm-tool"
            disabled={!items.length}
            onClick={() => {
              if (window.confirm('Remove the whole drawing?')) commit([]);
            }}
          >
            Clear all
          </button>
        )}
      </div>

      {textAt && (
        <div className="svm-text" role="dialog" aria-label="Add a label">
          <label className="svf-label" htmlFor="svm-text-input">
            Label
          </label>
          <div className="svf-chips">
            {LABELS.map((l) => (
              <button key={l} type="button" className="svf-pill" onClick={() => addText(l)}>
                {l}
              </button>
            ))}
          </div>
          <input
            id="svm-text-input"
            className="svf-input"
            value={text}
            maxLength={80}
            placeholder="Or type your own"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addText()}
          />
          <div className="svf-row">
            <button type="button" className="svf-btn svf-btn--ghost" onClick={() => setTextAt(null)}>
              Cancel
            </button>
            <button type="button" className="svf-btn" disabled={!text.trim()} onClick={() => addText()}>
              Add label
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
