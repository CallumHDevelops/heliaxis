'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  BUSINESS_HOURS,
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
import { buildEstimateMessage } from '@/lib/estimator/lead';
import { SurveyModal } from './SurveyModal';
import { PHONE, PHONE_HREF, QuoteCapture, QuoteModal, StickyBar, TalkLine, useExitIntent, type QuoteDone } from './QuoteParts';
import { whatsappHref } from '@/components/site/WhatsAppButton';
import { includedItems } from '@/lib/estimator/included';
import { TrustBar } from './TrustBar';
import { SystemCards } from './SystemCards';
import { ProofBand } from './ProofBand';
import { BrandIcon } from '@/app/admin/crm/CrmUi';
import { chosenKey, systemChoices } from '@/lib/estimator/choices';
import { track } from '@/lib/estimator/analytics';
import { pixel } from '@/lib/meta-pixel';
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
  // With ?debug on the page address: the roof lookup's raw answer, to copy and send (never shown otherwise).
  const [debugText, setDebugText] = useState('');
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
  const [batteryKwh, setBatteryKwh] = useState(settings.batteries.find((b) => b.active)?.kwh ?? settings.batteryKwh);
  // Their supply: single phase unless they say three ('unknown' counts as single).
  const [phase, setPhase] = useState<'unknown' | 'single' | 'three'>('unknown');
  const [sizeMode, setSizeMode] = useState<'usage' | 'roof'>('usage');
  // The visitor's own panel count from the − and + on the results (0: our suggested size).
  const [panelsOwn, setPanelsOwn] = useState(0);
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
  // The lookup has an answer: the loading sparks finish before the screen changes.
  const [lookDone, setLookDone] = useState(false);
  // The address we know for the survey form, so it is not asked again.
  const [knownAddress, setKnownAddress] = useState('');
  // They chose to answer the roof questions themselves instead of giving an address.
  const [skipLookup, setSkipLookup] = useState(false);
  const [lookNote, setLookNote] = useState('');
  const [yieldData, setYieldData] = useState<Yield>(null);
  const [yieldNote, setYieldNote] = useState('');
  const head = useRef<HTMLDivElement>(null);

  // "Add to my quote" further down the page ticks that extra (and the battery's size stays as it was).
  useEffect(() => {
    const onAdd = (e: Event) => {
      const what = (e as CustomEvent<string>).detail;
      if (what === 'battery') setBattery(true);
      else if (what === 'ev') setEv(true);
      else if (what === 'heatpump') setHeatpump(true);
    };
    window.addEventListener('hx-est-add', onAdd);
    return () => window.removeEventListener('hx-est-add', onAdd);
  }, []);

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
    batteryKwh: battery ? batteryKwh : undefined,
    ev,
    heatpump,
    phase,
    panels: panelsOwn || undefined,
  };
  const live: EstimatorSettings = { ...settings, importPence: rates.imp, exportPence: rates.exp };
  const r = estimate(inputs, live);
  const withBattery = battery ? null : estimate({ ...inputs, battery: true }, live);

  function go(n: number) {
    setStep(n);
    track('est_step', { step: n + 1 });
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
    setLookDone(false);
    setKnownAddress('');
    setLooking(true);
    try {
      // A short minimum, so a quick answer is a smooth change of screen and not a flash.
      const wait = new Promise((r) => setTimeout(r, 1600));
      const debugOn = new URLSearchParams(window.location.search).has('debug');
      const res = await fetch((picker ? `/api/solar/roof?id=${encodeURIComponent(pickedId)}` : `/api/solar/roof?pc=${encodeURIComponent(postcode.trim())}&line=${encodeURIComponent(house.trim())}`) + (debugOn ? '&debug=1' : ''));
      const d = await res.json();
      if (debugOn) setDebugText(JSON.stringify(d));
      await wait;
      const full = String(d?.address ?? '').match(/[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}/i);
      if (full) setPostcode(full[0].toUpperCase());
      if (d?.address) setKnownAddress(String(d.address));
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
    // Let the last sparks turn gold before the screen changes.
    setLookDone(true);
    await new Promise((r) => setTimeout(r, 900));
    setLooking(false);
    go(1);
  }

  return (
    <>
      {debugText && <textarea readOnly value={debugText} onFocus={(e) => e.currentTarget.select()} aria-label="Roof lookup debug" style={{ position: 'fixed', left: 8, right: 8, bottom: 8, height: 90, zIndex: 9999, fontSize: 11 }} />}
      <section className="est-hero">
        <div className="glow" />
        <div className="wrap">
          <span className="eyebrow">South Wales · Free instant estimate</span>
          <h1>{who === 'business' ? 'See what solar could do for your business.' : 'See what solar could do for your home.'}</h1>
          <p>Answer six quick questions. You’ll get a system size, a price range and your savings, and we’ll send you a full quote as a PDF.</p>
          <TrustBar award={settings.award} />
        </div>
      </section>

      <div className="wrap est-wrap" id="estimator" ref={head}>
        {!done ? (
          <div className="est-card est-wiz">
            {looking && <Finding address={picker ? query : [house, postcode].filter(Boolean).join(', ')} done={lookDone} />}
            <div className="est-prog" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label={`Question ${step + 1} of ${STEPS.length}`}>
              {STEPS.map((s, i) => (
                <span key={s} className={i < step ? 'done' : i === step ? 'now' : ''}>
                  <i />
                  <em>{s}</em>
                </span>
              ))}
            </div>
            <p className="est-stepof" aria-hidden="true">
              Step {step + 1} of {STEPS.length}
            </p>

            <div className="est-q">
              {step === 0 && (
                <>
                  <h2>Where is the property?</h2>
                  <p className="est-sub">Your postcode gives us the sunshine for your area.</p>
                  <div className="est-opts two">
                    <Opt on={who === 'home'} onClick={() => { setWho('home'); setDaytime((d) => (['out', 'some', 'home'].includes(d) ? d : 'some')); }} title="A home" sub="House, bungalow, flat with its own roof" />
                    <Opt on={who === 'business'} onClick={() => { setWho('business'); setDaytime((d) => (['office', 'long', 'always', 'evening'].includes(d) ? d : 'office')); }} title="A business" sub="Shop, farm, warehouse, office" />
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
                  {who === 'business' ? (
                    <>
                      <h2>When is your business open?</h2>
                      <p className="est-sub">Solar makes power in daylight, so the more of your electricity you use while the sun is up, the more you save.</p>
                      <div className="est-opts two">
                        {BUSINESS_HOURS.map((h) => (
                          <Opt key={h.key} on={daytime === h.key} onClick={() => setDaytime(h.key)} title={h.label} sub={h.sub} />
                        ))}
                      </div>
                    </>
                  ) : (
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
            <TalkLine />
          </div>
        ) : (
          <Result knownAddress={knownAddress} rates={rates} setRates={setRates} roofHit={roofChoice === 'yes' ? roofHit : null} r={r} withBattery={withBattery} inputs={inputs} settings={live} postcode={postcode} town={roofChoice === 'yes' && roofHit ? (roofHit.address.split(',').at(-2)?.trim() ?? '') : (yieldData?.town ?? '')} source={roofChoice === 'yes' && roofHit ? (roofHit.monthly ? 'pvgis' : 'fallback') : (yieldData?.source ?? 'fallback')} note={yieldNote} controls={{ panelsOwn, setPanelsOwn, sizeMode, setSizeMode, shade, setShade, daytime, setDaytime, battery, setBattery, batteryKwh, setBatteryKwh, phase, setPhase, ev, setEv, heatpump, setHeatpump }} onRestart={() => { setDone(false); setStep(0); setPanelsOwn(0); }} />
        )}
      </div>
    </>
  );
}

type Controls = { panelsOwn: number; setPanelsOwn: (n: number) => void; batteryKwh: number; setBatteryKwh: (k: number) => void; phase: 'unknown' | 'single' | 'three'; setPhase: (p: 'unknown' | 'single' | 'three') => void; sizeMode: 'usage' | 'roof'; setSizeMode: (m: 'usage' | 'roof') => void; shade: Shade; setShade: (s: Shade) => void; daytime: Daytime; setDaytime: (d: Daytime) => void; battery: boolean; setBattery: (b: boolean) => void; ev: boolean; setEv: (b: boolean) => void; heatpump: boolean; setHeatpump: (b: boolean) => void };

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
        <svg viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
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
      <div>
        <button type="button" aria-label={`Lower ${label}`} onClick={() => onChange(Math.max(1, Math.round((value - 1) * 10) / 10))}>
          −
        </button>
        <b>{(Math.round(value * 10) / 10).toString()}p</b>
        <button type="button" aria-label={`Raise ${label}`} onClick={() => onChange(Math.round((value + 1) * 10) / 10)}>
          +
        </button>
      </div>
    </div>
  );
}

function Result({ knownAddress, rates, setRates, roofHit, r, withBattery, inputs, settings, postcode, town, source, note, controls, onRestart }: { rates: { imp: number; exp: number }; setRates: (r: { imp: number; exp: number }) => void; roofHit: RoofHit | null; r: ReturnType<typeof estimate>; withBattery: ReturnType<typeof estimate> | null; inputs: Inputs; settings: EstimatorSettings; postcode: string; town: string; source: 'pvgis' | 'fallback'; note: string; controls: Controls; onRestart: () => void; knownAddress: string }) {
  const [booking, setBooking] = useState(false);
  const [quoteDone, setQuoteDone] = useState<QuoteDone | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);
  useExitIntent(!quoteDone && !booking, () => setExitOpen(true));
  useEffect(() => {
    track('est_results_viewed');
    pixel('ViewContent', { content_name: 'solar-estimate', content_category: inputs.who, currency: 'GBP', value: Math.round(r.cost), kwp: Number(r.kwp.toFixed(2)), battery: r.batteryKwh > 0 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /** The answers (never prices) the server works the quote out from. */
  const quotePayload = () => ({
    inputs: { who: inputs.who, yieldKwhPerKwp: inputs.yieldKwhPerKwp, monthlyPerKwp: inputs.monthlyPerKwp, shade: inputs.shade, usage: inputs.usage, daytime: inputs.daytime, battery: inputs.battery, batteryKwh: inputs.batteryKwh, ev: inputs.ev, heatpump: inputs.heatpump, maxPanels: inputs.maxPanels, sizeMode: inputs.sizeMode, phase: inputs.phase, panels: inputs.panels },
    imp: settings.importPence,
    exp: settings.exportPence,
    postcode,
    address: knownAddress || roofHit?.address || '',
    mapPath: roofHit?.map?.imageUrl ?? null,
  });
  const openQuote = () => {
    track('est_quote_cta');
    const el = captureRef.current;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => el?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true }), 400);
  };
  const bookSurvey = () => {
    track('est_survey_clicked');
    setExitOpen(false);
    setBooking(true);
  };
  // Once they have sent the survey form, the buttons say so (remembered on this device for a month, per postcode).
  const [requested, setRequested] = useState(() => {
    try {
      const o = JSON.parse(window.localStorage.getItem('hx-est-survey') || 'null') as { postcode?: string; at?: number } | null;
      return !!o && o.postcode === postcode && Date.now() - (o.at ?? 0) < 30 * 864e5;
    } catch {
      return false;
    }
  });
  const sent = () => {
    setRequested(true);
    try {
      window.localStorage.setItem('hx-est-survey', JSON.stringify({ postcode, at: Date.now() }));
    } catch {
      // Not remembered: the page still shows it for now.
    }
  };
  const home = inputs.who === 'home';
  const max = Math.max(...r.monthly, 1);
  const pot = potentialOf(inputs.yieldKwhPerKwp * SHADE_FACTOR[inputs.shade]);
  const usedPct = r.generation > 0 ? (r.selfUsed / r.generation) * 100 : 0;
  const placeLine = roofHit ? roofHit.address : [town, postcode].filter(Boolean).join(' · ');
  const hasMap = !!roofHit?.map;
  // Side-by-side choices for a home: solar on its own, or with each battery on offer. The estimate re-runs for whichever is picked.
  const choices = systemChoices(inputs, settings);
  const chosen = chosenKey(inputs, r, choices);
  const batteryName = r.batteryKwh ? (settings.batteries.find((b) => Math.abs(b.kwh - r.batteryKwh) < 0.01)?.name ?? `${r.batteryKwh} kWh battery`) : null;
  const pkgOf = settings.packages.find((p) => p.active && p.kind === (r.batteryKwh ? 'solar_battery' : 'solar'));
  const included = includedItems({ panels: r.panels, inverter: r.inverter, batteryName, scaffolding: settings.costs.scaffoldingOn || !home, workmanshipYears: settings.workmanshipYears, packageIncludes: pkgOf?.includes, panelModel: settings.panelModel });
  const upsell = (['ev', 'heatpump'] as const).map((k) => ({ k, label: k === 'ev' ? 'An electric car' : 'A heat pump', on: !!inputs[k], delta: estimate({ ...inputs, [k]: !inputs[k] }, settings).saving - r.saving }));
  return (
    <div className="est-res">
      <section className={`est-v4-roof${hasMap ? '' : ' no-map'}`} aria-labelledby="est-roof-h">
        {hasMap && roofHit?.map && (
          <div className="est-v4-roof__map">
            <SolarMap map={roofHit.map} panels={r.panels} address={roofHit.address} />
          </div>
        )}
        <div className="est-v4-roof__info">
          <span className="est-v4-eyebrow">{roofHit ? 'Your roof' : home ? 'Your home' : 'Your building'}</span>
          <div className="est-v4-roof__rating">
            <span className="est-suns" role="img" aria-label={`${pot.suns} out of 5 suns`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <svg key={n} viewBox="0 0 24 24" width="20" height="20" className={n <= pot.suns ? 'on' : ''} aria-hidden="true">
                  <circle cx="12" cy="12" r="4.5" fill="currentColor" />
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                    <path key={a} d="M12 2.5 V5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" transform={`rotate(${a} 12 12)`} />
                  ))}
                </svg>
              ))}
            </span>
            <h2 id="est-roof-h">{pot.label}</h2>
          </div>
          <p className="est-v4-roof__place">
            {placeLine ? `${placeLine} · ` : ''}about {num(inputs.yieldKwhPerKwp * SHADE_FACTOR[inputs.shade])} kWh a year from each kWp
          </p>
          {roofHit && (
            <div className="est-v4-roof__facts">
              <span><b>{compassWord(roofHit.roof.bearing)}</b> facing</span>
              <span><b>{roofHit.roof.angle}°</b> pitch</span>
              <span><b>{roofHit.roof.maxPanels}</b> panels fit</span>
            </div>
          )}
          <div className="est-v4-size">
            <span className="est-v4-size__lab">System size</span>
            <div className="est-v4-size__ctl" role="group" aria-label="Number of panels">
              <button type="button" aria-label="One panel fewer" disabled={r.panels <= r.panelsMin} onClick={() => { track('est_panels_changed', { dir: -1 }); controls.setPanelsOwn(r.panels - 1); }}>
                −
              </button>
              <div className="est-v4-size__v" aria-live="polite">
                <b>{r.panels} panels</b>
                <small>{r.kwp.toFixed(2)} kWp</small>
              </div>
              <button type="button" aria-label="One panel more" disabled={r.panels >= r.panelsMax} onClick={() => { track('est_panels_changed', { dir: 1 }); controls.setPanelsOwn(r.panels + 1); }}>
                +
              </button>
            </div>
            <p className="est-v4-size__note">
              {controls.panelsOwn && r.panels !== r.panelsSuggested ? (
                <>
                  Your choice.{' '}
                  <button type="button" className="est-link" onClick={() => controls.setPanelsOwn(0)}>
                    Back to our suggestion ({r.panelsSuggested} panels)
                  </button>
                </>
              ) : (
                <>Sized for about {num(r.consumption)} kWh a year{inputs.ev || inputs.heatpump ? `, with ${[inputs.ev ? 'an electric car' : '', inputs.heatpump ? 'a heat pump' : ''].filter(Boolean).join(' and ')}` : ''}.</>
              )}
              {roofHit && r.roofPanels > r.panels && r.panelsMax >= r.roofPanels && (
                <>
                  {' · '}
                  <button type="button" className="est-link" onClick={() => { track('est_panels_changed', { dir: 'fill' }); controls.setPanelsOwn(r.roofPanels); }}>
                    Fill my roof ({r.roofPanels} panels)
                  </button>
                </>
              )}
            </p>
            {r.roofLimited && roofHit && <p className="est-v4-size__note">Your roof has room for about {roofHit.roof.maxPanels} panels, so that is the most we have sized for.</p>}
            {r.phaseCapped && <p className="est-v4-size__note">On a single-phase supply the biggest system we can fit is about {r.phaseCapKwp.toFixed(1)} kWp. A three-phase supply allows more.</p>}
          </div>
          <div className="est-v4-roof__links">
            <button type="button" className="est-link" onClick={openQuote}>
              Email me this as a PDF
            </button>
            <button type="button" className="est-link" onClick={onRestart}>
              Start again
            </button>
          </div>
        </div>
      </section>

      <SystemCards
        choices={choices}
        chosen={chosen}
        home={home}
        panelModel={settings.panelModel}
        panelWatts={settings.panelWatts}
        onQuote={openQuote}
        onChoose={(c) => {
          track('est_package_changed', { battery_kwh: c.battery ? c.kwh : 0 });
          controls.setBattery(c.battery);
          if (c.battery) controls.setBatteryKwh(c.kwh);
        }}
      />

      <ul className="est-v4-assure" aria-label="What the price covers">
        {home && settings.costs.scaffoldingOn && (
          <li>
            <BrandIcon k="check" size={20} /> Scaffolding included in the price
          </li>
        )}
        {r.gridRoute && (
          <li>
            <BrandIcon k="bolt" size={20} /> We handle the grid {r.gridRoute === 'G99' ? 'application (G99)' : 'notification (G98)'}
          </li>
        )}
        <li>
          <BrandIcon k="shield" size={20} /> MCS certified installer
        </li>
        <li>
          <BrandIcon k="document" size={20} /> A fixed price in writing after your free survey
        </li>
      </ul>
      <div className="est-v4-next">
        {requested ? (
          <span className="est-headdone est-headdone--inline" role="status">
            <b>Survey request received</b>
          </span>
        ) : (
          <button type="button" className="btn est-btn-ghost" onClick={bookSurvey}>
            Book my free survey
          </button>
        )}
        <a href={PHONE_HREF} onClick={() => track('est_call_click', { from: 'cards' })}>
          <BrandIcon k="phone" size={18} /> Call {PHONE}
        </a>
        <a href={whatsappHref('Hi Heliaxis, I have just used your solar estimator.')} target="_blank" rel="noopener noreferrer" onClick={() => track('est_whatsapp_click', { from: 'cards' })}>
          WhatsApp us
        </a>
      </div>

      <div className="est-resgrid two">
        <div className="est-card est-pad">
          <h3>What’s included</h3>
          <ul className="est-ticks est-incl">
            {included.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p className="est-fine">{home ? 'Fitted prices, 0% VAT.' : 'Prices are fitted, plus VAT.'} We do all of it, from the free survey to the aftercare.</p>
        </div>
        <div className="est-card est-pad est-quotecard" id="est-quote" ref={captureRef}>
          <h3>Send me my full quote</h3>
          <p className="est-sub">A PDF of this estimate with what is included and what happens next, by email, WhatsApp or both.</p>
          <QuoteCapture buildPayload={quotePayload} onDone={setQuoteDone} onBook={bookSurvey} done={quoteDone} pixelData={{ currency: 'GBP', value: Math.round(r.cost), kwp: Number(r.kwp.toFixed(2)), battery: r.batteryKwh > 0 }} />
        </div>
      </div>

      <ProofBand accreditations={settings.accreditations} reviews={settings.reviews} />

      <div className="est-v4-how">
        <h2>How we worked it out</h2>
        <p>The figures for the system you are looking at, and what to change if something is not right.</p>
      </div>
        <div className="est-card est-stats">
          <div className="tile">
            <div className="k">Used at home</div>
            <div className="v">
              {Math.round(usedPct)}<small>%</small>
            </div>
            <small>of what the panels make{r.batteryKwh ? ', with the battery' : ''}</small>
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
          {withBattery && !home && (
            <div className="est-battery">
              <b>With a {withBattery.batteryKwh} kWh battery</b>
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
          <div className="est-adj__g">
            <span className="est-adj__lab">Add to your system</span>
            <div className="est-tog3" role="group" aria-label="Add to your system">
              {([['Battery', controls.battery, controls.setBattery], ['Electric car', controls.ev, controls.setEv], ['Heat pump', controls.heatpump, controls.setHeatpump]] as const).map(([label, on, set]) => (
                <button key={label} type="button" className={on ? 'on' : ''} aria-pressed={on} onClick={() => set(!on)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="est-adj__g">
            <span className="est-adj__lab">Shade on the roof</span>
            <div className="est-tog3 seg" role="group" aria-label="Shade">
              {([['none', 'None'], ['some', 'Some'], ['lots', 'Lots']] as const).map(([sh, label]) => (
                <button key={sh} type="button" className={controls.shade === sh ? 'on' : ''} aria-pressed={controls.shade === sh} onClick={() => controls.setShade(sh)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="est-adj__g">
            <span className="est-adj__lab">{home ? 'Who is home in the day' : 'When you are open'}</span>
            <div className="est-tog3 seg" role="group" aria-label={home ? 'Who is home in the day' : 'When you are open'}>
              {(home ? ([['out', 'Out all day'], ['some', 'Some days'], ['home', 'Home all day']] as const) : (BUSINESS_HOURS.map((h) => [h.key, h.short]) as [Daytime, string][])).map(([d, label]) => (
                <button key={d} type="button" className={controls.daytime === d ? 'on' : ''} aria-pressed={controls.daytime === d} onClick={() => controls.setDaytime(d)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {home && (r.phaseCapped || r.kwp >= 7 || controls.phase !== 'unknown') && (
            <div className="est-adj__g">
              <span className="est-adj__lab">Do you know if you have a three-phase supply?</span>
              <div className="est-tog3 seg" role="group" aria-label="Electricity supply">
                {([['unknown', 'Not sure'], ['single', 'Single phase'], ['three', 'Three phase']] as const).map(([k, label]) => (
                  <button key={k} type="button" className={controls.phase === k ? 'on' : ''} aria-pressed={controls.phase === k} onClick={() => controls.setPhase(k)}>
                    {label}
                  </button>
                ))}
              </div>
              {r.phaseCapped && <p className="est-note">On a single-phase supply the biggest system we can fit is about {r.phaseCapKwp.toFixed(1)} kWp, so we have held it there. A three-phase supply allows more.</p>}
            </div>
          )}
          <div className="est-adj__g">
            <span className="est-adj__lab">Electricity prices</span>
            <div className="est-steppers">
              <Stepper label="You pay" value={rates.imp} onChange={(n) => setRates({ ...rates, imp: n })} />
              <Stepper label="You export at" value={rates.exp} onChange={(n) => setRates({ ...rates, exp: n })} />
            </div>
          </div>
          {r.gridRoute && <p className="est-note">{r.gridRoute === 'G99' ? 'We handle the grid application for you: your network operator approves a system this size before it goes in (a G99 application).' : 'We handle the grid application for you: this size just needs your network operator told after the install (a G98 notification).'}</p>}
          {note && <p className="est-note">{note}</p>}
        </div>
      </div>

      <div className="est-card est-pad est-upsell">
        <h3>Thinking about an electric car or a heat pump?</h3>
        <div className="est-chips" role="group" aria-label="Add to your estimate">
          {upsell.map((u) => (
            <button key={u.k} type="button" className={u.on ? 'on' : ''} aria-pressed={u.on} onClick={() => (u.k === 'ev' ? controls.setEv(!u.on) : controls.setHeatpump(!u.on))}>
              {u.label}
              {Math.abs(u.delta) >= 1 ? <span className="est-opt-tag"> {u.delta > 0 ? 'adds' : 'takes off'} about {gbp(Math.abs(u.delta))} a year to your saving</span> : null}
            </button>
          ))}
        </div>
        <p className="est-note">We re-run your estimate with it added, so you can see the change in your saving.</p>
      </div>

      <SurveyCard onBook={bookSurvey} postcode={postcode} requested={requested} />
      <StickyBar onQuote={openQuote} hidden={!!quoteDone} />
      <QuoteModal open={exitOpen} onClose={() => setExitOpen(false)}>
        <h3 className="est-qmodal__h">Want this sent to you?</h3>
        <p className="est-sub">We’ll email your estimate as a PDF.</p>
        <QuoteCapture buildPayload={quotePayload} onDone={setQuoteDone} onBook={bookSurvey} done={quoteDone} pixelData={{ currency: 'GBP', value: Math.round(r.cost), kwp: Number(r.kwp.toFixed(2)), battery: r.batteryKwh > 0 }} />
      </QuoteModal>
      <SurveyModal open={booking} onClose={() => setBooking(false)} who={inputs.who} postcode={postcode} address={knownAddress} picks={['Solar panels', ...(inputs.battery ? ['Battery storage'] : []), ...(inputs.heatpump ? ['Heat pump'] : []), ...(inputs.ev ? ['EV charger'] : [])]} message={estimateMessage(r, inputs, roofHit?.address ?? '')} onSent={sent} />


      <details className="assumptions">
        <summary>What’s behind the numbers</summary>
        <ul>
          <li>Yield: {num(inputs.yieldKwhPerKwp)} kWh per kWp a year for your postcode, roof direction and pitch ({source === 'pvgis' ? 'EU PVGIS data' : 'typical South Wales figure'}), less shading of {inputs.shade === 'none' ? '0' : inputs.shade === 'some' ? '10' : '22'}%.</li>
          <li>Electricity price {settings.importPence}p per kWh; export payment {settings.exportPence}p per kWh (Smart Export Guarantee rates vary from about 4p to 15p).</li>
          <li>You use about {Math.round(r.selfPct * 100)}% of the solar yourself, based on who is home in the day (a bigger system exports more of what it makes){r.batteryKwh ? ', with the battery' : ''}{inputs.ev ? ', and an electric car' : ''}{inputs.heatpump ? ', and a heat pump' : ''}.</li>
          <li>{r.pricing === 'costModel' ? `Priced for ${r.panels} panels with ${r.inverter ?? 'a GoodWe hybrid inverter'}${r.batteryKwh ? ' and a battery' : ''}, including scaffolding, fitting, electrical work, the grid application and MCS certificate.` : r.packageName ? `Priced from our ${r.packageName} package for ${r.panels} panels${r.batteryKwh ? ', with its battery' : ''}.` : `${home ? 'Home' : 'Business'} price £${(home ? settings.homeFixed : settings.businessFixed).toLocaleString('en-GB')} fixed plus £${(home ? settings.homePerKwp : settings.businessPerKwp).toLocaleString('en-GB')} per kWp installed${r.batteryKwh ? `, plus £${(settings.batteryPerKwh * settings.batteryKwh).toLocaleString('en-GB')} for the battery` : ''}.`} Savings are shown ±12%. The survey sets the real price.</li>
          <li>25-year figure: panels lose {settings.degradationPct}% a year and electricity prices are assumed {settings.priceRisePct ? `to rise ${settings.priceRisePct}% a year` : 'not to rise (today’s prices, a cautious view)'}.</li>
          <li>CO₂: about {r.co2Tonnes.toFixed(1)} tonnes a year, at {settings.co2PerKwh} kg per kWh.</li>
        </ul>
      </details>
      <p className="disc est-disc">This is an estimate, not a quote. Your free survey checks your roof, shading, electrics and meter, and gives exact figures. Heliaxis is an MCS-certified installer in South Wales.</p>
    </div>
  );
}

/** The lookup as one big spark: its top arm lights first, then the right, the bottom and the left. */
const FINDING = ['Finding your property', 'Reading your roof from above', 'Measuring each face and its shade', 'Laying out your panels'];
function Finding({ address, done }: { address: string; done: boolean }) {
  // The arm that is lighting now. It moves on every couple of seconds while we wait, and runs to the end when the answer is in.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow((n) => (done ? Math.min(n + 1, FINDING.length) : Math.min(n + 1, FINDING.length - 1))), done ? 200 : 2200);
    return () => clearInterval(t);
  }, [done]);
  return (
    <div className="est-finding" role="status" aria-live="polite">
      <svg className="est-bigspark" viewBox="0 0 24 24" aria-hidden="true">
        {[0, 90, 180, 270].map((a, i) => (
          <g key={a} transform={`rotate(${a} 12 12)`} className={i < now ? 'is-done' : i === now ? 'is-now' : ''}>
            <path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z" />
          </g>
        ))}
      </svg>
      <h2 key={Math.min(now, FINDING.length - 1)}>{FINDING[Math.min(now, FINDING.length - 1)]}…</h2>
      <p>{address || 'This takes a few seconds.'}</p>
    </div>
  );
}

/** What goes into the CRM with the enquiry: the figures they saw, so the call starts from them. */
function estimateMessage(r: ReturnType<typeof estimate>, inputs: Inputs, address: string) {
  return buildEstimateMessage({
    kwp: r.kwp,
    panels: r.panels,
    batteryKwh: r.batteryKwh,
    generation: num(r.generation),
    saving: gbp(r.saving),
    cost: gbpRound(r.cost, 100),
    payback: yrs(r.paybackYears),
    uses: inputs.usage.kind === 'bill' ? `£${inputs.usage.value}/month` : `${num(inputs.usage.value)} kWh/year`,
    shade: inputs.shade,
    daytime: BUSINESS_HOURS.find((h) => h.key === inputs.daytime)?.label ?? inputs.daytime,
    ev: !!inputs.ev,
    heatpump: !!inputs.heatpump,
    roof: address || 'answered by the visitor',
    packageName: r.packageName ?? null,
  });
}

/** The invitation under the estimate: one clear button that opens the survey form. */
function SurveyCard({ onBook, postcode, requested }: { onBook: () => void; postcode: string; requested: boolean }) {
  if (requested) {
    return (
      <div className="est-card est-pad est-lead est-lead--done" id="est-survey" role="status">
        <div>
          <h3>✓ Survey request received</h3>
          <p className="est-sub">We’ll be in touch with you soon! We’ve emailed you a receipt. Anything to add? Just reply to it.</p>
        </div>
      </div>
    );
  }
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
