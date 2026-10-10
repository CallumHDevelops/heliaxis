'use client';

/**
 * Full-screen, in-page document viewer (portal + admin).
 *
 * Phones can't be trusted with PDFs in a new tab or an <iframe> (Android Chrome won't render them,
 * iOS shows page 1 only), so PDFs are drawn with pdf.js into <canvas> elements, lazily, page by page.
 * Images are shown directly from an object URL. pdf.js is only downloaded when a viewer opens.
 */

import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { PDFDocumentLoadingTask, PDFPageProxy, PDFWorker, RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import './doc-viewer.css';

export type ViewerDoc = { src: string; title: string; mime?: string | null; downloadHref?: string };

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type PageInfo = { page: PDFPageProxy; w: number; h: number };
type Load =
  | { kind: 'loading'; progress: number | null }
  | { kind: 'error'; message: string; retry: boolean }
  | { kind: 'image'; url: string }
  | { kind: 'pdf'; pages: PageInfo[] };
type Box = { w: number; h: number; dpr: number };
/** A point on a page (or the image) as fractions of its box, pinned to (vx, vy) in the scroll viewport. */
type Anchor = { el: HTMLElement; fx: number; fy: number; vx: number; vy: number };
type OwnWorker = { worker: Worker; pdfWorker: PDFWorker };

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEPS = [0.5, 0.67, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
/** "Fit" fills the width on phones/tablets but stops at a comfortable reading width on desktops. */
const MAX_FIT_WIDTH = 960;
/** iOS Safari refuses (blank canvas) above 4096×4096 = 16.7 MP; stay a little under. */
const MAX_CANVAS_PIXELS = 16_000_000;
const MAX_DPR = 2;
/** Pages within this distance of the viewport are rendered; further ones release their canvases. */
const ROOT_MARGIN = '500px 0px';
const RESIZE_DEBOUNCE_MS = 150;
const WHEEL_COMMIT_MS = 180;
/** How long one open waits for the worker before parsing on the main thread instead. */
const WORKER_READY_TIMEOUT_MS = 15_000;
/** After that, a still-loading worker may finish in the background for this long (see startWorker). */
const WORKER_WARMUP_MS = 120_000;
const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

class ViewerError extends Error {
  constructor(
    message: string,
    readonly retry: boolean,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------------------------
// pdf.js loading (shared across viewer opens)

let pdfjsPromise: Promise<PdfJs> | null = null;
/**
 * Set once the real worker has failed to start (constructor threw / worker reported an error);
 * later opens go straight to the main-thread parser. A worker that's merely slow never sets it.
 */
let mainThreadOnly = false;

function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs')
    .then((pdfjs) => {
      // The bundler sees `new URL(<package file>, import.meta.url)`, emits the worker file as a static
      // asset and rewrites this to its hashed /_next/static/... URL. Never imported into the page bundle.
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
      return pdfjs;
    })
    .catch((err: unknown) => {
      pdfjsPromise = null;
      throw err;
    });
  return pdfjsPromise;
}

/**
 * Start pdf.js's worker ourselves and wait for its "ready" message, so a worker that can't load
 * (bad asset URL, wrong MIME type, no module-worker support) is detected and we can fall back to
 * parsing on the main thread. pdf.js's own fallback caches a failure for the life of the page.
 *
 * Only a real failure switches the rest of the session to the main thread. "ready" only arrives once
 * the 1.4 MB script has downloaded, so a timeout usually means a slow connection, not a broken
 * worker: that open alone falls back, and the worker keeps loading in the background (for up to
 * WORKER_WARMUP_MS) so its script is in the HTTP cache and the next open gets a worker promptly.
 */
function startWorker(pdfjs: PdfJs, signal: AbortSignal): Promise<OwnWorker | null> {
  return new Promise((resolve) => {
    if (mainThreadOnly || signal.aborted) {
      resolve(null);
      return;
    }
    let created: Worker | null = null;
    try {
      if (typeof Worker !== 'undefined') created = new Worker(pdfjs.GlobalWorkerOptions.workerSrc, { type: 'module' });
    } catch {
      // no (module) worker support here
    }
    if (!created) {
      mainThreadOnly = true;
      resolve(null);
      return;
    }
    const worker = created;
    let waiting = true; // the open that started this worker is still waiting for it
    let timer = 0;
    const detach = () => {
      window.clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
    };
    const giveUp = () => {
      if (!waiting) return;
      waiting = false;
      resolve(null);
    };
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { action?: unknown } | null)?.action !== 'ready') return;
      detach();
      if (waiting) {
        waiting = false;
        resolve({ worker, pdfWorker: pdfjs.PDFWorker.fromPort({ port: worker }) });
      } else {
        worker.terminate(); // too late for its open, but the script is cached now for the next one
      }
    };
    const onError = (e: Event) => {
      e.preventDefault();
      detach();
      worker.terminate();
      mainThreadOnly = true; // the worker script can't run here — don't retry it this session
      giveUp();
    };
    const onAbort = () => {
      detach();
      worker.terminate();
      giveUp();
    };
    timer = window.setTimeout(() => {
      // Transient: this open parses on the main thread. The worker is no longer tied to the open
      // (closing the viewer doesn't stop it) and is stopped if it still isn't up after the warm-up.
      signal.removeEventListener('abort', onAbort);
      giveUp();
      timer = window.setTimeout(() => {
        detach();
        worker.terminate();
      }, WORKER_WARMUP_MS);
    }, WORKER_READY_TIMEOUT_MS);
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    signal.addEventListener('abort', onAbort);
  });
}

/** Last resort: load the worker code as an ordinary (lazy) chunk; it registers globalThis.pdfjsWorker. */
async function loadMainThreadWorker(): Promise<void> {
  if ((globalThis as { pdfjsWorker?: unknown }).pdfjsWorker) return;
  // @ts-expect-error -- pdfjs-dist ships no type declarations for the worker bundle.
  const mod: unknown = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker ??= mod;
}

// ---------------------------------------------------------------------------------------------
// helpers

const isImageType = (type: string | null | undefined) => !!type && type.toLowerCase().startsWith('image/');
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));

function stepZoom(z: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > z + 0.001) ?? MAX_ZOOM;
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) if (ZOOM_STEPS[i] < z - 0.001) return ZOOM_STEPS[i];
  return MIN_ZOOM;
}

/** True for a MIME type we know we can't preview (Word, video, …). Unknown/octet-stream is still tried. */
function cannotPreview(mime: string): boolean {
  if (!mime) return false;
  return !isImageType(mime) && !mime.includes('pdf') && !mime.includes('octet-stream');
}

function httpError(status: number): ViewerError {
  if (status === 401 || status === 403) {
    return new ViewerError('You’re signed out or no longer have access to this document. Sign in again, then try once more.', true);
  }
  if (status === 404) return new ViewerError('This document couldn’t be found. It may have been replaced or removed.', false);
  return new ViewerError(`The document couldn’t be loaded (error ${status}).`, true);
}

function describeError(err: unknown): { message: string; retry: boolean } {
  if (err instanceof ViewerError) return { message: err.message, retry: err.retry };
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
  if (name === 'PasswordException') return { message: 'This PDF is password-protected, so it can’t be previewed here.', retry: false };
  if (name === 'InvalidPDFException' || name === 'FormatError') {
    return { message: 'This file couldn’t be read as a PDF or an image.', retry: false };
  }
  if (err instanceof TypeError) {
    return { message: 'The document couldn’t be downloaded. Check your connection and try again.', retry: true };
  }
  return { message: 'This document couldn’t be displayed.', retry: true };
}

/** Read the whole body (no range requests), reporting progress when the size is known. */
async function readBody(res: Response, onProgress: (fraction: number) => void): Promise<Blob> {
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || total <= 0) return res.blob();
  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let received = 0;
  let shown = -1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    const pct = Math.min(99, Math.floor((received / total) * 100));
    if (pct !== shown) {
      shown = pct;
      onProgress(pct / 100);
    }
  }
  return new Blob(chunks, { type });
}

function releaseCanvas(canvas: HTMLCanvasElement) {
  // Zero-sizing frees the backing store immediately — iOS caps total canvas memory per tab.
  canvas.width = 0;
  canvas.height = 0;
}

function releaseHost(host: HTMLElement) {
  for (const c of Array.from(host.querySelectorAll('canvas'))) {
    releaseCanvas(c);
    c.remove();
  }
}

function isRenderCancel(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: unknown }).name === 'RenderingCancelledException';
}

function resetTransform(el: HTMLElement) {
  el.style.transform = '';
  el.style.transformOrigin = '';
}

function trapTab(e: KeyboardEvent, root: HTMLElement) {
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0 && !el.closest('[inert]'),
  );
  const active = document.activeElement;
  if (!items.length) {
    e.preventDefault();
    root.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  if (!active || !root.contains(active)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (e.shiftKey && (active === first || active === root)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

const subscribeNothing = () => () => {};
const onClient = () => true;
const onServer = () => false;

// ---------------------------------------------------------------------------------------------
// public API

/** Full-screen document viewer, portalled into <body>. Render it while open; unmount it to close. */
export function DocViewer({ doc, onClose, actions }: { doc: ViewerDoc; onClose: () => void; actions?: React.ReactNode }): React.JSX.Element {
  // createPortal needs document.body: render nothing during SSR/hydration.
  const isClient = useSyncExternalStore(subscribeNothing, onClient, onServer);
  if (!isClient) return <></>;
  // Keyed by src so a different document starts from a clean slate (loading state, zoom, scroll).
  return createPortal(<Viewer key={doc.src} doc={doc} onClose={onClose} actions={actions} />, document.body);
}

/** Convenience: `const { open, viewer } = useDocViewer();` then render `{viewer}` and call `open(doc)`. */
export function useDocViewer(): { open: (doc: ViewerDoc) => void; viewer: React.ReactNode } {
  const [doc, setDoc] = useState<ViewerDoc | null>(null);
  const open = useCallback((next: ViewerDoc) => setDoc(next), []);
  const close = useCallback(() => setDoc(null), []);
  return { open, viewer: doc ? <DocViewer doc={doc} onClose={close} /> : null };
}

// ---------------------------------------------------------------------------------------------
// the dialog

function Viewer({ doc, onClose, actions }: { doc: ViewerDoc; onClose: () => void; actions?: React.ReactNode }) {
  const { src, title, downloadHref } = doc;
  const mime = (doc.mime ?? '').toLowerCase();
  const unsupported = cannotPreview(mime);

  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef<(HTMLDivElement | null)[]>([]);
  const zoomRef = useRef(1);
  const anchorRef = useRef<Anchor | null>(null);
  const frame = useRef({ id: 0 });

  const [load, setLoad] = useState<Load>({ kind: 'loading', progress: null });
  const [attempt, setAttempt] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(1);
  const [near, setNear] = useState<ReadonlySet<number>>(() => new Set());
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  const pages = load.kind === 'pdf' ? load.pages : null;
  const zoomable = load.kind === 'pdf' || (load.kind === 'image' && natural !== null);
  const hasBox = box !== null;

  /** Change zoom keeping the point (vx, vy) of the scroll viewport — default: its centre — in place. */
  const applyZoom = useCallback((target: number, at?: { vx: number; vy: number }) => {
    const el = scrollRef.current;
    const content = contentRef.current;
    const next = clampZoom(target);
    if (!el || !content || Math.abs(next - zoomRef.current) < 0.005) {
      if (content) resetTransform(content);
      return;
    }
    const vx = at?.vx ?? el.clientWidth / 2;
    const vy = at?.vy ?? el.clientHeight / 2;
    // Pin the point to the page (or image) under it. offset* values ignore any pinch-preview
    // transform, so this measures the committed layout; .dv-scroll is their offsetParent.
    const x = el.scrollLeft + vx;
    const y = el.scrollTop + vy;
    const items = Array.from(content.children) as HTMLElement[];
    const pin = items.find((c) => c.offsetTop + c.offsetHeight >= y) ?? items[items.length - 1];
    anchorRef.current = pin
      ? {
          el: pin,
          fx: (x - pin.offsetLeft) / Math.max(1, pin.offsetWidth),
          fy: (y - pin.offsetTop) / Math.max(1, pin.offsetHeight),
          vx,
          vy,
        }
      : null;
    zoomRef.current = next;
    setZoom(next);
  }, []);

  // After a zoom re-layout: drop any pinch preview and scroll so the anchor point stays put.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (content) resetTransform(content);
    const a = anchorRef.current;
    anchorRef.current = null;
    if (!a || !el || !a.el.isConnected) return;
    el.scrollLeft = a.el.offsetLeft + a.fx * a.el.offsetWidth - a.vx;
    el.scrollTop = a.el.offsetTop + a.fy * a.el.offsetHeight - a.vy;
  }, [zoom]);

  // ---- modal behaviour: focus, Tab trap, Escape, keyboard zoom/scroll, body scroll lock ----------
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    const root = rootRef.current;
    if (!root || e.defaultPrevented || e.isComposing) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'Tab') {
      trapTab(e, root);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    if (zoomable && (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_' || e.key === '0')) {
      e.preventDefault();
      applyZoom(e.key === '0' ? 1 : stepZoom(zoomRef.current, e.key === '+' || e.key === '=' ? 1 : -1));
      return;
    }
    // Let the arrow/page keys scroll the document even while focus sits on a toolbar button.
    const el = scrollRef.current;
    if (!el || (target && el.contains(target))) return;
    const page = el.clientHeight * 0.9;
    const step = new Map([['ArrowDown', 48], ['ArrowUp', -48], ['PageDown', page], ['PageUp', -page]]).get(e.key);
    if (step !== undefined) {
      e.preventDefault();
      el.scrollBy({ top: step });
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      el.scrollTop = e.key === 'Home' ? 0 : el.scrollHeight;
    }
  });

  useEffect(() => {
    const root = rootRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    closeRef.current?.focus({ preventScroll: true });

    const keydown = (e: KeyboardEvent) => onKeyDown(e);
    // Anything that pulls focus behind the dialog (screen-reader cursor, a stray script) is sent back.
    const focusin = (e: FocusEvent) => {
      if (root?.isConnected && e.target instanceof Node && !root.contains(e.target)) closeRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', keydown);
    document.addEventListener('focusin', focusin);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('focusin', focusin);
      body.style.overflow = previousOverflow;
      // Hand focus back only if it went down with the dialog (still inside it, or dropped to <body>
      // when it was removed). This runs after the caller's commit, so if that already focused
      // something else — e.g. an autoFocus field shown in place of the viewer — leave it there.
      const active = document.activeElement;
      const lost = !active || active === body || !active.isConnected || !!root?.contains(active);
      if (lost && previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  // ---- measure the page area (first measurement immediately, then debounced) ---------------------
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let timer = 0;
    const measure = () => {
      const next: Box = { w: el.clientWidth, h: el.clientHeight, dpr: Math.min(window.devicePixelRatio || 1, MAX_DPR) };
      setBox((prev) => (prev && prev.w === next.w && prev.h === next.h && prev.dpr === next.dpr ? prev : next));
    };
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, RESIZE_DEBOUNCE_MS);
    };
    if (typeof ResizeObserver === 'undefined') {
      const raf = requestAnimationFrame(measure);
      window.addEventListener('resize', later);
      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', later);
        window.clearTimeout(timer);
      };
    }
    let first = true;
    const ro = new ResizeObserver(() => {
      if (first) {
        first = false;
        measure();
      } else {
        later();
      }
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  // ---- fetch + open the document --------------------------------------------------------------
  useEffect(() => {
    if (unsupported) return;
    const ac = new AbortController();
    let cancelled = false;
    let objectUrl: string | null = null;
    let task: PDFDocumentLoadingTask | null = null;
    let own: OwnWorker | null = null;

    const dispose = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      const t = task;
      const o = own;
      task = null;
      own = null;
      const stopWorker = () => {
        o?.pdfWorker.destroy();
        o?.worker.terminate();
      };
      // Destroying the loading task also destroys the PDFDocumentProxy.
      if (t) void t.destroy().then(stopWorker, stopWorker);
      else stopWorker();
    };

    void (async () => {
      try {
        // Follows the same-origin 302 to the short-lived signed Storage URL (CORS-enabled).
        const res = await fetch(src, { credentials: 'same-origin', cache: 'no-store', signal: ac.signal });
        if (!res.ok) throw httpError(res.status);
        const blob = await readBody(res, (progress) => {
          if (!cancelled) setLoad((s) => (s.kind === 'loading' ? { kind: 'loading', progress } : s));
        });
        if (cancelled) return;

        if (isImageType(mime) || isImageType(blob.type)) {
          objectUrl = URL.createObjectURL(blob);
          setLoad({ kind: 'image', url: objectUrl });
          return;
        }

        const pdfjs = await loadPdfJs();
        if (cancelled) return;
        own = await startWorker(pdfjs, ac.signal);
        if (cancelled) return dispose();
        if (!own) await loadMainThreadWorker();
        const data = new Uint8Array(await blob.arrayBuffer());
        if (cancelled) return dispose();
        task = pdfjs.getDocument({ data, isEvalSupported: false, worker: own?.pdfWorker });
        const pdf = await task.promise;
        const proxies = await Promise.all(Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1)));
        if (cancelled) return;
        setLoad({
          kind: 'pdf',
          pages: proxies.map((page) => {
            const vp = page.getViewport({ scale: 1 }); // includes the page's /Rotate
            return { page, w: vp.width, h: vp.height };
          }),
        });
      } catch (err) {
        if (cancelled) return;
        dispose();
        if (process.env.NODE_ENV !== 'production') console.warn('DocViewer: could not open', src, err);
        setLoad({ kind: 'error', ...describeError(err) });
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
      dispose();
    };
  }, [src, mime, unsupported, attempt]);

  // ---- lazy rendering: which pages are near the viewport ---------------------------------------
  useEffect(() => {
    const root = scrollRef.current;
    if (!pages || !hasBox || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        setNear((prev) => {
          let next: Set<number> | null = null;
          for (const entry of entries) {
            const i = Number((entry.target as HTMLElement).dataset.index);
            if (entry.isIntersecting === prev.has(i)) continue;
            next ??= new Set(prev);
            if (entry.isIntersecting) next.add(i);
            else next.delete(i);
          }
          return next ?? prev;
        });
      },
      { root, rootMargin: ROOT_MARGIN },
    );
    for (const el of pageEls.current.slice(0, pages.length)) if (el) io.observe(el);
    return () => io.disconnect();
  }, [pages, hasBox]);

  const registerPage = useCallback((index: number, el: HTMLDivElement | null) => {
    pageEls.current[index] = el;
  }, []);

  // ---- "Page n of N" from the scroll position ---------------------------------------------------
  const trackPage = () => {
    const el = scrollRef.current;
    const els = pageEls.current;
    if (!el || !pages) return;
    let page = 1;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
      page = pages.length;
    } else {
      const probe = el.scrollTop + el.clientHeight * 0.35;
      for (let i = 0; i < pages.length; i++) {
        const p = els[i];
        if (p && p.offsetTop <= probe) page = i + 1;
        else break;
      }
    }
    setCurrent(page);
  };
  const onScroll = () => {
    const f = frame.current;
    if (!f.id) {
      f.id = requestAnimationFrame(() => {
        f.id = 0;
        trackPage();
      });
    }
  };
  useEffect(() => {
    const f = frame.current;
    return () => cancelAnimationFrame(f.id);
  }, []);

  // ---- touch pinch / double-tap, trackpad pinch (ctrl+wheel, Safari gesture events) ------------
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    type Gesture = { vx: number; vy: number; s: number; d0: number; source: 'touch' | 'wheel' | 'safari' };
    let g: Gesture | null = null;
    let wheelTimer = 0;
    let touchStart: { t: number; x: number; y: number } | null = null;
    let lastTap: { t: number; x: number; y: number } | null = null;

    const local = (x: number, y: number) => {
      const r = el.getBoundingClientRect();
      return { vx: x - r.left, vy: y - r.top };
    };
    const begin = (x: number, y: number, source: Gesture['source'], d0 = 1): Gesture | null => {
      const content = contentRef.current;
      if (!content) return null; // nothing zoomable (loading / error)
      const { vx, vy } = local(x, y);
      content.style.transformOrigin = `${el.scrollLeft + vx - content.offsetLeft}px ${el.scrollTop + vy - content.offsetTop}px`;
      return { vx, vy, s: 1, d0, source };
    };
    const preview = (s: number) => {
      const content = contentRef.current;
      if (!g || !content) return;
      const z = zoomRef.current;
      g.s = Math.min(MAX_ZOOM / z, Math.max(MIN_ZOOM / z, s));
      content.style.transform = `scale(${g.s})`;
    };
    const commit = () => {
      if (!g) return;
      const done = g;
      g = null;
      applyZoom(zoomRef.current * done.s, done);
    };
    const span = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        touchStart = null;
        lastTap = null;
        const [a, b] = [e.touches[0], e.touches[1]];
        g = begin((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, 'touch', span(e.touches));
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        touchStart = { t: e.timeStamp, x: t.clientX, y: t.clientY };
      } else {
        touchStart = null;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (g?.source !== 'touch' || e.touches.length !== 2) return;
      e.preventDefault(); // no native page zoom / scroll while pinching
      preview(span(e.touches) / g.d0);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (g?.source === 'touch') {
        if (e.touches.length < 2) commit();
        return;
      }
      const start = touchStart;
      touchStart = null;
      const t = e.changedTouches[0];
      if (!start || !t || e.touches.length > 0 || !contentRef.current) return;
      const isTap = Math.hypot(t.clientX - start.x, t.clientY - start.y) < 10 && e.timeStamp - start.t < 300;
      if (!isTap) {
        lastTap = null;
        return;
      }
      if (lastTap && e.timeStamp - lastTap.t < 320 && Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) < 30) {
        // Double-tap: toggle between fit and 200% around the tapped point.
        lastTap = null;
        e.preventDefault();
        applyZoom(zoomRef.current > 1.05 ? 1 : 2, local(t.clientX, t.clientY));
      } else {
        lastTap = { t: e.timeStamp, x: t.clientX, y: t.clientY };
      }
    };
    const onTouchCancel = () => {
      touchStart = null;
      if (g?.source === 'touch') {
        g = null;
        if (contentRef.current) resetTransform(contentRef.current);
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey || !contentRef.current) return; // plain wheel scrolls; ctrl+wheel = trackpad pinch
      e.preventDefault();
      if (!g) g = begin(e.clientX, e.clientY, 'wheel');
      if (!g || g.source !== 'wheel') return;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * el.clientHeight : e.deltaY;
      preview(g.s * Math.exp(-dy / 250));
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(commit, WHEEL_COMMIT_MS);
    };
    // Safari (macOS trackpad, iOS) — iOS pinches are already handled by the touch listeners.
    type SafariGesture = Event & { scale?: number; clientX?: number; clientY?: number };
    const onGestureStart = (e: SafariGesture) => {
      e.preventDefault();
      if (g || !contentRef.current) return;
      const r = el.getBoundingClientRect();
      g = begin(e.clientX ?? r.left + r.width / 2, e.clientY ?? r.top + r.height / 2, 'safari');
    };
    const onGestureChange = (e: SafariGesture) => {
      e.preventDefault();
      if (g?.source === 'safari' && typeof e.scale === 'number') preview(e.scale);
    };
    const onGestureEnd = (e: SafariGesture) => {
      e.preventDefault();
      if (g?.source === 'safari') commit();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: false });
    el.addEventListener('touchcancel', onTouchCancel);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGestureStart);
    el.addEventListener('gesturechange', onGestureChange);
    el.addEventListener('gestureend', onGestureEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
      el.removeEventListener('gestureend', onGestureEnd);
      window.clearTimeout(wheelTimer);
    };
  }, [applyZoom]);

  // ---- layout ----------------------------------------------------------------------------------
  const narrow = !box || box.w < 640;
  const pad = narrow ? 8 : 20;
  const gap = narrow ? 10 : 16;
  const fitWidth = box ? Math.max(80, Math.min(box.w - pad * 2, MAX_FIT_WIDTH)) : 0;

  let imageSize: { width: number; height: number } | null = null;
  if (load.kind === 'image' && natural && box) {
    const fit = Math.min(1, fitWidth / natural.w); // fit the width, never enlarge past 100%
    imageSize = { width: Math.max(1, Math.round(natural.w * fit * zoom)), height: Math.max(1, Math.round(natural.h * fit * zoom)) };
  }

  const atMinZoom = zoom <= MIN_ZOOM + 0.001;
  const atMaxZoom = zoom >= MAX_ZOOM - 0.001;
  const atFit = Math.abs(zoom - 1) < 0.005;
  const loadedPercent = load.kind === 'loading' && load.progress !== null ? Math.round(load.progress * 100) : 0;

  const retry = () => {
    setLoad({ kind: 'loading', progress: null });
    setNatural(null);
    setAttempt((n) => n + 1);
  };

  const shownError =
    unsupported
      ? { message: 'This type of file can’t be previewed here.', retry: false }
      : load.kind === 'error'
        ? load
        : null;

  return (
    <div
      ref={rootRef}
      className={actions ? 'dv-root dv-has-actions' : 'dv-root'}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
    >
      <header className="dv-bar">
        <h2 className="dv-title" title={title}>
          {title}
        </h2>
        {zoomable && !shownError && (
          <div className="dv-tools">
            {pages && (
              <span className="dv-pageinfo">
                Page <b>{Math.min(current, pages.length)}</b> of {pages.length}
              </span>
            )}
            {/* aria-disabled, not disabled: a button that disables itself while focused drops focus to <body>. */}
            <div className="dv-zoom" role="group" aria-label="Zoom">
              <button
                type="button"
                className="dv-btn dv-icon"
                onClick={() => {
                  if (!atMinZoom) applyZoom(stepZoom(zoomRef.current, -1));
                }}
                aria-disabled={atMinZoom || undefined}
                aria-label="Zoom out"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12h14" />
                </svg>
              </button>
              <output className="dv-zoomval" aria-live="polite">
                {Math.round(zoom * 100)}%
              </output>
              <button
                type="button"
                className="dv-btn dv-icon"
                onClick={() => {
                  if (!atMaxZoom) applyZoom(stepZoom(zoomRef.current, 1));
                }}
                aria-disabled={atMaxZoom || undefined}
                aria-label="Zoom in"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12h14M12 5v14" />
                </svg>
              </button>
              <button
                type="button"
                className="dv-btn dv-fit"
                onClick={() => {
                  if (!atFit) applyZoom(1);
                }}
                aria-disabled={atFit || undefined}
                aria-label="Fit to width"
              >
                Fit
              </button>
            </div>
          </div>
        )}
        {downloadHref && (
          <a className="dv-btn dv-download" href={downloadHref} download>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
            </svg>
            <span className="dv-btn-text">Download</span>
          </a>
        )}
        <button ref={closeRef} type="button" className="dv-btn dv-icon dv-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div
        ref={scrollRef}
        className="dv-scroll"
        onScroll={pages ? onScroll : undefined}
        tabIndex={zoomable && !shownError ? 0 : undefined}
        aria-label={zoomable && !shownError ? 'Document' : undefined}
        role={zoomable && !shownError ? 'region' : undefined}
      >
        {shownError ? (
          <div className="dv-center dv-error" role="alert">
            <p>{shownError.message}</p>
            <div className="dv-center-actions">
              <a className="dv-cta" href={src} target="_blank" rel="noopener noreferrer">
                Open in a new tab
              </a>
              {shownError.retry && (
                <button type="button" className="dv-ghost" onClick={retry}>
                  Try again
                </button>
              )}
            </div>
          </div>
        ) : load.kind === 'loading' ? (
          <div className="dv-center">
            <span className="dv-spinner" aria-hidden="true" />
            <p>
              {/* Only the fixed text is live: a ticking percentage would be read out ~100 times. */}
              <span role="status">Loading…</span>
              {loadedPercent > 0 && <span aria-hidden="true">{` ${loadedPercent}%`}</span>}
            </p>
          </div>
        ) : load.kind === 'image' ? (
          <div ref={contentRef} className="dv-content dv-content--image" style={{ padding: pad }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL; next/image can't optimise it */}
            <img
              className={imageSize ? 'dv-img' : 'dv-img dv-img--sizing'}
              src={load.url}
              alt={title}
              draggable={false}
              style={imageSize ?? undefined}
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth || 1, h: e.currentTarget.naturalHeight || 1 })}
              onError={() => setLoad({ kind: 'error', message: 'This image can’t be displayed on this device.', retry: false })}
            />
          </div>
        ) : pages && box ? (
          <div ref={contentRef} className="dv-content" style={{ padding: pad, gap }}>
            {pages.map((info, i) => {
              const width = Math.max(1, Math.floor(fitWidth * zoom));
              const height = Math.max(1, Math.round((width * info.h) / info.w));
              return (
                <PdfPage
                  key={i}
                  info={info}
                  index={i}
                  width={width}
                  height={height}
                  dpr={box.dpr}
                  active={near.has(i)}
                  register={registerPage}
                />
              );
            })}
          </div>
        ) : null}
      </div>

      {actions && <div className="dv-actions">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// one PDF page

function PdfPage({
  info,
  index,
  width,
  height,
  dpr,
  active,
  register,
}: {
  info: PageInfo;
  index: number;
  width: number;
  height: number;
  dpr: number;
  active: boolean;
  register: (index: number, el: HTMLDivElement | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const drawn = useRef('');
  const setRef = useCallback((el: HTMLDivElement | null) => register(index, el), [register, index]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!active) {
      releaseHost(host);
      drawn.current = '';
      // Also drop pdf.js's per-page data (operator list + decoded images: megabytes for a scan) —
      // otherwise it's all held until the viewer closes. Any render was cancelled by the previous
      // run's cleanup; if pdf.js still has work in flight it defers this until that settles. The
      // page is simply re-parsed if it scrolls back into view.
      info.page.cleanup();
      return;
    }
    const outputScale = Math.min(dpr, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
    const viewport = info.page.getViewport({ scale: (width / info.w) * outputScale });
    const pxW = Math.max(1, Math.floor(viewport.width));
    const pxH = Math.max(1, Math.floor(viewport.height));
    const key = `${pxW}x${pxH}`;
    if (drawn.current === key) return;

    // Draw off-screen and swap when finished, so a re-render (zoom/resize) never flashes blank —
    // the previous canvas just stretches until the sharp one is ready.
    const canvas = document.createElement('canvas');
    canvas.width = pxW;
    canvas.height = pxH;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    let live = true;
    let task: RenderTask | null = info.page.render({ canvasContext: ctx, viewport });
    task.promise.then(
      () => {
        task = null;
        if (!live) return releaseCanvas(canvas);
        releaseHost(host);
        host.appendChild(canvas);
        drawn.current = key;
      },
      (err: unknown) => {
        task = null;
        releaseCanvas(canvas);
        if (!isRenderCancel(err) && process.env.NODE_ENV !== 'production') console.warn('DocViewer: page render failed', err);
      },
    );
    return () => {
      live = false;
      task?.cancel();
    };
  }, [active, width, height, dpr, info]);

  // Free the canvas memory as soon as the page goes away (iOS is strict about this).
  useEffect(() => {
    const host = hostRef.current;
    return () => {
      if (host) releaseHost(host);
    };
  }, []);

  return (
    <div
      ref={setRef}
      className="dv-page"
      data-index={index}
      data-page={index + 1}
      style={{ width, height }}
      role="img"
      aria-label={`Page ${index + 1}`}
    >
      <div ref={hostRef} className="dv-page-canvas" />
    </div>
  );
}
