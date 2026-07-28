'use client';

import { useState, useMemo, useRef, useEffect } from 'react';

const YIELD_KWH = 950;
const IMPORT = 0.28;
const EXPORT = 0.15;
const CO2 = 0.207;

interface CalcResult {
  saving: number;
  kwp: number;
  gen: number;
  panels: number;
  payback: number;
  lifetime: number;
  co2: number;
  billAfter: number;
  annualBill: number;
}

function calc(type: string, spend: number, orient: number, shade: number, battery: boolean): CalcResult {
  const eff = YIELD_KWH * orient * shade;
  const annualBill = spend * 12;
  const consumption = annualBill / IMPORT;
  const isHome = type === 'home';
  let kwp = (consumption * 0.8) / eff;
  kwp = isHome ? Math.min(Math.max(kwp, 2), 10) : Math.min(Math.max(kwp, 5), 250);
  kwp = Math.round(kwp * 2) / 2;
  const gen = kwp * eff;
  const selfPct = isHome ? (battery ? 0.72 : 0.35) : (battery ? 0.78 : 0.50);
  const selfUsed = Math.min(gen * selfPct, consumption);
  const exported = Math.max(gen - selfUsed, 0);
  const saving = selfUsed * IMPORT + exported * EXPORT;
  const costPerKwp = isHome ? 1350 : 950;
  const battCost = battery ? (isHome ? 4000 : 5500) : 0;
  const cost = kwp * costPerKwp + battCost;
  const payback = saving > 0 ? cost / saving : 0;
  const lifetime = saving * 25;
  const co2Val = (gen * CO2) / 1000;
  const panels = Math.ceil(kwp / 0.44);
  const billAfter = Math.max(annualBill - saving, 0);
  return { saving, kwp, gen, panels, payback, lifetime, co2: co2Val, billAfter, annualBill };
}

function useAnimatedValue(target: number, duration = 450): number {
  const [display, setDisplay] = useState(target);
  const rafRef = useRef(0);
  const prevTarget = useRef(target);

  useEffect(() => {
    if (prevTarget.current === target) return;
    const from = display;
    prevTarget.current = target;
    const t0 = performance.now();

    function tick(now: number) {
      const k = Math.min(1, (now - t0) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      setDisplay(from + (target - from) * e);
      if (k < 1) rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return display;
}

const gbp0 = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');
const numFmt = (n: number) => Math.round(n).toLocaleString('en-GB');

function SparkSvg() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
      <g transform="rotate(0 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z" /></g>
      <g transform="rotate(90 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z" /></g>
      <g transform="rotate(180 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z" /></g>
      <g transform="rotate(270 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z" /></g>
    </svg>
  );
}

export function SolarEstimatorApp() {
  const [type, setType] = useState<'home' | 'business'>('home');
  const [spend, setSpend] = useState(120);
  const [orient, setOrient] = useState(1.0);
  const [shade, setShade] = useState(1.0);
  const [battery, setBattery] = useState(true);

  const results = useMemo(
    () => calc(type, spend, orient, shade, battery),
    [type, spend, orient, shade, battery],
  );

  const animSaving = useAnimatedValue(results.saving);
  const animPayback = useAnimatedValue(results.payback);
  const animLifetime = useAnimatedValue(results.lifetime);
  const animGen = useAnimatedValue(results.gen);
  const animCo2 = useAnimatedValue(results.co2);
  const animBillAfter = useAnimatedValue(results.billAfter);

  const barAfterPct = results.annualBill > 0
    ? Math.max(6, (results.billAfter / results.annualBill) * 100)
    : 0;

  const ctaHref = `#contact?type=${type}&spend=${spend}&system=${results.kwp}kWp${battery ? '&battery=1' : ''}`;

  return (
    <>
      {/* Top bar */}
      <div className="top">
        <div className="wrap">
          <span className="tag">Solar Estimator</span>
        </div>
      </div>

      {/* Hero */}
      <section className="est-hero">
        <div className="glow" />
        <div className="wrap">
          <span className="eyebrow">
            <SparkSvg />
            South Wales · Free instant estimate
          </span>
          <h1>See what solar could do for you.</h1>
          <p>Answer four quick questions for a ballpark on system size, savings and payback. It takes about 20 seconds — a free survey gives you exact figures.</p>
        </div>
      </section>

      {/* App */}
      <div className="wrap">
        <div className="est-app">
          {/* INPUTS */}
          <div className="est-card">
            <div className="hd">
              <span className="k">Inputs</span>
              <h2>Tell us about your property</h2>
            </div>
            <div className="est-body">
              {/* Property type */}
              <div className="field">
                <div className="flabel">
                  <span className="t">Property</span>
                  <span className="n">01 / TYPE</span>
                </div>
                <div className="seg">
                  <button
                    className={type === 'home' ? 'on' : ''}
                    onClick={() => setType('home')}
                    type="button"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 11l9-7 9 7" />
                      <path d="M5 10v9h14v-9" />
                    </svg>
                    Home
                  </button>
                  <button
                    className={type === 'business' ? 'on' : ''}
                    onClick={() => setType('business')}
                    type="button"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 21h18" />
                      <path d="M5 21V7l7-4 7 4v14" />
                    </svg>
                    Business
                  </button>
                </div>
              </div>

              {/* Monthly spend */}
              <div className="field">
                <div className="flabel">
                  <span className="t">Monthly electricity spend</span>
                  <span className="n">02 / SPEND</span>
                </div>
                <div className="spend">
                  <div className="val">
                    £<span>{numFmt(spend)}</span><small>/mo</small>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={1500}
                    step={10}
                    value={spend}
                    onChange={(e) => setSpend(Number(e.target.value))}
                  />
                </div>
                <div className="rangehints">
                  <span>£40</span>
                  <span>£1,500+</span>
                </div>
              </div>

              {/* Roof direction */}
              <div className="field">
                <div className="flabel">
                  <span className="t">Roof direction</span>
                  <span className="n">03 / ASPECT</span>
                </div>
                <div className="seg">
                  <button className={orient === 1.0 ? 'on' : ''} onClick={() => setOrient(1.0)} type="button">South</button>
                  <button className={orient === 0.86 ? 'on' : ''} onClick={() => setOrient(0.86)} type="button">East–West</button>
                  <button className={orient === 0.62 ? 'on' : ''} onClick={() => setOrient(0.62)} type="button">North</button>
                </div>
              </div>

              {/* Shading */}
              <div className="field">
                <div className="flabel">
                  <span className="t">Shading</span>
                  <span className="n">04 / SHADE</span>
                </div>
                <div className="seg">
                  <button className={shade === 1.0 ? 'on' : ''} onClick={() => setShade(1.0)} type="button">None</button>
                  <button className={shade === 0.9 ? 'on' : ''} onClick={() => setShade(0.9)} type="button">Light</button>
                  <button className={shade === 0.72 ? 'on' : ''} onClick={() => setShade(0.72)} type="button">Heavy</button>
                </div>
              </div>

              {/* Battery toggle */}
              <div className="field">
                <div
                  className={`toggle${battery ? ' on' : ''}`}
                  onClick={() => setBattery(!battery)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setBattery(!battery); }}
                >
                  <div className="txt">
                    <b>Add battery storage</b>
                    <span>Store daytime solar for the evening</span>
                  </div>
                  <div className="switch" />
                </div>
              </div>
            </div>
          </div>

          {/* RESULTS */}
          <div className="est-card res">
            <div className="headline">
              <div className="glow" />
              <div className="z">
                <div className="lab">Estimated yearly saving</div>
                <div className="big">
                  {gbp0(animSaving)}
                  <small style={{ fontFamily: 'var(--mono)', fontSize: '.4em', color: 'var(--muted-d)' }}> /yr</small>
                </div>
                <div className="sub">{results.kwp} kWp system · about {results.panels} panels{battery ? ' + battery' : ''}</div>
              </div>
            </div>
            <div className="est-body">
              {/* Bill bars */}
              <div className="bar-wrap">
                <div className="bar-row">
                  <div className="lb">
                    <span>Electricity bill now</span>
                    <span className="mono">{gbp0(results.annualBill)}</span>
                  </div>
                  <div className="bar now"><span style={{ width: '100%' }} /></div>
                </div>
                <div className="bar-row">
                  <div className="lb">
                    <span>After solar</span>
                    <span className="mono">{gbp0(animBillAfter)}</span>
                  </div>
                  <div className="bar after"><span style={{ width: `${barAfterPct}%` }} /></div>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid4">
                <div className="tile">
                  <div className="k">Payback</div>
                  <div className="v">{animPayback.toFixed(1)} <small>yrs</small></div>
                </div>
                <div className="tile">
                  <div className="k">25-year saving</div>
                  <div className="v">{gbp0(animLifetime)}</div>
                </div>
                <div className="tile">
                  <div className="k">Yearly generation</div>
                  <div className="v">{numFmt(animGen)} <small>kWh</small></div>
                </div>
                <div className="tile">
                  <div className="k">CO₂ cut / year</div>
                  <div className="v">{animCo2.toFixed(1)} <small>t</small></div>
                </div>
              </div>

              {/* CTA */}
              <div className="est-cta">
                <a className="btn btn-solar" href={ctaHref}>
                  Book my free survey{' '}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </a>
                <p className="disc">Estimates for South Wales, in GBP, based on typical figures — not a formal quote. Your free survey confirms exact system size, costs and savings.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Assumptions */}
        <details className="assumptions" style={{ marginBottom: 60 }}>
          <summary>What&rsquo;s behind the numbers</summary>
          <ul>
            <li>Yield: <code>950 kWh</code> per <code>kWp</code>/year for South Wales, adjusted for roof aspect &amp; shading.</li>
            <li>Import price <code>£0.28/kWh</code>; Smart Export Guarantee <code>£0.15/kWh</code>.</li>
            <li>Self-consumption: homes ~35% (72% with a battery); businesses ~50% (78% with a battery).</li>
            <li>Indicative install cost: homes <code>£1,350/kWp</code>, businesses <code>£950/kWp</code>, plus battery.</li>
            <li>CO₂ factor <code>0.207 kg/kWh</code> of grid electricity offset.</li>
          </ul>
        </details>
      </div>
    </>
  );
}
