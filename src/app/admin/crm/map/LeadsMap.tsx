'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import './map.css';

type Source = 'meta' | 'website' | 'whatsapp' | 'other';
type Area = { outcode: string; town: string; lat: number; lng: number; leads: number; won: number; bySource: Record<Source, number> };
type Geo = { days: number; total: number; located: number; unplaced: number; areas: Area[]; bySource: Record<Source, number> };

const LABEL: Record<Source, string> = { meta: 'Meta ads', website: 'Website', whatsapp: 'WhatsApp', other: 'Other' };
/** Brand colours: gold for Meta, ink for the website, deep amber for WhatsApp, a warm grey for the rest. */
const COLOUR: Record<Source, string> = { meta: '#F8BC1E', website: '#211F18', whatsapp: '#C77F04', other: '#A8A398' };
const DAYS = [30, 90, 180, 365];

const dominant = (a: Area): Source => (Object.keys(a.bySource) as Source[]).sort((x, y) => a.bySource[y] - a.bySource[x])[0];

export function LeadsMap({ initialDays }: { initialDays: number }) {
  const [days, setDays] = useState(initialDays);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [err, setErr] = useState('');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    setGeo(null);
    setErr('');
    fetch(`/api/crm/leads-map?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        if (d.error) setErr(d.error);
        else setGeo(d as Geo);
      })
      .catch(() => live && setErr('Could not load the map.'));
    return () => {
      live = false;
    };
  }, [days]);

  useEffect(() => {
    if (!geo || !box.current) return;
    let cleanup = () => undefined as void;
    let gone = false;
    void import('leaflet').then((L) => {
      if (gone || !box.current) return;
      const map = L.map(box.current, { scrollWheelZoom: true }).setView([51.6, -3.2], 8);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' }).addTo(map);
      const max = Math.max(1, ...geo.areas.map((a) => a.leads));
      const pts: [number, number][] = [];
      for (const a of geo.areas) {
        const r = 7 + 26 * Math.sqrt(a.leads / max);
        const c = L.circleMarker([a.lat, a.lng], { radius: r, color: '#211F18', weight: 1, fillColor: COLOUR[dominant(a)], fillOpacity: 0.72 }).addTo(map);
        const lines = (Object.keys(a.bySource) as Source[]).filter((s) => a.bySource[s]).map((s) => `${LABEL[s]}: ${a.bySource[s]}`);
        c.bindPopup(`<b>${a.outcode}${a.town ? ` · ${a.town}` : ''}</b><br>${a.leads} lead${a.leads === 1 ? '' : 's'}${a.won ? `, ${a.won} sold` : ''}<br>${lines.join('<br>')}`);
        pts.push([a.lat, a.lng]);
      }
      if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: L.point(40, 40), maxZoom: 11 });
      cleanup = () => map.remove();
    });
    return () => {
      gone = true;
      cleanup();
    };
  }, [geo]);

  const top = geo ? [...geo.areas].sort((a, b) => b.leads - a.leads).slice(0, 10) : [];
  return (
    <div className="lm">
      <header className="lm-head">
        <div>
          <h1>Leads map</h1>
          <p className="crm-muted">Where your leads come from, by postcode area, over the last {days} days. Bigger circles are more leads; the colour is where most of them found you.</p>
        </div>
        <div className="crm-actions" role="group" aria-label="Period">
          {DAYS.map((d) => (
            <button key={d} type="button" className={`crm-btn crm-btn--small ${d === days ? 'crm-btn--solar' : 'crm-btn--ghost'}`} onClick={() => setDays(d)} aria-pressed={d === days}>
              {d === 365 ? '1 year' : `${d} days`}
            </button>
          ))}
        </div>
      </header>
      {err && <p className="crm-error">{err}</p>}
      {!geo && !err && <p className="crm-muted">Placing the leads on the map…</p>}
      {geo && (
        <div className="lm-body">
          <div className="lm-map" ref={box} aria-label="Map of leads by postcode area" />
          <aside className="lm-side">
            <div className="lm-legend">
              {(Object.keys(LABEL) as Source[]).map((s) => (
                <span key={s}>
                  <i style={{ background: COLOUR[s] }} /> {LABEL[s]} <b>{geo.bySource[s]}</b>
                </span>
              ))}
            </div>
            <p className="crm-small crm-muted">
              {geo.located} of {geo.total} leads placed{geo.unplaced ? `; ${geo.unplaced} have no usable postcode` : ''}.
            </p>
            <h2>Top areas</h2>
            <ol className="lm-top">
              {top.map((a) => (
                <li key={a.outcode}>
                  <span>
                    <b>{a.outcode}</b> {a.town}
                  </span>
                  <span>
                    {a.leads} lead{a.leads === 1 ? '' : 's'}
                    {a.won ? ` · ${a.won} sold` : ''}
                  </span>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      )}
    </div>
  );
}
