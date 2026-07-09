'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Script from 'next/script';

/* ------------------------------------------------------------------ */
/*  Model constants (MCS-aware)                                       */
/* ------------------------------------------------------------------ */
const M = {
  panelW: 1.134,
  panelH: 1.722,
  gap: 0.02,
  setback: 0.4,
  panelKwp: 0.44,
  yield: 950,
  imp: 0.28,
  exp: 0.15,
  co2: 0.207,
  costPerKwp: 1350,
  battCost: 4000,
  selfNo: 0.35,
  selfBatt: 0.72,
};

const gbp = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat('en-GB');

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */
interface Pt { x: number; y: number }
interface PanelRect { cx: number; cy: number; pw: number; ph: number }
interface EnergyResult {
  kwp: number;
  gen: number;
  saving: number;
  cost: number;
  payback: number;
  co2: number;
}
interface EnergyOpts {
  dir: number;
  shade: number;
  battery: boolean;
  consumption: number;
}

/* ------------------------------------------------------------------ */
/*  Planar geometry helpers (metres)                                  */
/* ------------------------------------------------------------------ */
function projFns(lat0: number, lng0: number) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  return {
    to: (ll: { lat: number; lng: number }): Pt => ({
      x: (ll.lng - lng0) * kx,
      y: (ll.lat - lat0) * ky,
    }),
    from: (p: Pt) => ({
      lat: lat0 + p.y / ky,
      lng: lng0 + p.x / kx,
    }),
  };
}

function rot(p: Pt, a: number): Pt {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

function pointInPoly(pt: Pt, poly: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if (
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi || 1e-9) + xi
    )
      c = !c;
  }
  return c;
}

function distSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distToEdge(p: Pt, poly: Pt[]): number {
  let m = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
    m = Math.min(m, distSeg(p, poly[j], poly[i]));
  return m;
}

function polyArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
    a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  return Math.abs(a / 2);
}

function fits(cx: number, cy: number, w: number, h: number, poly: Pt[]): boolean {
  const cs: Pt[] = [
    { x: cx - w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy + h / 2 },
    { x: cx - w / 2, y: cy + h / 2 },
  ];
  for (const pt of cs) {
    if (!pointInPoly(pt, poly)) return false;
    if (distToEdge(pt, poly) < M.setback) return false;
  }
  return true;
}

function packAxis(poly: Pt[], pw: number, ph: number): PanelRect[] {
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  poly.forEach((p) => {
    minx = Math.min(minx, p.x);
    miny = Math.min(miny, p.y);
    maxx = Math.max(maxx, p.x);
    maxy = Math.max(maxy, p.y);
  });
  const sx = pw + M.gap;
  const sy = ph + M.gap;
  const offs = [0, 0.34, 0.67];
  let best: PanelRect[] = [];
  for (const ox of offs)
    for (const oy of offs) {
      const out: PanelRect[] = [];
      for (let cx = minx + M.setback + pw / 2 - ox * sx; cx <= maxx - M.setback - pw / 2 + sx; cx += sx)
        for (let cy = miny + M.setback + ph / 2 - oy * sy; cy <= maxy - M.setback - ph / 2 + sy; cy += sy)
          if (fits(cx, cy, pw, ph, poly)) out.push({ cx, cy, pw, ph });
      if (out.length > best.length) best = out;
    }
  return best;
}

function packRoof(poly: Pt[]): Pt[][] {
  const angs: number[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
    angs.push(Math.atan2(poly[i].y - poly[j].y, poly[i].x - poly[j].x));
  let best: Pt[][] = [];
  for (const a of angs) {
    const rp = poly.map((p) => rot(p, -a));
    for (const [pw, ph] of [
      [M.panelW, M.panelH],
      [M.panelH, M.panelW],
    ]) {
      const packed = packAxis(rp, pw, ph);
      if (packed.length > best.length) {
        best = packed.map((pn) =>
          [
            { x: pn.cx - pn.pw / 2, y: pn.cy - pn.ph / 2 },
            { x: pn.cx + pn.pw / 2, y: pn.cy - pn.ph / 2 },
            { x: pn.cx + pn.pw / 2, y: pn.cy + pn.ph / 2 },
            { x: pn.cx - pn.pw / 2, y: pn.cy + pn.ph / 2 },
          ].map((c) => rot(c, a))
        );
      }
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/*  Energy model                                                      */
/* ------------------------------------------------------------------ */
function energy(n: number, o: EnergyOpts): EnergyResult {
  const eff = M.yield * o.dir * o.shade;
  const kwp = +(n * M.panelKwp).toFixed(2);
  const gen = kwp * eff;
  const selfPct = o.battery ? M.selfBatt : M.selfNo;
  const cons = o.consumption || 3500;
  const selfUsed = Math.min(gen * selfPct, cons);
  const exported = Math.max(gen - selfUsed, 0);
  const saving = selfUsed * M.imp + exported * M.exp;
  const cost = kwp * M.costPerKwp + (o.battery ? M.battCost : 0);
  return {
    kwp,
    gen,
    saving,
    cost,
    payback: saving > 0 ? cost / saving : 0,
    co2: (gen * M.co2) / 1000,
  };
}

/* ------------------------------------------------------------------ */
/*  Animated number helper                                            */
/* ------------------------------------------------------------------ */
function animValue(
  el: HTMLElement | null,
  to: number,
  fmt: (v: number) => string,
  reduceMotion: boolean
) {
  if (!el) return;
  if (reduceMotion) {
    el.innerHTML = fmt(to);
    return;
  }
  const from = (el as any).__animVal || 0;
  (el as any).__animVal = to;
  const t0 = performance.now();
  const d = 500;
  (function step(t: number) {
    const k = Math.min(1, (t - t0) / d);
    const ease = 1 - Math.pow(1 - k, 3);
    el.innerHTML = fmt(from + (to - from) * ease);
    if (k < 1) requestAnimationFrame(step);
  })(performance.now());
}

/* ------------------------------------------------------------------ */
/*  Spark SVG used in eyebrow + map hint                              */
/* ------------------------------------------------------------------ */
function SparkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" className={className}>
      <g transform="rotate(0 12 12)">
        <path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z" />
      </g>
      <g transform="rotate(90 12 12)">
        <path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z" />
      </g>
      <g transform="rotate(180 12 12)">
        <path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z" />
      </g>
      <g transform="rotate(270 12 12)">
        <path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z" />
      </g>
    </svg>
  );
}

/* ================================================================== */
/*  Component                                                         */
/* ================================================================== */
export function RoofDesignerApp() {
  /* refs ----------------------------------------------------------- */
  const mapRef = useRef<any>(null);
  const drawnLayerRef = useRef<any>(null);
  const drawerRef = useRef<any>(null);
  const reduceMotion = useRef(false);

  const rSaveRef = useRef<HTMLDivElement>(null);
  const rSysRef = useRef<HTMLDivElement>(null);
  const rAreaRef = useRef<HTMLDivElement>(null);
  const rPayRef = useRef<HTMLDivElement>(null);
  const rGenRef = useRef<HTMLDivElement>(null);
  const rCo2Ref = useRef<HTMLDivElement>(null);

  /* state ---------------------------------------------------------- */
  const [leafletReady, setLeafletReady] = useState(false);
  const [drawReady, setDrawReady] = useState(false);
  const [step2Dim, setStep2Dim] = useState(true);
  const [step3Dim, setStep3Dim] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [hintText, setHintText] = useState('Enter your postcode to locate your roof.');
  const [hintVisible, setHintVisible] = useState(false);
  const [pcMsg, setPcMsg] = useState<{ text: string; type: '' | 'err' | 'ok' }>({ text: '', type: '' });

  const [dir, setDir] = useState(1.0);
  const [shade, setShade] = useState(1.0);
  const [battery, setBattery] = useState(true);
  const [bill, setBill] = useState('');

  const panelsRef = useRef(0);
  const areaRef = useRef(0);

  /* ---- inject Leaflet CSS via DOM -------------------------------- */
  useEffect(() => {
    reduceMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const cssUrls = [
      'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
      'https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css',
    ];
    cssUrls.forEach((href) => {
      if (!document.querySelector(`link[href="${href}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
      }
    });
  }, []);

  /* ---- init map once both libs loaded ----------------------------- */
  useEffect(() => {
    if (!leafletReady || !drawReady) return;

    const L = (window as any).L;
    if (!L) {
      setHintText("Map couldn't load — use \"Enter your roof size\" on the left to get an estimate.");
      setHintVisible(true);
      setShowFallback(true);
      return;
    }

    const mapEl = document.getElementById('rd-map');
    if (!mapEl || mapRef.current) return;

    const map = L.map('rd-map', { zoomControl: true }).setView([51.62, -3.35], 9);
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 21, maxNativeZoom: 19, attribution: 'Imagery © Esri' }
    ).addTo(map);

    mapRef.current = map;
    setHintText('Enter your postcode to locate your roof.');
    setHintVisible(true);

    const drawnLayer = new L.FeatureGroup().addTo(map);
    drawnLayerRef.current = drawnLayer;

    map.on(L.Draw.Event.CREATED, (e: any) => {
      drawnLayer.clearLayers();
      const latlngs = e.layer.getLatLngs()[0];
      const area = L.GeometryUtil.geodesicArea(latlngs);
      const o = latlngs[0];
      const pj = projFns(o.lat, o.lng);
      const poly: Pt[] = latlngs.map((ll: any) => pj.to(ll));
      const panels = packRoof(poly);

      drawnLayer.addLayer(
        L.polygon(latlngs, { color: '#F8BC1E', weight: 2, fill: false, dashArray: '5 5' })
      );
      panels.forEach((cs) => {
        const ll = cs.map((c) => {
          const g = pj.from(c);
          return [g.lat, g.lng];
        });
        drawnLayer.addLayer(
          L.polygon(ll, { color: '#0b1220', weight: 1, fillColor: '#16233d', fillOpacity: 0.9 })
        );
      });

      setHintText(
        panels.length + ' panels placed with a 400mm edge setback — see your design on the left.'
      );
      renderResults(panels.length, area);
    });
  }, [leafletReady, drawReady]);

  /* ---- render results -------------------------------------------- */
  const renderResults = useCallback(
    (n: number, area: number) => {
      panelsRef.current = n;
      areaRef.current = area;

      const consumption = bill ? (parseFloat(bill) * 12) / M.imp : 3500;
      const r = energy(n, { dir, shade, battery, consumption });

      setStep3Dim(false);
      setShowResults(true);

      const rm = reduceMotion.current;
      animValue(rSaveRef.current, r.saving, (v) => gbp.format(v), rm);
      if (rSysRef.current)
        rSysRef.current.textContent = `${n} panels · ${r.kwp} kWp` + (battery ? ' + battery' : '');
      animValue(rAreaRef.current, area, (v) => num.format(Math.round(v)) + ' <small>m²</small>', rm);
      animValue(rPayRef.current, r.payback, (v) => v.toFixed(1) + ' <small>yrs</small>', rm);
      animValue(rGenRef.current, r.gen, (v) => num.format(Math.round(v)) + ' <small>kWh</small>', rm);
      animValue(rCo2Ref.current, r.co2, (v) => v.toFixed(1) + ' <small>t</small>', rm);
    },
    [dir, shade, battery, bill]
  );

  /* re-render when refine controls change */
  useEffect(() => {
    if (panelsRef.current > 0) renderResults(panelsRef.current, areaRef.current);
  }, [dir, shade, battery, bill, renderResults]);

  /* ---- geocode --------------------------------------------------- */
  const geocode = useCallback(() => {
    const pcEl = document.getElementById('rd-pc') as HTMLInputElement | null;
    const pc = pcEl?.value.trim() ?? '';
    if (!pc) {
      setPcMsg({ text: 'Please enter a postcode.', type: 'err' });
      return;
    }
    if (!mapRef.current) {
      setPcMsg({ text: 'Map unavailable — use "Enter your roof size".', type: 'err' });
      setShowFallback(true);
      return;
    }
    setPcMsg({ text: 'Finding…', type: '' });
    fetch('https://api.postcodes.io/postcodes/' + encodeURIComponent(pc))
      .then((r) => r.json())
      .then((d: any) => {
        if (d.status === 200 && d.result) {
          mapRef.current.setView([d.result.latitude, d.result.longitude], 20);
          setPcMsg({ text: 'Found — now draw around your roof.', type: 'ok' });
          setStep2Dim(false);
          setHintText('Tap "Start drawing", then tap each corner of your roof.');
          setHintVisible(true);
        } else {
          setPcMsg({ text: 'Postcode not found — check and try again.', type: 'err' });
        }
      })
      .catch(() => {
        setPcMsg({ text: 'Lookup failed — try again, or enter your roof size.', type: 'err' });
        setShowFallback(true);
      });
  }, []);

  /* ---- drawing --------------------------------------------------- */
  const startDraw = useCallback(() => {
    const L = (window as any).L;
    if (!L || !L.Draw || !L.GeometryUtil) {
      setShowFallback(true);
      return;
    }
    drawnLayerRef.current?.clearLayers();
    drawerRef.current = new L.Draw.Polygon(mapRef.current, {
      shapeOptions: { color: '#F8BC1E', weight: 3, fillOpacity: 0.15 },
    });
    drawerRef.current.enable();
    setHintText('Tap each roof corner, then tap the first point to finish.');
    setHintVisible(true);
  }, []);

  /* ---- manual fallback ------------------------------------------- */
  const manualCalc = useCallback(() => {
    const wEl = document.getElementById('rd-mw') as HTMLInputElement | null;
    const lEl = document.getElementById('rd-ml') as HTMLInputElement | null;
    const w = parseFloat(wEl?.value ?? '');
    const l = parseFloat(lEl?.value ?? '');
    if (w > 0 && l > 0) {
      const poly: Pt[] = [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: l },
        { x: 0, y: l },
      ];
      const panels = packRoof(poly);
      renderResults(panels.length, w * l);
    }
  }, [renderResults]);

  /* ---- segment control helper ------------------------------------ */
  const segBtn = (
    values: { label: string; value: number }[],
    current: number,
    onChange: (v: number) => void
  ) => (
    <div className="rd-seg">
      {values.map((v) => (
        <button
          key={v.value}
          className={current === v.value ? 'on' : ''}
          onClick={() => onChange(v.value)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );

  /* ================================================================ */
  /*  JSX                                                             */
  /* ================================================================ */
  return (
    <>
      {/* Leaflet scripts */}
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"
        strategy="afterInteractive"
        onLoad={() => setLeafletReady(true)}
      />
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.min.js"
        strategy="afterInteractive"
        onLoad={() => setDrawReady(true)}
      />

      {/* Hero */}
      <section className="rd-hero">
        <div className="wrap">
          <span className="eyebrow">
            <SparkIcon />
            South Wales · Free instant design
          </span>
          <h1>
            Draw your roof, see your <span className="y">solar potential.</span>
          </h1>
          <p>
            Pop in your postcode, trace around your roof on the map, and we&rsquo;ll estimate how
            much solar you could fit — and roughly what it could save you a year.
          </p>
        </div>
      </section>

      {/* App grid */}
      <div className="wrap">
        <div className="rd-app">
          {/* ---------- Side panel ---------- */}
          <div className="rd-panel">
            {/* Step 1: Postcode */}
            <div className="rd-step">
              <div className="lab">
                <span className="num">1</span>
                <h3>Find your roof</h3>
              </div>
              <div className="row">
                <input
                  type="text"
                  id="rd-pc"
                  className="rd-input"
                  placeholder="Your postcode, e.g. CF10 1AA"
                  autoComplete="postal-code"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') geocode();
                  }}
                />
                <button className="btn btn-dark" onClick={geocode}>
                  Find
                </button>
              </div>
              <div className={`msg ${pcMsg.type}`}>{pcMsg.text}</div>
              <button
                className="linkish"
                onClick={() => setShowFallback((prev) => !prev)}
              >
                Map not loading? Enter your roof size instead
              </button>
            </div>

            {/* Step 2: Draw */}
            <div className={`rd-step ${step2Dim ? 'dim' : ''}`}>
              <div className="lab">
                <span className="num">2</span>
                <h3>Draw around your roof</h3>
              </div>
              <button className="btn btn-solar full" onClick={startDraw}>
                Start drawing{' '}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
              <p className="tip">
                Trace the roof plane that faces the sun. We&rsquo;ll set panels back 400mm from
                every edge, then place as many as fit in the best orientation — and show them on the
                map.
              </p>
            </div>

            {/* Manual fallback */}
            <div className={`fallback ${showFallback ? 'show' : ''}`}>
              <div className="lab" style={{ marginBottom: 10 }}>
                <span className="num">±</span>
                <h3>Enter roof size</h3>
              </div>
              <div className="ctrl">
                <span className="k">Roof width (m)</span>
                <input
                  type="number"
                  id="rd-mw"
                  className="rd-input"
                  min={1}
                  step={0.5}
                  placeholder="e.g. 8"
                />
              </div>
              <div className="ctrl">
                <span className="k">Roof length / slope (m)</span>
                <input
                  type="number"
                  id="rd-ml"
                  className="rd-input"
                  min={1}
                  step={0.5}
                  placeholder="e.g. 5"
                />
              </div>
              <button className="btn btn-dark full" onClick={manualCalc}>
                Estimate from size
              </button>
            </div>

            {/* Step 3: Refine + Results */}
            <div className={`rd-step ${step3Dim ? 'dim' : ''}`} style={{ marginTop: 22 }}>
              <div className="lab">
                <span className="num">3</span>
                <h3>Your indicative design</h3>
              </div>

              <div className="ctrl">
                <span className="k">
                  Your monthly electricity spend (optional — sharpens the estimate)
                </span>
                <input
                  type="number"
                  className="rd-input"
                  min={0}
                  step={5}
                  placeholder="e.g. 120"
                  value={bill}
                  onChange={(e) => setBill(e.target.value)}
                />
              </div>

              <div className="ctrl">
                <span className="k">Roof direction</span>
                {segBtn(
                  [
                    { label: 'South', value: 1.0 },
                    { label: 'E / W', value: 0.86 },
                    { label: 'North', value: 0.62 },
                  ],
                  dir,
                  setDir
                )}
              </div>

              <div className="ctrl">
                <span className="k">Shading</span>
                {segBtn(
                  [
                    { label: 'None', value: 1.0 },
                    { label: 'Light', value: 0.9 },
                    { label: 'Heavy', value: 0.72 },
                  ],
                  shade,
                  setShade
                )}
              </div>

              <div className="ctrl">
                <div
                  className={`rd-toggle ${battery ? 'on' : ''}`}
                  onClick={() => setBattery((prev) => !prev)}
                >
                  <span>Add battery storage</span>
                  <span className="rd-switch" />
                </div>
              </div>

              {/* Results */}
              <div className={`rd-results ${showResults ? 'show' : ''}`}>
                <div className="rd-headline">
                  <div className="glow" />
                  <div className="z">
                    <div className="k">Estimated yearly saving</div>
                    <div className="big" ref={rSaveRef}>
                      £0
                    </div>
                    <div className="sub" ref={rSysRef}>
                      —
                    </div>
                  </div>
                </div>
                <div className="rgrid">
                  <div className="rtile">
                    <div className="k">Roof area drawn</div>
                    <div className="v" ref={rAreaRef}>
                      0 <small>m²</small>
                    </div>
                  </div>
                  <div className="rtile">
                    <div className="k">Payback</div>
                    <div className="v" ref={rPayRef}>
                      0 <small>yrs</small>
                    </div>
                  </div>
                  <div className="rtile">
                    <div className="k">Yearly generation</div>
                    <div className="v" ref={rGenRef}>
                      0 <small>kWh</small>
                    </div>
                  </div>
                  <div className="rtile">
                    <div className="k">CO₂ cut / year</div>
                    <div className="v" ref={rCo2Ref}>
                      0 <small>t</small>
                    </div>
                  </div>
                </div>
                <a
                  className="btn btn-solar full rd-cta"
                  href={`/?kwp=${(panelsRef.current * M.panelKwp).toFixed(2)}&panels=${panelsRef.current}${battery ? '&battery=1' : ''}#quote`}
                >
                  Get my exact quote{' '}
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </a>
                <button className="btn btn-ghost full" style={{ marginTop: 8 }} onClick={startDraw}>
                  Redraw roof
                </button>
                <p className="disc">
                  Panels are placed to MCS good-practice with a 400mm perimeter (edge wind-zone)
                  setback, ~20mm gaps and the roof-aligned layout that fits the most modules.
                  Indicative only, for South Wales, in GBP — a full survey confirms structural
                  loading, a detailed shading assessment, roof obstructions (windows, vents) and DNO
                  limits.
                </p>
              </div>
            </div>
          </div>

          {/* ---------- Map ---------- */}
          <div id="rd-map">
            <div className={`maphint ${hintVisible ? 'show' : ''}`}>
              <SparkIcon className="spark" />
              <span>{hintText}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
