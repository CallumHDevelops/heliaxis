'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  DIRECTIONS,
  PITCHES,
  estimate,
  fallbackYield,
  potentialOf,
  SHADE_FACTOR,
  type Daytime,
  type DirectionKey,
  type EstimatorSettings,
  type Inputs,
  type PitchKey,
  type Shade,
  type Who,
} from '@/lib/estimator/calc';
import { compassWord, type MapData, type RoofFound } from '@/lib/estimator/roof';
import { SurveyModal } from './SurveyModal';
import { panelPolygon, pointsAttr, toPixel, MAP_SIZE } from '@/lib/estimator/overlay';

const gbp = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');
const gbpRound = (n: number, step = 50) => gbp(Math.round(n / step) * step);
const num = (n: number) => Math.round(n).toLocaleString('en-GB');
const yrs = (n: number) => (Math.round(n * 2) / 2).toString().replace(/\.0$/, '');
const PC = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type RoofMap = MapData & { imageUrl: string; outline: { lat: number; lng: number }[] | null };
type RoofHit = { address: string; roof: RoofFound; kwhPerKwp: number; monthly: number[] | null; imageryDate: string | null; map: RoofMap | null };
type Yield = { kwhPerKwp: number; monthly: number[] | null; town: string; source: 'pvgis' | 'fallback' } | null;
const SHORT_DIR: Record<string, string> = { south: 'South', se_sw: 'SE or SW', east_west: 'East or west', ne_nw: 'NE or NW', north: 'North' };
const STEPS = ['Where', 'Roof', 'Shade', 'Usage', 'Daytime', 'Extras'] as const;

function Opt({ on, onClick, title, sub, icon }: { on: boolean; onClick: () => void; title: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <button type="button" className={`est-opt${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick}>
      {icon && <span className="est-opt__i">{icon}</span>}
      <b>{title}</b>
      {sub && <small>{sub}</small>}
    </button>
  );
}

/** A little roof drawing: the pitch as an angle, the direction as an arrow, so the choice is easy to picture. */
function RoofIcon({ angle }: { angle: number }) {
  const h = 6 + angle * 0.32;
  return (
    <svg viewBox="0 0 40 28" width="40" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={`M3 24 L20 ${24 - h} L37 24`} />
      <path d="M7 24 V26 H33 V24" />
    </svg>
  );
}
const Compass = ({ deg }: { deg: number }) => (
  <svg viewBox="0 0 28 28" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="14" cy="14" r="11" opacity=".35" />
    <g transform={`rotate(${180 - deg} 14 14)`}>
      <path d="M14 5 L18 15 H10 Z" fill="currentColor" />
    </g>
  </svg>
);

export function SolarEstimatorApp({ settings, roofLookup = false, addressPicker = false }: { settings: EstimatorSettings; roofLookup?: boolean; addressPicker?: boolean }) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [who, setWho] = useState<Who>('home');
  const [postcode, setPostcode] = useState('');
  const [dir, setDir] = useState<DirectionKey>('se_sw');
  const [pitch, setPitch] = useState<PitchKey>('typical');
  const [shade, setShade] = useState<Shade>('none');
  const [kind, setKind] = useState<'bill' | 'kwh'>('bill');
  const [bill, setBill] = useState(120);
  const [kwh, setKwh] = useState(3800);
  const [daytime, setDaytime] = useState<Daytime>('some');
  const [battery, setBattery] = useState(false);
  const [sizeMode, setSizeMode] = useState<'usage' | 'roof'>('usage');
  const [ev, setEv] = useState(false);
  const [heatpump, setHeatpump] = useState(false);
  const [house, setHouse] = useState('');
  // The address picker: what they have typed, the suggestions for it, and the property they chose.
  const [query, setQuery] = useState('');
  const [sugs, setSugs] = useState<{ id: string; address: string }[]>([]);
  const [pickedId, setPickedId] = useState('');
  const [typed, setTyped] = useState(false);
  const [rates, setRates] = useState({ imp: settings.importPence, exp: settings.exportPence });
  const [roofHit, setRoofHit] = useState<RoofHit | null>(null);
  // 'ask': we found a roof, the visitor has not said yet; 'yes': use it; 'no': they will answer the questions.
  const [roofChoice, setRoofChoice] = useState<'ask' | 'yes' | 'no'>('no');
  const [looking, setLooking] = useState(false);
  // They chose to answer the roof questions themselves instead of giving an address.
  const [skipLookup, setSkipLookup] = useState(false);
  const [lookNote, setLookNote] = useState('');
  const [yieldData, setYieldData] = useState<Yield>(null);
  const [yieldNote, setYieldNote] = useState('');
  const head = useRef<HTMLDivElement>(null);

  const pcOk = PC.test(postcode.trim());
  const picker = addressPicker && roofLookup && !skipLookup && !typed;
  useEffect(() => {
    if (!picker || pickedId || query.trim().length < 3) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/solar/address?q=${encodeURIComponent(query.trim())}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((d) => setSugs(Array.isArray(d?.suggestions) ? d.suggestions : []))
        .catch(() => undefined);
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [picker, pickedId, query]);
  // The roof's yield: asked for when the visitor has given a postcode and roof, and again if they change them.
  useEffect(() => {
    if (!pcOk || step < 2 || roofChoice === 'yes') return;
    const ctl = new AbortController();
    fetch(`/api/solar/yield?pc=${encodeURIComponent(postcode.trim())}&dir=${dir}&pitch=${pitch}`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d && d.kwhPerKwp) setYieldData(d);
        setYieldNote(d?.error ?? '');
      })
      .catch(() => undefined);
    return () => ctl.abort();
  }, [pcOk, postcode, dir, pitch, step >= 2, roofChoice]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputs: Inputs = {
    who,
    yieldKwhPerKwp: roofChoice === 'yes' && roofHit ? roofHit.kwhPerKwp : (yieldData?.kwhPerKwp ?? fallbackYield(dir, pitch)),
    monthlyPerKwp: roofChoice === 'yes' && roofHit ? roofHit.monthly : (yieldData?.monthly ?? null),
    maxPanels: roofChoice === 'yes' && roofHit ? roofHit.roof.maxPanels : undefined,
    sizeMode,
    shade,
    usage: kind === 'bill' ? { kind: 'bill', value: bill } : { kind: 'kwh', value: kwh },
    daytime,
    battery,
    ev,
    heatpump,
  };
  const live: EstimatorSettings = { ...settings, importPence: rates.imp, exportPence: rates.exp };
  const r = estimate(inputs, live);
  const withBattery = battery ? null : estimate({ ...inputs, battery: true }, live);

  function go(n: number) {
    setStep(n);
    setTimeout(() => head.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  }
  const needHouse = roofLookup && !skipLookup;
  const canNext = step === 0 ? (picker ? !!pickedId && !looking : pcOk && !looking && (!needHouse || house.trim().length > 0)) : true;

  /** Next from the first question: if they gave a house number, try to find the roof from satellite data first. */
  async function nextFromWhere() {
    setLookNote('');
    setRoofHit(null);
    setRoofChoice('no');
    if (!picker && (!needHouse || !house.trim())) return go(1);
    setLooking(true);
    try {
      // A short minimum, so a quick answer is a smooth change of screen and not a flash.
      const wait = new Promise((r) => setTimeout(r, 1600));
      const res = await fetch(picker ? `/api/solar/roof?id=${encodeURIComponent(pickedId)}` : `/api/solar/roof?pc=${encodeURIComponent(postcode.trim())}&line=${encodeURIComponent(house.trim())}`);
      const d = await res.json();
      await wait;
      if (d?.found) {
        setRoofHit({ address: d.address, roof: d.roof, kwhPerKwp: d.kwhPerKwp, monthly: d.monthly, imageryDate: d.imageryDate, map: d.map ?? null });
        setRoofChoice('ask');
      } else if (d?.reason && d.reason !== 'not_configured') {
        const dbg = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');
        setLookNote(`We could not match your roof from satellite pictures, so a few quick questions instead.${dbg ? ` [${d.reason}: ${d.detail ?? 'no detail'}]` : ''}`);
      }
    } catch {
      // The estimator carries on with the questions.
    }
    setLooking(false);
    go(1);
  }

  return (
    <>
      <section className="est-hero">
        <div className="glow" />
        <div className="wrap">
          <span className="eyebrow">South Wales · Free instant estimate</span>
          <h1>See what solar could do for your home.</h1>
          <p>Six quick questions. Satellite weather data for your postcode, your roof and your electricity use give you a size, a saving and a payback.</p>
        </div>
      </section>

      <div className="wrap est-wrap" ref={head}>
        {!done ? (
          <div className="est-card est-wiz">
            {looking && <Finding address={picker ? query : [house, postcode].filter(Boolean).join(', ')} />}
            <div className="est-prog" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label={`Question ${step + 1} of ${STEPS.length}`}>
              {STEPS.map((s, i) => (
                <span key={s} className={i < step ? 'done' : i === step ? 'now' : ''}>
                  <i />
                  <em>{s}</em>
                </span>
              ))}
            </div>

            <div className="est-q">
              {step === 0 && (
                <>
                  <h2>Where is the property?</h2>
                  <p className="est-sub">Your postcode gives us the sunshine for your area.</p>
                  <div className="est-opts two">
                    <Opt on={who === 'home'} onClick={() => setWho('home')} title="A home" sub="House, bungalow, flat with its own roof" />
                    <Opt on={who === 'business'} onClick={() => setWho('business')} title="A business" sub="Shop, farm, warehouse, office" />
                  </div>
                  {picker ? (
                    <div className="est-pick">
                      <label className="est-lab" htmlFor="est-find">
                        Your address
                      </label>
                      <input
                        id="est-find"
                        className="est-input"
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setPickedId('');
                          setSugs([]);
                        }}
                        placeholder="Start typing your house number and postcode"
                        autoComplete="off"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-form-type="other"
                        role="combobox"
                        aria-expanded={sugs.length > 0 && !pickedId}
                        aria-controls="est-sugs"
                        onKeyDown={(e) => e.key === 'Enter' && canNext && void nextFromWhere()}
                      />
                      {query.trim().length >= 6 && sugs.length === 0 && !pickedId && (
                        <p className="est-hint">
                          Cannot see it?{' '}
                          <button type="button" className="est-link" onClick={() => setTyped(true)}>
                            Enter your postcode and house number instead
                          </button>
                        </p>
                      )}
                      {sugs.length > 0 && !pickedId && (
                        <ul id="est-sugs" className="est-sugs" role="listbox">
                          {sugs.map((sg) => (
                            <li key={sg.id} role="option" aria-selected="false">
                              <button
                                type="button"
                                onClick={() => {
                                  setPickedId(sg.id);
                                  setQuery(sg.address);
                                  setSugs([]);
                                  const m = sg.address.match(/[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}/i);
                                  if (m) setPostcode(m[0].toUpperCase());
                                }}
                              >
                                {sg.address}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                  <div className={`est-addr${roofLookup && !skipLookup ? '' : ' one'}`}>
                  <div>
                  <label className="est-lab" htmlFor="est-pc">
                    Postcode
                  </label>
                  <input id="est-pc" className="est-input" value={postcode} onChange={(e) => setPostcode(e.target.value.toUpperCase())} placeholder="e.g. NP15 1DG" autoComplete="postal-code" inputMode="text" onKeyDown={(e) => e.key === 'Enter' && canNext && void nextFromWhere()} />
                  </div>
                  {roofLookup && !skipLookup && (
                    <div>
                      <label className="est-lab" htmlFor="est-house">
                        House number or name
                      </label>
                      <input id="est-house" className="est-input" value={house} onChange={(e) => setHouse(e.target.value)} placeholder="e.g. 2 Marine Terrace" autoComplete="address-line1" onKeyDown={(e) => e.key === 'Enter' && canNext && void nextFromWhere()} />
                    </div>
                  )}
                  </div>
                  )}
                  {roofLookup && !skipLookup && <p className="est-hint">We find your roof from satellite pictures, so there is nothing to measure or guess.{' '}<button type="button" className="est-link" onClick={() => setSkipLookup(true)}>I would rather answer a few roof questions</button></p>}
                  {!picker && postcode && !pcOk && <p className="est-hint">Enter a full UK postcode, such as CF10 1AA.</p>}
                </>
              )}
              {step === 1 && roofChoice === 'ask' && roofHit && (
                <>
                  <h2>Is this your home?</h2>
                  <p className="est-sub">{roofHit.address}. We worked out the roof from this picture: nothing to answer.</p>
                  <div className="est-confirm">
                    {roofHit.map && <div className="est-confirm__map"><SolarMap map={roofHit.map} panels={0} address={roofHit.address} plain /></div>}
                  <div className="est-found">
                    <div>
                      <b>Main roof face</b>
                      <span>
                        Faces {compassWord(roofHit.roof.bearing)} · {roofHit.roof.angle}° pitch · about {roofHit.roof.areaM2} m²
                      </span>
                    </div>
                    <div>
                      <b>Room for about {roofHit.roof.maxPanels} panels</b>
                      <span>{roofHit.roof.shade === 'none' ? 'Little shading' : roofHit.roof.shade === 'some' ? 'Some shading' : 'Quite a lot of shading'}{roofHit.imageryDate ? ` · satellite picture from ${roofHit.imageryDate}` : ''}</span>
                    </div>
                  </div>
                  <div className="est-opts two">
                    <Opt on={false} onClick={() => { const r = roofHit.roof; setDir(r.direction); setShade(r.shade); setRoofChoice('yes'); go(3); }} title="Yes, that's my home" sub="Use this roof" />
                    <Opt on={false} onClick={() => setRoofChoice('no')} title="No, wrong building" sub="Answer a few roof questions instead" />
                  </div>
                  </div>
                  <p className="est-hint">Includes solar data from Google. It is a model from aerial pictures, so the survey confirms it.</p>
                </>
              )}
              {step === 1 && roofChoice !== 'ask' && (
                <>
                  {lookNote && <p className="est-hint">{lookNote}</p>}
                  <h2>Which way does your main roof face?</h2>
                  <p className="est-sub">Look at the roof with the most space. Not sure? Pick “Not sure” and we assume a typical house.</p>
                  <div className="est-opts six">
                    {DIRECTIONS.map((d) => (
                      <Opt key={d.key} on={dir === d.key} onClick={() => setDir(d.key)} title={SHORT_DIR[d.key]} icon={<Compass deg={d.aspect} />} />
                    ))}
                    <Opt on={false} onClick={() => { setDir('se_sw'); setPitch('typical'); go(2); }} title="Not sure" icon={<span className="est-q-mark">?</span>} />
                  </div>
                  <h2 className="est-h2">How steep is it?</h2>
                  <div className="est-opts four">
                    {PITCHES.map((p) => (
                      <Opt key={p.key} on={pitch === p.key} onClick={() => setPitch(p.key)} title={p.label} sub={`about ${p.angle}°`} icon={<RoofIcon angle={p.angle} />} />
                    ))}
                  </div>
                </>
              )}
              {step === 2 && (
                <>
                  <h2>Does anything shade the roof?</h2>
                  <p className="est-sub">Trees, a tall building next door, a chimney. Shade cuts how much the panels make.</p>
                  <div className="est-opts three">
                    <Opt on={shade === 'none'} onClick={() => setShade('none')} title="Hardly any" sub="Open roof, sun most of the day" />
                    <Opt on={shade === 'some'} onClick={() => setShade('some')} title="Some" sub="Shaded for part of the day" />
                    <Opt on={shade === 'lots'} onClick={() => setShade('lots')} title="A lot" sub="Shaded for much of the day" />
                  </div>
                </>
              )}
              {step === 3 && (
                <>
                  <h2>How much electricity do you use?</h2>
                  <p className="est-sub">Check a bill. A typical home spends about £90 to £150 a month; if you have it, your yearly kWh is more exact.</p>
                  <div className="est-seg" role="group" aria-label="How to enter usage">
                    <button type="button" className={kind === 'bill' ? 'on' : ''} aria-pressed={kind === 'bill'} onClick={() => setKind('bill')}>
                      Monthly bill
                    </button>
                    <button type="button" className={kind === 'kwh' ? 'on' : ''} aria-pressed={kind === 'kwh'} onClick={() => setKind('kwh')}>
                      Yearly kWh
                    </button>
                  </div>
                  {kind === 'bill' ? (
                    <div className="est-slide">
                      <div className="est-big">
                        {gbp(bill)}
                        <small>/month</small>
                      </div>
                      <input type="range" min={30} max={who === 'home' ? 400 : 3000} step={who === 'home' ? 5 : 25} value={bill} onChange={(e) => setBill(Number(e.target.value))} aria-label="Monthly electricity bill in pounds" />
                    </div>
                  ) : (
                    <div className="est-slide">
                      <div className="est-big">
                        {num(kwh)}
                        <small>kWh/year</small>
                      </div>
                      <input type="range" min={1000} max={who === 'home' ? 15000 : 150000} step={who === 'home' ? 100 : 1000} value={kwh} onChange={(e) => setKwh(Number(e.target.value))} aria-label="Yearly electricity use in kilowatt hours" />
                    </div>
                  )}
                </>
              )}
              {step === 4 && (
                <>
                  <h2>Who is in during the day?</h2>
                  <p className="est-sub">Solar makes power in daylight. The more you use then, the more you save.</p>
                  <div className="est-opts three">
                    <Opt on={daytime === 'out'} onClick={() => setDaytime('out')} title="Out at work" sub="Mostly empty 9 to 5" />
                    <Opt on={daytime === 'some'} onClick={() => setDaytime('some')} title="Some of the time" sub="Part-time or shifts" />
                    <Opt on={daytime === 'home'} onClick={() => setDaytime('home')} title="Home most days" sub="Retired, working from home" />
                  </div>
                </>
              )}
              {step === 5 && (
                <>
                  <h2>Any of these, now or soon?</h2>
                  <p className="est-sub">They change the size we suggest and how much of the solar you use. Tick any that apply.</p>
                  <div className="est-opts three">
                    <Opt on={battery} onClick={() => setBattery(!battery)} title="Battery storage" sub="Keep daytime solar for the evening" />
                    <Opt on={ev} onClick={() => setEv(!ev)} title="Electric car" sub="Charge at home" />
                    <Opt on={heatpump} onClick={() => setHeatpump(!heatpump)} title="Heat pump" sub="Or planning one" />
                  </div>
                </>
              )}
            </div>

            <div className="est-nav">
              {step > 0 ? (
                <button type="button" className="est-back" onClick={() => { if (step === 3 && roofChoice === 'yes') { setRoofChoice('ask'); go(1); } else go(step - 1); }}>
                  ← Back
                </button>
              ) : (
                <span />
              )}
              {step === 1 && roofChoice === 'ask' ? (
                <span />
              ) : step < STEPS.length - 1 ? (
                <button type="button" className="btn btn-solar" disabled={!canNext} onClick={() => (step === 0 ? void nextFromWhere() : go(step + 1))}>
                  {looking ? 'Finding your roof…' : 'Next'}
                </button>
              ) : (
                <button type="button" className="btn btn-solar" onClick={() => { setDone(true); go(0); }}>
                  Show my estimate
                </button>
              )}
            </div>
          </div>
        ) : (
          <Result rates={rates} setRates={setRates} roofHit={roofChoice === 'yes' ? roofHit : null} r={r} withBattery={withBattery} inputs={inputs} settings={live} postcode={postcode} town={roofChoice === 'yes' && roofHit ? (roofHit.address.split(',').at(-2)?.trim() ?? '') : (yieldData?.town ?? '')} source={roofChoice === 'yes' && roofHit ? (roofHit.monthly ? 'pvgis' : 'fallback') : (yieldData?.source ?? 'fallback')} note={yieldNote} controls={{ sizeMode, setSizeMode, shade, setShade, daytime, setDaytime, battery, setBattery, ev, setEv, heatpump, setHeatpump }} onRestart={() => { setDone(false); setStep(0); }} />
        )}
      </div>
    </>
  );
}

type Controls = { sizeMode: 'usage' | 'roof'; setSizeMode: (m: 'usage' | 'roof') => void; shade: Shade; setShade: (s: Shade) => void; daytime: Daytime; setDaytime: (d: Daytime) => void; battery: boolean; setBattery: (b: boolean) => void; ev: boolean; setEv: (b: boolean) => void; heatpump: boolean; setHeatpump: (b: boolean) => void };

/** The roof from above, with the building outline and the panels of the suggested system drawn on it. */
function SolarMap({ map, panels, address, plain = false }: { map: RoofMap; panels: number; address: string; plain?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const outline = map.outline ? map.outline.map((g) => toPixel(g, map.centre)) : null;
  const shown = map.panels.slice(0, panels);
  return (
    <figure className="est-map">
      <div className="est-mapbox">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={map.imageUrl} alt={`Satellite picture of ${address}`} onError={() => setFailed(true)} />
        <svg viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`} aria-hidden="true">
          {outline && (
            <>
              {/* The rest of the picture is dimmed a little, and the property lit with a light wash, so it is clear which building we mean. */}
              <path d={`M0,0H${MAP_SIZE}V${MAP_SIZE}H0Z M${outline.map((o) => `${o.x.toFixed(1)},${o.y.toFixed(1)}`).join(' L')}Z`} fill="rgba(12,12,10,.28)" fillRule="evenodd" />
              <polygon points={pointsAttr(outline)} fill="rgba(255,214,90,.2)" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
            </>
          )}
          {!plain && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug') && map.faces?.map((f, i) => (
            <polygon key={`f${i}`} points={pointsAttr(f.map((g) => toPixel(g, map.centre)))} fill="none" stroke="rgba(120,230,90,.9)" strokeWidth="1.6" strokeLinejoin="round" />
          ))}
          {shown.map((p, i) => (
            <polygon key={i} points={pointsAttr(panelPolygon({ lat: p.lat, lng: p.lng, orientation: p.o === 'p' ? 'portrait' : 'landscape', azimuth: p.az, pitch: p.pt }, map.panelW, map.panelH, map.centre))} fill="rgba(248,188,30,.82)" stroke="#211f18" strokeWidth="1.2" />
          ))}
        </svg>
      </div>
      {!plain && <figcaption>
        {shown.length} panels shown as an indicative layout{outline ? ', with the outline of the building' : ''}. A survey confirms what fits. Includes solar data and imagery from Google{outline ? '; building outline from Ordnance Survey data © Crown copyright and database rights, or © OpenStreetMap contributors' : ''}.
      </figcaption>}
    </figure>
  );
}

/** − and + for a price in pence, one step at a time. */
function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="est-step">
      <span>{label}</span>
      <button type="button" aria-label={`Lower ${label}`} onClick={() => onChange(Math.max(1, Math.round((value - 1) * 10) / 10))}>
        −
      </button>
      <b>{(Math.round(value * 10) / 10).toString()}p</b>
      <button type="button" aria-label={`Raise ${label}`} onClick={() => onChange(Math.min(99, Math.round((value + 1) * 10) / 10))}>
        +
      </button>
    </div>
  );
}

function Result({ rates, setRates, roofHit, r, withBattery, inputs, settings, postcode, town, source, note, controls, onRestart }: { rates: { imp: number; exp: number }; setRates: (r: { imp: number; exp: number }) => void; roofHit: RoofHit | null; r: ReturnType<typeof estimate>; withBattery: ReturnType<typeof estimate> | null; inputs: Inputs; settings: EstimatorSettings; postcode: string; town: string; source: 'pvgis' | 'fallback'; note: string; controls: Controls; onRestart: () => void }) {
  const [booking, setBooking] = useState(false);
  const home = inputs.who === 'home';
  const max = Math.max(...r.monthly, 1);
  const pot = potentialOf(inputs.yieldKwhPerKwp * SHADE_FACTOR[inputs.shade]);
  const usedPct = r.generation > 0 ? (r.selfUsed / r.generation) * 100 : 0;
  const placeLine = roofHit ? roofHit.address : [town, postcode].filter(Boolean).join(' · ');
  const hasMap = !!roofHit?.map;
  return (
    <div className="est-res">
      <div className="est-reporthead">
        <div className="est-rh-l">
          <span className="est-suns" role="img" aria-label={`${pot.suns} out of 5 suns`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <svg key={n} viewBox="0 0 24 24" width="22" height="22" className={n <= pot.suns ? 'on' : ''} aria-hidden="true">
                <circle cx="12" cy="12" r="4.5" fill="currentColor" />
                {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                  <path key={a} d="M12 2.5 V5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" transform={`rotate(${a} 12 12)`} />
                ))}
              </svg>
            ))}
          </span>
          <div>
            <h2>{pot.label}</h2>
            <p>
              {placeLine ? `${placeLine} · ` : ''}about <b>{num(inputs.yieldKwhPerKwp * SHADE_FACTOR[inputs.shade])} kWh</b> a year from each kWp
            </p>
          </div>
        </div>
        <div className="est-rh-r">
          <button type="button" className="est-link" onClick={() => window.print()}>
            Save as PDF
          </button>
          <button type="button" className="est-link" onClick={onRestart}>
            Start again
          </button>
        </div>
      </div>

      <div className={`est-dash${hasMap || roofHit ? '' : ' single'}`}>
        {roofHit && (
          <div className="est-card est-roofcard">
            {roofHit.map && <SolarMap map={roofHit.map} panels={r.panels} address={roofHit.address} />}
            <div className="est-facts">
              <span><b>{compassWord(roofHit.roof.bearing)}</b> facing</span>
              <span><b>{roofHit.roof.angle}°</b> pitch</span>
              <span><b>{roofHit.roof.areaM2} m²</b> main roof face</span>
              <span><b>{roofHit.roof.maxPanels}</b> panels fit</span>
            </div>
            {r.roofLimited && <p className="est-note">Your roof has room for about {roofHit.roof.maxPanels} panels, so that is the most we have sized for.</p>}
            {r.roofPanels > r.panelsWanted && (
              <div className="est-chips" role="group" aria-label="System size">
                <button type="button" className={controls.sizeMode === 'usage' ? 'on' : ''} aria-pressed={controls.sizeMode === 'usage'} onClick={() => controls.setSizeMode('usage')}>
                  Match my usage
                </button>
                <button type="button" className={controls.sizeMode === 'roof' ? 'on' : ''} aria-pressed={controls.sizeMode === 'roof'} onClick={() => controls.setSizeMode('roof')}>
                  Fill my roof ({r.roofPanels} panels)
                </button>
              </div>
            )}
          </div>
        )}
        <div className="est-col">
          <div className="est-card est-head">
            <div className="glow" />
            <div className="z">
              <span className="lab">Estimated saving each year</span>
              <div className="big">
                {gbpRound(r.savingLow)} – {gbpRound(r.savingHigh)}
              </div>
              <div className="sub">
                {r.kwp.toFixed(2)} kWp system · {r.panels} panels{r.batteryKwh ? ` + ${r.batteryKwh} kWh battery` : ''}
              </div>
              <button type="button" className="btn btn-solar est-headcta" onClick={() => setBooking(true)}>
                Book my free survey
              </button>
            </div>
          </div>
          <div className="est-card est-stats">
            <div className="tile">
              <div className="k">Installed cost</div>
              <div className="v">
                {gbpRound(r.costLow, 100)} – {gbpRound(r.costHigh, 100)}
              </div>
              <small>indicative{home ? ', 0% VAT where it applies' : ', before VAT'}</small>
            </div>
            <div className="tile">
              <div className="k">Pays for itself in</div>
              <div className="v">
                {yrs(r.paybackLow)} – {yrs(r.paybackHigh)} <small>years</small>
              </div>
            </div>
            <div className="tile">
              <div className="k">Makes a year</div>
              <div className="v">
                {num(r.generation)} <small>kWh</small>
              </div>
              <small>{num(r.selfUsed)} used at home · {num(r.exported)} exported</small>
            </div>
            <div className="tile">
              <div className="k">After 25 years</div>
              <div className="v">{gbpRound(r.net25, 100)}</div>
              <small>saved, after paying for it</small>
            </div>
          </div>
          <div className="est-card est-pad est-chartcard">
            <h3>What it makes, month by month</h3>
            <svg className="est-chart" viewBox="0 0 320 130" role="img" aria-label="Solar generation by month in kilowatt hours">
              {[0, 0.5, 1].map((t) => (
                <g key={t}>
                  <line x1="28" x2="316" y1={100 - t * 84} y2={100 - t * 84} stroke="currentColor" opacity=".12" />
                  <text x="24" y={103 - t * 84} textAnchor="end" fontSize="8" fill="currentColor" opacity=".6">
                    {num(max * t)}
                  </text>
                </g>
              ))}
              {r.monthly.map((m, i) => {
                const h = (m / max) * 84;
                return (
                  <g key={i}>
                    <title>{`${MONTH_NAMES[i]}: ${num(m)} kWh`}</title>
                    <rect x={32 + i * 24} y={100 - h} width="17" height={h} fill="var(--solar)" />
                    <text x={40.5 + i * 24} y="114" textAnchor="middle" fontSize="9" fill="currentColor" opacity=".7">
                      {MONTHS[i]}
                    </text>
                  </g>
                );
              })}
            </svg>
            <p className="est-note">{source === 'pvgis' ? `Satellite weather data${town ? ` for ${town}` : ''}, for your roof's direction and pitch.` : 'Typical South Wales sunshine for your roof.'} Summer makes several times more than winter.</p>
          </div>
        </div>
      </div>

      <div className="est-resgrid two">
        <div className="est-card est-pad">
          <h3>Your bill, before and after</h3>
          <div className="bar-row">
            <div className="lb">
              <span>Electricity bill now</span>
              <span className="mono">{gbp(r.billNow)}/yr</span>
            </div>
            <div className="bar now">
              <span style={{ width: '100%' }} />
            </div>
          </div>
          <div className="bar-row">
            <div className="lb">
              <span>With solar{r.batteryKwh ? ' and battery' : ''}</span>
              <span className="mono">{gbp(r.billAfter)}/yr</span>
            </div>
            <div className="bar after">
              <span style={{ width: `${Math.max(4, (r.billAfter / Math.max(r.billNow, 1)) * 100)}%` }} />
            </div>
          </div>
          <div className="est-split">
            <svg viewBox="0 0 42 42" width="84" height="84" role="img" aria-label={`${Math.round(usedPct)} percent of the solar is used at home`}>
              <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--paper-2)" strokeWidth="6" />
              <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--solar)" strokeWidth="6" strokeDasharray={`${usedPct} ${100 - usedPct}`} transform="rotate(-90 21 21)" />
            </svg>
            <div>
              <b>{Math.round(usedPct)}% used at home</b>
              <span>{num(r.selfUsed)} kWh, worth {gbp(r.selfUsed * (settings.importPence / 100))} off your bill</span>
              <b>{100 - Math.round(usedPct)}% exported</b>
              <span>{num(r.exported)} kWh, earning {gbp(r.exported * (settings.exportPence / 100))}</span>
            </div>
          </div>
          {withBattery && (
            <div className="est-battery">
              <b>With a {settings.batteryKwh} kWh battery</b>
              <span>
                you would use about {Math.round(withBattery.selfPct * 100)}% of your solar (instead of {Math.round(r.selfPct * 100)}%) and save about {gbp(withBattery.saving)} a year, for {gbpRound(withBattery.cost - r.cost, 100)} more.
              </span>
              <button type="button" className="est-link" onClick={() => controls.setBattery(true)}>
                Add a battery to my estimate
              </button>
            </div>
          )}
        </div>

        <div className="est-card est-pad est-adjust">
          <h3>Change something</h3>
          <div className="est-chips" role="group" aria-label="Adjust the estimate">
            <button type="button" className={controls.battery ? 'on' : ''} aria-pressed={controls.battery} onClick={() => controls.setBattery(!controls.battery)}>
              Battery
            </button>
            <button type="button" className={controls.ev ? 'on' : ''} aria-pressed={controls.ev} onClick={() => controls.setEv(!controls.ev)}>
              Electric car
            </button>
            <button type="button" className={controls.heatpump ? 'on' : ''} aria-pressed={controls.heatpump} onClick={() => controls.setHeatpump(!controls.heatpump)}>
              Heat pump
            </button>
          </div>
          <div className="est-chips" role="group" aria-label="Shade">
            {(['none', 'some', 'lots'] as const).map((sh) => (
              <button key={sh} type="button" className={controls.shade === sh ? 'on' : ''} aria-pressed={controls.shade === sh} onClick={() => controls.setShade(sh)}>
                {sh === 'none' ? 'No shade' : sh === 'some' ? 'Some shade' : 'Lots of shade'}
              </button>
            ))}
          </div>
          <div className="est-chips" role="group" aria-label="Who is home in the day">
            {(['out', 'some', 'home'] as const).map((d) => (
              <button key={d} type="button" className={controls.daytime === d ? 'on' : ''} aria-pressed={controls.daytime === d} onClick={() => controls.setDaytime(d)}>
                {d === 'out' ? 'Out all day' : d === 'some' ? 'In some days' : 'Home all day'}
              </button>
            ))}
          </div>
          <div className="est-steppers">
            <Stepper label="Electricity price" value={rates.imp} onChange={(n) => setRates({ ...rates, imp: n })} />
            <Stepper label="Export price" value={rates.exp} onChange={(n) => setRates({ ...rates, exp: n })} />
          </div>
          {r.needsG99 && <p className="est-note">A system over 3.68 kW needs approval from your network operator (a G99 application). We handle that for you.</p>}
          {note && <p className="est-note">{note}</p>}
        </div>
      </div>

      <SurveyCard onBook={() => setBooking(true)} postcode={postcode} />
      <SurveyModal open={booking} onClose={() => setBooking(false)} who={inputs.who} postcode={postcode} picks={['Solar panels', ...(inputs.battery ? ['Battery storage'] : []), ...(inputs.heatpump ? ['Heat pump'] : []), ...(inputs.ev ? ['EV charger'] : [])]} message={estimateMessage(r, inputs, roofHit?.address ?? '')} />


      <details className="assumptions">
        <summary>What’s behind the numbers</summary>
        <ul>
          <li>Yield: {num(inputs.yieldKwhPerKwp)} kWh per kWp a year for your postcode, roof direction and pitch ({source === 'pvgis' ? 'EU PVGIS data' : 'typical South Wales figure'}), less shading of {inputs.shade === 'none' ? '0' : inputs.shade === 'some' ? '10' : '22'}%.</li>
          <li>Electricity price {settings.importPence}p per kWh; export payment {settings.exportPence}p per kWh (Smart Export Guarantee rates vary from about 4p to 15p).</li>
          <li>You use about {Math.round(r.selfPct * 100)}% of the solar yourself, based on who is home in the day (a bigger system exports more of what it makes){r.batteryKwh ? ', with the battery' : ''}{inputs.ev ? ', and an electric car' : ''}{inputs.heatpump ? ', and a heat pump' : ''}.</li>
          <li>{home ? 'Home' : 'Business'} price £{(home ? settings.homeFixed : settings.businessFixed).toLocaleString('en-GB')} fixed plus £{(home ? settings.homePerKwp : settings.businessPerKwp).toLocaleString('en-GB')} per kWp installed{r.batteryKwh ? `, plus £${(settings.batteryPerKwh * settings.batteryKwh).toLocaleString('en-GB')} for the battery` : ''}. Savings are shown ±12% and prices ±8%.</li>
          <li>25-year figure: panels lose {settings.degradationPct}% a year and electricity prices are assumed {settings.priceRisePct ? `to rise ${settings.priceRisePct}% a year` : 'not to rise (today’s prices, a cautious view)'}.</li>
          <li>CO₂: about {r.co2Tonnes.toFixed(1)} tonnes a year, at {settings.co2PerKwh} kg per kWh.</li>
        </ul>
      </details>
      <p className="disc est-disc">This is an estimate, not a quote. Your free survey checks your roof, shading, electrics and meter, and gives exact figures. Heliaxis is an MCS-certified installer in South Wales.</p>
    </div>
  );
}

/** Shown while we look up the property: steps that change every few seconds, so the wait never looks like a stall. */
const FINDING = ['Finding your property…', 'Looking at your roof from above…', 'Measuring each roof face…', 'Checking the shade through the year…', 'Laying out the panels…'];
function Finding({ address }: { address: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, FINDING.length - 1)), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="est-finding" role="status" aria-live="polite">
      <div className="est-finding__sun" aria-hidden="true">
        <span />
      </div>
      <h2 key={i}>{FINDING[i]}</h2>
      <p>{address ? address : 'This takes a few seconds.'}</p>
      <div className="est-finding__bar" aria-hidden="true">
        <i />
      </div>
    </div>
  );
}

/** What goes into the CRM with the enquiry: the figures they saw, so the call starts from them. */
function estimateMessage(r: ReturnType<typeof estimate>, inputs: Inputs, address: string) {
  const dir = address ? `roof found at ${address}` : 'roof answered by the visitor';
  return `Solar estimator: ${r.kwp.toFixed(2)} kWp (${r.panels} panels)${r.batteryKwh ? ` + ${r.batteryKwh} kWh battery` : ''}. About ${num(r.generation)} kWh a year, saving about ${gbp(r.saving)} a year, indicative cost ${gbpRound(r.cost, 100)}, payback about ${yrs(r.paybackYears)} years. Uses ${inputs.usage.kind === 'bill' ? `£${inputs.usage.value}/month` : `${num(inputs.usage.value)} kWh/year`}; ${inputs.shade} shade; daytime: ${inputs.daytime}${inputs.ev ? '; electric car' : ''}${inputs.heatpump ? '; heat pump' : ''} (${dir}).`;
}

/** The invitation under the estimate: one clear button that opens the survey form. */
function SurveyCard({ onBook, postcode }: { onBook: () => void; postcode: string }) {
  return (
    <div className="est-card est-pad est-lead" id="est-survey">
      <div className="est-lead__copy">
        <h3>Want exact figures? Book your free survey</h3>
        <ul className="est-ticks">
          <li>We look at your roof, shading and electrics</li>
          <li>You get a fixed price, in writing</li>
          <li>No obligation and no pushy sales</li>
        </ul>
      </div>
      <div className="est-lead__act">
        <button type="button" className="btn btn-solar est-lead__btn" onClick={onBook}>
          Book my free survey
        </button>
        <Link className="est-link" href={`/book-a-survey?type=solar&postcode=${encodeURIComponent(postcode)}`}>
          Or pick a survey time yourself
        </Link>
        <p className="est-fine">Takes about a minute. We use your details to reply to your enquiry. See our <Link href="/privacy-policy">privacy policy</Link>.</p>
      </div>
    </div>
  );
}
