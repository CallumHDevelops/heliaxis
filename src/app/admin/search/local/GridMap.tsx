'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';

export type GridPointView = { lat: number; lng: number; rank: number | null; checked: boolean; top3: { pos: number; title: string; domain: string | null; rating: number | null; votes: number | null }[] };
export type GridScanView = {
  id: number;
  phrase: string;
  centre: string;
  date: string;
  status: string;
  avgRank: number | null;
  top3Share: number | null;
  centreLat: number;
  centreLng: number;
  points: GridPointView[];
};

const WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';
const TILES = '/api/prospectpv/tiles/{z}/{x}/{y}';

const band = (p: GridPointView) => (!p.checked ? 'none' : p.rank === null ? 'out' : p.rank <= 3 ? 'top3' : p.rank <= 10 ? 'top10' : p.rank <= 20 ? 'top20' : 'out');
const LABEL: Record<string, string> = { top3: '1 to 3', top10: '4 to 10', top20: '11 to 20', out: 'Not in the top 20', none: 'No result' };

/** The map grid heat map: one scan at a time, picked by search and centre. */
export function GridMap({ scans }: { scans: GridScanView[] }) {
  const phrases = useMemo(() => [...new Set(scans.map((s) => s.phrase))].sort(), [scans]);
  const [phrase, setPhrase] = useState(phrases[0] ?? '');
  const centres = useMemo(() => [...new Set(scans.filter((s) => s.phrase === phrase).map((s) => s.centre))].sort(), [scans, phrase]);
  const [centre, setCentre] = useState(centres[0] ?? '');
  const scan = scans.find((s) => s.phrase === phrase && s.centre === centre) ?? scans.find((s) => s.phrase === phrase) ?? null;
  const [picked, setPicked] = useState<GridPointView | null>(null);

  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ map: import('maplibre-gl').Map; lib: typeof import('maplibre-gl'); markers: import('maplibre-gl').Marker[] } | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const lib = await import('maplibre-gl');
        if (dead || !el.current) return;
        lib.setWorkerUrl(WORKER_URL);
        const map = new lib.Map({
          container: el.current,
          center: [-2.9977, 51.5842],
          zoom: 10,
          maxZoom: 16,
          attributionControl: { compact: true },
          style: {
            version: 8,
            sources: { os: { type: 'raster', tiles: [TILES], tileSize: 256, maxzoom: 19, attribution: 'Contains OS data © Crown copyright and database rights' } },
            layers: [
              { id: 'bg', type: 'background', paint: { 'background-color': '#EDE7D8' } },
              { id: 'os', type: 'raster', source: 'os' },
            ],
          },
        });
        map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right');
        map.addControl(new lib.ScaleControl({ unit: 'metric' }), 'bottom-left');
        mapRef.current = { map, lib, markers: [] };
        map.on('load', () => !dead && setReady(true));
      } catch (e) {
        console.error('[search] grid map failed to start', e);
        if (!dead) setFailed('The map could not start in this browser. The figures beside it still stand.');
      }
    })();
    return () => {
      dead = true;
      mapRef.current?.map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    for (const mk of m.markers) mk.remove();
    m.markers = [];
    if (!scan) return;
    const bounds = new m.lib.LngLatBounds();
    for (const p of scan.points) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `lcl-dot ${band(p)}`;
      dot.textContent = !p.checked ? '?' : p.rank === null ? '–' : String(p.rank);
      dot.title = `${LABEL[band(p)]}${p.rank ? ` (we are ${p.rank})` : ''}`;
      dot.setAttribute('aria-label', `Point ${p.lat}, ${p.lng}: ${dot.title}`);
      dot.addEventListener('click', () => setPicked(p));
      m.markers.push(new m.lib.Marker({ element: dot }).setLngLat([p.lng, p.lat]).addTo(m.map));
      bounds.extend([p.lng, p.lat]);
    }
    if (scan.points.length) m.map.fitBounds(bounds, { padding: 40, duration: 0, maxZoom: 13 });
  }, [scan, ready]);

  if (!scans.length) return null;

  return (
    <div className="lcl-grid">
      <div className="lcl-grid__map">
        <div className="sx-row lcl-picker">
          <label className="sx-field">
            Search
            <select
              value={phrase}
              onChange={(e) => {
                const p = e.target.value;
                setPhrase(p);
                const cs = [...new Set(scans.filter((s) => s.phrase === p).map((s) => s.centre))].sort();
                setCentre(cs[0] ?? '');
                setPicked(null);
              }}
            >
              {phrases.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="sx-field">
            Centre
            <select
              value={centre}
              onChange={(e) => {
                setCentre(e.target.value);
                setPicked(null);
              }}
            >
              {centres.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div ref={el} className="lcl-map" role="region" aria-label="Map grid heat map" />
        {failed ? <p className="sx-note">{failed}</p> : null}
        <div className="sx-legend">
          <span><i style={{ background: '#2f7d32' }} />1 to 3</span>
          <span><i style={{ background: '#7cb342' }} />4 to 10</span>
          <span><i style={{ background: '#f8bc1e' }} />11 to 20</span>
          <span><i style={{ background: '#b3261e' }} />Not in the top 20</span>
          <span><i style={{ background: '#9e9a8f' }} />No result</span>
        </div>
      </div>
      <aside className="lcl-grid__side">
        {scan ? (
          <>
            <div className="sx-tiles lcl-tiles2">
              <div className="sx-tile">
                <span className="sx-tile__label">Average rank</span>
                <span className="sx-tile__value">{scan.avgRank ?? '–'}</span>
                <span className="sx-tile__note">Where we are listed, {scan.points.filter((p) => p.checked && p.rank !== null).length} of {scan.points.filter((p) => p.checked).length} points</span>
              </div>
              <div className="sx-tile">
                <span className="sx-tile__label">In the top 3</span>
                <span className="sx-tile__value">{scan.top3Share === null ? '–' : `${Math.round(scan.top3Share * 100)}%`}</span>
                <span className="sx-tile__note">Share of points checked</span>
              </div>
            </div>
            <p className="sx-note">
              {scan.status === 'waiting' ? 'Results still arriving. ' : ''}Google Maps on a phone at each of 25 points, 2.5 km apart, around {scan.centre}. Scan of {new Date(`${scan.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} (DataForSEO Maps).
            </p>
            {picked ? (
              <div>
                <h3 className="lcl-h3">At this point</h3>
                <p className="sx-note">{picked.checked ? (picked.rank ? `We are ${picked.rank}.` : 'We are not in the top 20.') : 'No result came back for this point.'}</p>
                <ol className="lcl-top3">
                  {picked.top3.map((t) => (
                    <li key={t.pos} className={/heliaxis/i.test(t.title) || t.domain === 'heliaxis.co.uk' ? 'ours' : ''}>
                      <b>{t.title || '(no name)'}</b>
                      <small>
                        {t.domain ?? 'no website'}
                        {t.rating !== null ? ` · ${t.rating} stars (${t.votes ?? 0})` : ''}
                      </small>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <p className="sx-note">Pick a point on the map to see the top three there.</p>
            )}
          </>
        ) : null}
      </aside>
    </div>
  );
}
