'use client';
/**
 * The Map screen: search, draw, check the area, save it as a campaign.
 * Phase M1 spends nothing beyond one cheap address count per check.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  formatHa, geometryFromGeoJson, squareAround, validateDrawnArea, type AreaLimits,
} from '@/lib/prospectpv/mapArea';
import type { AreaEstimate } from '@/lib/prospectpv/server/mapActions';
import type { ActionResult } from '@/lib/prospectpv/server/actionTypes';
import { FileButton } from '@/app/admin/crm/CrmUi';
import { Field } from '@/components/prospectpv/admin/ui';
import { AreaMap, type AreaMapHandle, type DrawnShapes, type DrawTool } from './AreaMap';
import { MAP_CSS } from './mapCss';

type Hit = { uprn: string; address: string; lat: number; lng: number };

export type MapScreenProps = {
  center: [number, number];
  zoom: number;
  limits: AreaLimits;
  tileUrl?: string;
  showTiles?: boolean;
  actions: {
    estimate(area: unknown): Promise<ActionResult<AreaEstimate>>;
    save(raw: { name: string; area: unknown }): Promise<ActionResult<{ campaignId: string; areaHa: number }>>;
  };
};

const TOOLS: { id: DrawTool; label: string; help: string }[] = [
  { id: 'polygon', label: 'Polygon', help: 'Click each corner, then double-click to finish' },
  { id: 'rectangle', label: 'Rectangle', help: 'Click and drag' },
  { id: 'freehand', label: 'Freehand', help: 'Hold and draw round the homes' },
  { id: 'select', label: 'Edit', help: 'Move a shape, or drag its corners' },
];

const money = (n: number) => `£${n.toFixed(2)}`;

export function MapScreen({ center, zoom, limits, tileUrl = '/api/prospectpv/tiles/{z}/{x}/{y}', showTiles = true, actions }: MapScreenProps) {
  const map = useRef<AreaMapHandle>(null);
  const [shapes, setShapes] = useState<DrawnShapes>(null);
  const [tool, setTool] = useState<DrawTool>('polygon');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searchMsg, setSearchMsg] = useState('');
  const [busy, setBusy] = useState<'search' | 'check' | 'save' | null>(null);
  const [result, setResult] = useState<AreaEstimate | null>(null);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [saved, setSaved] = useState<{ id: string; ha: number } | null>(null);
  const [lastHit, setLastHit] = useState<Hit | null>(null);

  const check = useMemo(() => (shapes ? validateDrawnArea(shapes, limits) : null), [shapes, limits]);

  const onChange = useCallback((s: DrawnShapes) => {
    setShapes(s);
    setResult(null);
    setSaved(null);
    setMessage('');
  }, []);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 3) { setSearchMsg('Type at least three characters of an address or postcode.'); return; }
    setBusy('search'); setSearchMsg(''); setHits(null);
    try {
      const res = await fetch(`/api/prospectpv/search?q=${encodeURIComponent(query.trim())}`);
      const body = (await res.json()) as { places?: Hit[]; message?: string };
      if (!res.ok) { setSearchMsg(body.message ?? 'Search isn’t working right now.'); return; }
      if (!body.places?.length) { setSearchMsg('No address found. Check the postcode, or pan the map by hand.'); return; }
      setHits(body.places);
    } catch {
      setSearchMsg('Search isn’t working right now.');
    } finally { setBusy(null); }
  }

  function pick(h: Hit) {
    map.current?.flyTo(h.lng, h.lat);
    setLastHit(h);
    setHits(null);
    setSearchMsg(`Moved the map to ${h.address}.`);
  }

  function squareHere() {
    if (!lastHit) return;
    map.current?.load(squareAround(lastHit.lng, lastHit.lat, 200));
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > 1_000_000) { setMessage('That file is too big for an area. Use one under 1 MB.'); return; }
    try {
      const geom = geometryFromGeoJson(JSON.parse(await file.text())) as { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown } | null;
      if (!geom) { setMessage('That file has no polygon in it. Use a GeoJSON file with a Polygon or MultiPolygon.'); return; }
      const c = validateDrawnArea(geom, limits);
      if (!c.ok) { setMessage(c.message); return; }
      map.current?.load(c.geometry);
      setMessage('');
    } catch {
      setMessage('That file couldn’t be read as GeoJSON.');
    }
  }

  async function assess() {
    if (!shapes) return;
    setBusy('check'); setMessage(''); setResult(null); setSaved(null);
    const r = await actions.estimate(shapes);
    setBusy(null);
    if (!r.ok) { setMessage(r.message ?? 'Couldn’t check that area.'); return; }
    setResult(r);
  }

  async function save() {
    if (!shapes) return;
    if (!name.trim()) { setNameError('Give this area a name, for example the street or estate.'); return; }
    setNameError(''); setBusy('save'); setMessage('');
    const r = await actions.save({ name, area: shapes });
    setBusy(null);
    if (!r.ok) { setNameError(r.errors?.name ?? ''); setMessage(r.message ?? ''); return; }
    setSaved({ id: r.campaignId, ha: r.areaHa });
  }

  const e = result?.estimate;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: MAP_CSS }} />
      <div className="pva-head">
        <div>
          <h1>Map</h1>
          <p>Zoom to a street or estate and draw round the homes you want to write to. We count the homes first and show what a scan would cost. Nothing is spent until you confirm.</p>
        </div>
      </div>
      <div className="pvm">
        <section aria-label="Map and drawing tools">
          <form className="pvm-bar" onSubmit={search} role="search">
            <div className="pvm-search">
              <input aria-label="Search for an address or postcode" placeholder="Address or postcode" value={query} onChange={(ev) => setQuery(ev.target.value)} autoComplete="off" />
              <button className="crm-btn crm-btn--ghost" type="submit" disabled={busy === 'search'}>{busy === 'search' ? 'Searching…' : 'Search'}</button>
            </div>
          </form>
          {hits ? (
            <ul className="pvm-hits" aria-label="Search results">
              {hits.map((h) => <li key={h.uprn || h.address}><button type="button" onClick={() => pick(h)}>{h.address}</button></li>)}
            </ul>
          ) : null}
          <p className="pva-muted" role="status" aria-live="polite" style={{ margin: '6px 0 10px', fontSize: 13, minHeight: 18 }}>{searchMsg}</p>

          <div className="pvm-bar" role="toolbar" aria-label="Drawing tools">
            {TOOLS.map((t) => (
              <button key={t.id} type="button" className="crm-btn crm-btn--ghost crm-btn--small" aria-pressed={tool === t.id} title={t.help}
                onClick={() => { map.current?.setTool(t.id); setTool(t.id); }}>{t.label}</button>
            ))}
            <button type="button" className="crm-btn crm-btn--small crm-btn--ghost" onClick={() => map.current?.deleteSelected()} disabled={!shapes}>Delete shape</button>
            <button type="button" className="crm-btn crm-btn--small crm-btn--ghost" onClick={() => { map.current?.clear(); setMessage(''); }} disabled={!shapes}>Clear all</button>
            <span className="pva-muted" style={{ fontSize: 13 }}>{TOOLS.find((t) => t.id === tool)?.help}</span>
          </div>

          <AreaMap ref={map} center={center} zoom={zoom} tileUrl={tileUrl} showTiles={showTiles} onChange={onChange} onToolChange={setTool} />

          <div className="pvm-bar" style={{ marginTop: 10 }}>
            <button type="button" className="crm-btn crm-btn--small crm-btn--ghost" onClick={squareHere} disabled={!lastHit}
              title="Draws a 200 m square around the address you searched for. A way to start without a mouse.">200 m square round this address</button>
            <FileButton label="Load an area file" accept=".geojson,.json,application/geo+json,application/json" onFiles={(files) => void upload(files[0])} />
          </div>
        </section>

        <aside className="pvm-side" aria-label="This area">
          <div className="pva-card" aria-live="polite">
            <h2>This area</h2>
            {!shapes ? (
              <p className="pva-muted" style={{ marginBottom: 0 }}>Nothing drawn yet. Pick a tool and draw round the homes.</p>
            ) : check && !check.ok ? (
              <p className="pvm-block" role="alert" style={{ marginTop: 8 }}>{check.message}</p>
            ) : check?.ok ? (
              <>
                <div className="pvm-big">{formatHa(check.areaHa)}</div>
                <div className="pva-muted" style={{ fontSize: 13, marginTop: 4 }}>{check.shapes} shape{check.shapes === 1 ? '' : 's'}{limits.max_area_ha ? ` · limit ${formatHa(limits.max_area_ha)}` : ''}</div>
                <div style={{ marginTop: 14 }}>
                  <button type="button" className="crm-btn crm-btn--solar" onClick={assess} disabled={busy === 'check'}>
                    {busy === 'check' ? 'Counting homes…' : 'Count homes and estimate'}
                  </button>
                </div>
              </>
            ) : null}
            {message ? <p className="pvm-block" role="alert">{message}</p> : null}
          </div>

          {e ? (
            <div className="pva-card" aria-label="Estimate">
              <h2>Estimate</h2>
              <p className="pva-blurb" style={{ marginBottom: 8 }}>Nothing has been spent on roof checks. These are worst-case figures.</p>
              <div className="pvm-stat"><span>Homes found</span><b>{e.homesFound.toLocaleString('en-GB')}</b></div>
              <div className="pvm-stat"><span>Google Solar checks, at most</span><b>{e.solarCallsAtMost.toLocaleString('en-GB')}</b></div>
              <div className="pvm-stat"><span>Free checks left this month</span><b>{e.freeCallsLeft === null ? 'Not set' : e.freeCallsLeft.toLocaleString('en-GB')}</b></div>
              <div className="pvm-stat"><span>Estimated cost, at most</span><b>{e.costAtMostGbp === null ? 'Not set' : money(e.costAtMostGbp)}</b></div>
              <div className="pvm-stat"><span>Left under this month’s cap</span><b>{e.capRemainingGbp === null ? 'No cap set' : money(e.capRemainingGbp)}</b></div>
              {e.blockers.map((b) => <p key={b} className="pvm-block" role="alert">{b}</p>)}
              <ul className="pvm-list">{e.notes.map((n) => <li key={n} className="pva-muted">{n}</li>)}</ul>

              {saved ? (
                <p className="pvm-note" role="status" style={{ color: 'var(--ink)' }}>
                  Saved as a draft campaign ({formatHa(saved.ha)}). It is waiting for confirmation. Roof checks start in the next phase.
                </p>
              ) : (
                <form onSubmit={(ev) => { ev.preventDefault(); void save(); }} style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                  <Field label="Name this area" error={nameError}>
                    <input value={name} maxLength={80} onChange={(ev) => setName(ev.target.value)} placeholder="e.g. Rhiwbina, Heol-y-Deri" />
                  </Field>
                  <button type="submit" className="crm-btn crm-btn--solar" disabled={!e.canConfirm || busy === 'save'}>
                    {busy === 'save' ? 'Saving…' : 'Save area as a campaign'}
                  </button>
                </form>
              )}
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}
