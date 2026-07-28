'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { normalizeAnalyticsPath, isTrackableAnalyticsPath } from '@/lib/analytics-paths';
import type { HeatmapPathStat, HeatmapPoint, HeatmapRange } from '@/lib/heatmap';

type HeatmapLib = {
  create: (config: {
    container: HTMLElement;
    radius?: number;
    maxOpacity?: number;
    minOpacity?: number;
    blur?: number;
    gradient?: Record<string, string>;
  }) => {
    setData: (data: {
      max: number;
      min?: number;
      data: Array<{ x: number; y: number; value: number }>;
    }) => void;
    repaint: () => void;
  };
};

function loadHeatmapLib(): Promise<HeatmapLib> {
  return import('heatmap.js').then((mod) => {
    const m = mod as unknown as HeatmapLib & { default?: HeatmapLib; create?: HeatmapLib['create'] };
    if (typeof m.create === 'function') return m;
    if (m.default && typeof m.default.create === 'function') return m.default;
    throw new Error('heatmap.js create() not found');
  });
}

function measureContentHeight(doc: Document): number {
  const win = doc.defaultView;
  if (!win || !doc.body) return 800;
  let bottom = 0;
  for (const el of Array.from(doc.body.children)) {
    if ((el as HTMLElement).id === 'hm-overlay-root') continue;
    const style = win.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (style.position === 'fixed' || style.position === 'sticky') continue;
    const r = (el as HTMLElement).getBoundingClientRect();
    bottom = Math.max(bottom, r.bottom + win.scrollY);
  }
  return Math.max(Math.ceil(bottom), 480);
}

function ensurePreviewChrome(doc: Document) {
  // Do NOT mutate <html className> — that races Next.js hydration and throws.
  // Scope overrides with an injected stylesheet only (preview iframe only).
  doc.documentElement.classList.remove('hm-preview');
  let style = doc.getElementById('hm-preview-style') as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = 'hm-preview-style';
    doc.head.appendChild(style);
  }
  style.textContent = `
    html, body {
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      overflow: visible !important;
      background: #fff !important;
    }
    body { position: relative !important; margin: 0 !important; }
    [class*="mobile-cta"],
    [class*="MobileCta"],
    .feedback-fab,
    #feedback,
    [data-heatmap-hide] {
      display: none !important;
    }
    #hm-overlay-root {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      pointer-events: none !important;
      z-index: 2147483000 !important;
      overflow: hidden !important;
    }
    #hm-overlay-root canvas {
      width: 100% !important;
      height: 100% !important;
    }
  `;
}

function shortLabel(p: HeatmapPathStat) {
  const name = (p.label || '').trim();
  if (name && name !== p.path) return name;
  return p.path === '/' ? 'Home' : p.path;
}

const DOCK_POS_KEY = 'hm-dock-pos';

type DockPos = { x: number; y: number };

function readDockPos(): DockPos | null {
  try {
    const raw = sessionStorage.getItem(DOCK_POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as DockPos;
    if (typeof p.x === 'number' && typeof p.y === 'number') return p;
  } catch {
    /* ignore */
  }
  return null;
}

function clampDock(
  x: number,
  y: number,
  el: HTMLElement,
  root: HTMLElement
): DockPos {
  const pad = 8;
  const maxX = Math.max(pad, root.clientWidth - el.offsetWidth - pad);
  const maxY = Math.max(pad, root.clientHeight - el.offsetHeight - pad);
  return {
    x: Math.min(maxX, Math.max(pad, x)),
    y: Math.min(maxY, Math.max(pad, y)),
  };
}

export function HeatmapViewer() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialPath = normalizeAnalyticsPath(searchParams.get('path') || '/');
  const initialRange = (searchParams.get('range') as HeatmapRange) || '7d';

  const [range, setRange] = useState<HeatmapRange>(
    initialRange === '24h' || initialRange === '30d' || initialRange === '7d' ? initialRange : '7d'
  );
  const [path, setPath] = useState(isTrackableAnalyticsPath(initialPath) ? initialPath : '/');
  const [filter, setFilter] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [paths, setPaths] = useState<HeatmapPathStat[]>([]);
  const [points, setPoints] = useState<HeatmapPoint[]>([]);
  /** Which path the current `points`/`total` belong to — never paint mismatched data. */
  const [pointsPath, setPointsPath] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [iframeH, setIframeH] = useState(800);
  const [dockPos, setDockPos] = useState<DockPos | null>(null);
  const [dockDragging, setDockDragging] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const libRef = useRef<HeatmapLib | null>(null);
  const paintGen = useRef(0);
  const pathRef = useRef(path);
  pathRef.current = path;
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  useEffect(() => {
    setDockPos(readDockPos());
  }, []);

  // Keep React path in sync with ?path= (back/forward, shared links)
  useEffect(() => {
    const fromUrl = normalizeAnalyticsPath(searchParams.get('path') || '/');
    if (isTrackableAnalyticsPath(fromUrl) && fromUrl !== pathRef.current) {
      setPath(fromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    const onResize = () => {
      const root = rootRef.current;
      const dock = dockRef.current;
      if (!root || !dock || !dockPos) return;
      const next = clampDock(dockPos.x, dockPos.y, dock, root);
      if (next.x !== dockPos.x || next.y !== dockPos.y) {
        setDockPos(next);
        try {
          sessionStorage.setItem(DOCK_POS_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [dockPos]);

  const onDockPointerDown = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const root = rootRef.current;
    const dock = dockRef.current;
    if (!root || !dock) return;
    e.preventDefault();
    const rect = dock.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const start: DockPos = {
      x: rect.left - rootRect.left,
      y: rect.top - rootRect.top,
    };
    setDockPos(start);
    setDockDragging(true);
    dragRef.current = {
      pointerId: e.pointerId,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onDockPointerMove = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const root = rootRef.current;
    const dock = dockRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !root || !dock) return;
    const rootRect = root.getBoundingClientRect();
    const next = clampDock(
      e.clientX - rootRect.left - drag.offsetX,
      e.clientY - rootRect.top - drag.offsetY,
      dock,
      root
    );
    setDockPos(next);
  }, []);

  const endDockDrag = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDockDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setDockPos((prev) => {
      if (!prev) return prev;
      try {
        sessionStorage.setItem(DOCK_POS_KEY, JSON.stringify(prev));
      } catch {
        /* ignore */
      }
      return prev;
    });
  }, []);

  const syncAdminUrl = useCallback(
    (nextPath: string, nextRange: HeatmapRange) => {
      const qs = new URLSearchParams();
      qs.set('path', nextPath);
      qs.set('range', nextRange);
      const href = `${pathname}?${qs.toString()}`;
      router.replace(href, { scroll: false });
    },
    [pathname, router]
  );

  const selectPath = useCallback(
    (next: string) => {
      const p = normalizeAnalyticsPath(next);
      if (!isTrackableAnalyticsPath(p)) {
        setError('That URL is not a public page');
        return;
      }
      if (p === pathRef.current) return;
      setError('');
      // Drop previous page's heat immediately so it can't paint onto the new iframe
      setPoints([]);
      setTotal(0);
      setPointsPath('');
      setPath(p);
      syncAdminUrl(p, range);
    },
    [range, syncAdminUrl]
  );

  const loadPaths = useCallback(async (r: HeatmapRange) => {
    try {
      const res = await fetch(`/api/analytics/heatmap?paths=1&range=${r}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load pages');
      setPaths((data.paths || []) as HeatmapPathStat[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pages');
    }
  }, []);

  const loadPoints = useCallback(async (p: string, r: HeatmapRange) => {
    const want = normalizeAnalyticsPath(p);
    setLoading(true);
    setError('');
    setPoints([]);
    setTotal(0);
    setPointsPath('');
    try {
      const res = await fetch(
        `/api/analytics/heatmap?path=${encodeURIComponent(want)}&range=${r}`,
        { credentials: 'same-origin', cache: 'no-store' }
      );
      const data = await res.json().catch(() => ({}));
      // Stale response after the user already switched pages
      if (pathRef.current !== want) return;
      if (!res.ok) throw new Error(data.error || 'Could not load clicks');
      const returnedPath = normalizeAnalyticsPath(String(data.path || want));
      if (returnedPath !== want) {
        setPoints([]);
        setTotal(0);
        setPointsPath('');
        setError('Heatmap path mismatch — try refresh');
        return;
      }
      setPoints((data.points || []) as HeatmapPoint[]);
      setTotal(Number(data.total) || 0);
      setPointsPath(want);
    } catch (e) {
      if (pathRef.current !== want) return;
      setError(e instanceof Error ? e.message : 'Failed to load clicks');
      setPoints([]);
      setTotal(0);
      setPointsPath('');
    } finally {
      if (pathRef.current === want) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPaths(range);
  }, [range, loadPaths]);

  useEffect(() => {
    if (!path) return;
    void loadPoints(path, range);
  }, [path, range, loadPoints]);

  const filteredPaths = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q
      ? paths.filter(
          (p) =>
            p.path.toLowerCase().includes(q) ||
            (p.label || '').toLowerCase().includes(q)
        )
      : paths;
    return [...list].sort((a, b) => b.clicks - a.clicks || a.path.localeCompare(b.path));
  }, [paths, filter]);

  const currentMeta = paths.find((p) => p.path === path);
  /** Only use click points that belong to the page currently in the iframe. */
  const paintPoints = pointsPath === path ? points : [];
  const paintTotal = pointsPath === path ? total : 0;

  const paintInIframe = useCallback(async () => {
    const gen = ++paintGen.current;
    const expectPath = pathRef.current;
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!iframe || !doc?.body) return;
    if (doc.readyState !== 'complete' && doc.readyState !== 'interactive') return;

    // Never paint onto an iframe that isn't the selected page yet
    try {
      const iframePath = normalizeAnalyticsPath(iframe.contentWindow?.location?.pathname || '');
      if (iframePath && iframePath !== expectPath) return;
    } catch {
      /* cross-origin / about:blank during swap — skip this attempt */
      return;
    }

    ensurePreviewChrome(doc);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (gen !== paintGen.current || pathRef.current !== expectPath) return;

    const contentH = measureContentHeight(doc);
    iframe.style.height = `${contentH}px`;
    setIframeH(contentH);

    if (!libRef.current) libRef.current = await loadHeatmapLib();
    if (gen !== paintGen.current || pathRef.current !== expectPath) return;

    let root = doc.getElementById('hm-overlay-root') as HTMLDivElement | null;
    if (!root) {
      root = doc.createElement('div');
      root.id = 'hm-overlay-root';
      doc.body.appendChild(root);
    }
    root.style.cssText = `position:absolute;left:0;top:0;width:100%;height:${contentH}px;pointer-events:none;z-index:2147483000;overflow:hidden;`;
    root.innerHTML = '';
    root.dataset.hmPath = expectPath;

    // heatmap.js crashes (getImageData width 0) if the container has no layout yet
    let w = 0;
    for (let i = 0; i < 24; i++) {
      w = Math.max(
        root.clientWidth,
        root.offsetWidth,
        doc.documentElement.clientWidth,
        doc.body.clientWidth,
        iframe.clientWidth,
        0
      );
      if (w > 1) break;
      await new Promise((r) => setTimeout(r, 40));
      if (gen !== paintGen.current || pathRef.current !== expectPath) return;
    }
    const h = Math.max(contentH, root.clientHeight, 1);
    if (w <= 1) return;

    root.style.width = `${w}px`;
    root.style.height = `${h}px`;

    // Points for a different page must never draw here
    const pts = pathRef.current === expectPath ? paintPoints : [];

    let instance: ReturnType<HeatmapLib['create']>;
    try {
      instance = libRef.current.create({
        container: root,
        radius: 46,
        maxOpacity: 0.88,
        minOpacity: 0.12,
        blur: 0.75,
        gradient: {
          '.25': 'rgb(0, 180, 255)',
          '.45': 'rgb(0, 220, 120)',
          '.65': 'rgb(255, 220, 0)',
          '.8': 'rgb(255, 120, 0)',
          '.95': 'rgb(220, 0, 40)',
        },
      });
    } catch {
      return;
    }

    const data = pts.map((pt) => ({
      x: Math.min(w - 1, Math.max(0, Math.round((pt.x / 100) * w))),
      y: Math.min(h - 1, Math.max(0, Math.round((pt.y / 100) * h))),
      value: pt.value * pt.value,
    }));
    const paintMax = Math.max(1, ...data.map((d) => d.value), 1);

    try {
      instance.setData({ max: paintMax, min: 0, data });
    } catch {
      // Ignore zero-size canvas races; later retries will paint
    }
  }, [paintPoints, path]);

  const onIframeLoad = useCallback(() => {
    window.setTimeout(() => void paintInIframe(), 400);
    window.setTimeout(() => void paintInIframe(), 1000);
    window.setTimeout(() => void paintInIframe(), 1800);
  }, [paintInIframe]);

  useEffect(() => {
    void paintInIframe();
  }, [paintInIframe]);

  useEffect(() => {
    const onResize = () => void paintInIframe();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [paintInIframe]);

  const previewSrc = `${path}${path.includes('?') ? '&' : '?'}heatmap_preview=1`;
  const hasData = paintTotal > 0;
  const pathTitle = currentMeta ? shortLabel(currentMeta) : path;

  const dockStyle =
    dockPos != null
      ? ({
          left: dockPos.x,
          top: dockPos.y,
          right: 'auto',
          transform: 'none',
        } as const)
      : undefined;

  return (
    <div className="hm" ref={rootRef}>
      <aside
        ref={dockRef}
        className={`hm__dock${dockDragging ? ' is-dragging' : ''}${dockPos ? ' is-moved' : ''}`}
        style={dockStyle}
        aria-label="Heatmap controls"
      >
        <button
          type="button"
          className="hm__drag"
          aria-label="Drag controls"
          title="Drag to move"
          onPointerDown={onDockPointerDown}
          onPointerMove={onDockPointerMove}
          onPointerUp={endDockDrag}
          onPointerCancel={endDockDrag}
        >
          <span className="hm__drag-dots" aria-hidden />
        </button>
        <div className="hm__card">
          <div className="hm__card-head">
            <span className="hm__chip-label">Clicks</span>
            <div className="hm__mini hm__mini--inline">
              <button
                type="button"
                className="hm__mini-btn"
                title="Refresh heatmap"
                onClick={() => {
                  void loadPaths(range);
                  void loadPoints(path, range);
                  void paintInIframe();
                }}
              >
                ↻
              </button>
              <a
                className="hm__mini-btn"
                href={path}
                target="_blank"
                rel="noopener noreferrer"
                title="Open live page"
              >
                ↗
              </a>
            </div>
          </div>
          <div className="hm__chip-row">
            <select
              className="hm__chip-select hm__chip-select--range"
              value={range}
              onChange={(e) => {
                const r = e.target.value as HeatmapRange;
                setRange(r);
                syncAdminUrl(path, r);
              }}
              aria-label="Click range"
            >
              <option value="24h">24 hours</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
            </select>
            <span
              className={`hm__count${hasData ? '' : ' is-muted'}`}
              title={`${paintTotal} clicks on ${pathTitle}`}
            >
              {loading ? '…' : paintTotal.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="hm__card hm__card--search">
          <span className="hm__chip-label">Search</span>
          <div className="hm__current" title={path}>
            <b>{pathTitle}</b>
            <span>{path}</span>
          </div>
          <div className="hm__search">
            <input
              className="hm__chip-input"
              type="search"
              placeholder="Find a page…"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => {
                window.setTimeout(() => setSearchOpen(false), 150);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const typed = filter.trim();
                  if (typed.startsWith('/')) {
                    selectPath(typed);
                    setFilter('');
                    setSearchOpen(false);
                    return;
                  }
                  const first = filteredPaths[0];
                  if (first) {
                    selectPath(first.path);
                    setFilter('');
                    setSearchOpen(false);
                  }
                }
                if (e.key === 'Escape') setSearchOpen(false);
              }}
              aria-label="Search pages"
              aria-expanded={searchOpen}
              aria-controls="hm-page-results"
            />
            {searchOpen ? (
              <ul className="hm__results" id="hm-page-results" role="listbox">
                {filteredPaths.length === 0 ? (
                  <li className="hm__results-empty">No pages match</li>
                ) : (
                  filteredPaths.slice(0, 8).map((p) => (
                    <li key={p.path}>
                      <button
                        type="button"
                        className={`hm__result${p.path === path ? ' is-on' : ''}`}
                        role="option"
                        aria-selected={p.path === path}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          selectPath(p.path);
                          setFilter('');
                          setSearchOpen(false);
                        }}
                      >
                        <span className="hm__result-main">
                          <span className="hm__result-name">{shortLabel(p)}</span>
                          <em>{p.clicks.toLocaleString()}</em>
                        </span>
                        <span className="hm__result-path">{p.path}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>
        </div>
      </aside>

      {error ? <div className="hm__toast">{error}</div> : null}

      <div className="hm__stage">
        {!hasData && !loading ? (
          <div className="hm__empty">
            <strong>No clicks on {path} yet</strong>
            <span>Open this URL, click around, then hit ↻</span>
          </div>
        ) : null}
        <iframe
          key={path}
          ref={iframeRef}
          className="hm__frame"
          src={previewSrc}
          title={`Heatmap preview · ${path}`}
          onLoad={onIframeLoad}
          scrolling="no"
          style={{ height: iframeH }}
        />
      </div>
    </div>
  );
}
