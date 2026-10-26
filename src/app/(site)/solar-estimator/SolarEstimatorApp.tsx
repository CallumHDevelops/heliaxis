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

const gbp = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');
const gbpRound = (n: number, step = 50) => gbp(Math.round(n / step) * step);
const num = (n: number) => Math.round(n).toLocaleString('en-GB');
const yrs = (n: number) => (Math.round(n * 2) / 2).toString().replace(/\.0$/, '');
const PC = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type Yield = { kwhPerKwp: number; monthly: number[] | null; town: string; source: 'pvgis' | 'fallback' } | null;
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

export function SolarEstimatorApp({ settings }: { settings: EstimatorSettings }) {
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
  const [ev, setEv] = useState(false);
  const [heatpump, setHeatpump] = useState(false);
  const [yieldData, setYieldData] = useState<Yield>(null);
  const [yieldNote, setYieldNote] = useState('');
  const head = useRef<HTMLDivElement>(null);

  const pcOk = PC.test(postcode.trim());
  // The roof's yield: asked for when the visitor has given a postcode and roof, and again if they change them.
  useEffect(() => {
    if (!pcOk || step < 2) return;
    const ctl = new AbortController();
    fetch(`/api/solar/yield?pc=${encodeURIComponent(postcode.trim())}&dir=${dir}&pitch=${pitch}`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d && d.kwhPerKwp) setYieldData(d);
        setYieldNote(d?.error ?? '');
      })
      .catch(() => undefined);
    return () => ctl.abort();
  }, [pcOk, postcode, dir, pitch, step >= 2]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputs: Inputs = {
    who,
    yieldKwhPerKwp: yieldData?.kwhPerKwp ?? fallbackYield(dir, pitch),
    monthlyPerKwp: yieldData?.monthly ?? null,
    shade,
    usage: kind === 'bill' ? { kind: 'bill', value: bill } : { kind: 'kwh', value: kwh },
    daytime,
    battery,
    ev,
    heatpump,
  };
  const r = estimate(inputs, settings);
  const withBattery = battery ? null : estimate({ ...inputs, battery: true }, settings);

  function go(n: number) {
    setStep(n);
    setTimeout(() => head.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  }
  const canNext = step === 0 ? pcOk : true;

  return (
    <>
      <section className="est-hero">
        <div className="glow" />
        <div className="wrap">
          <span className="eyebrow">South Wales · Free instant estimate</span>
          <h1>See what solar could do for your home.</h1>
          <p>Six quick questions. We use satellite weather data for your postcode, your roof and your electricity use to estimate the system size, what you would save, and how long it takes to pay back.</p>
        </div>
      </section>

      <div className="wrap est-wrap" ref={head}>
        {!done ? (
          <div className="est-card est-wiz">
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
                  <label className="est-lab" htmlFor="est-pc">
                    Postcode
                  </label>
                  <input id="est-pc" className="est-input" value={postcode} onChange={(e) => setPostcode(e.target.value.toUpperCase())} placeholder="e.g. NP15 1DG" autoComplete="postal-code" inputMode="text" onKeyDown={(e) => e.key === 'Enter' && canNext && go(1)} />
                  {postcode && !pcOk && <p className="est-hint">Enter a full UK postcode, such as CF10 1AA.</p>}
                </>
              )}
              {step === 1 && (
                <>
                  <h2>Which way does your main roof face?</h2>
                  <p className="est-sub">Look at the roof with the most space. Not sure? Pick “Not sure” and we assume a typical house.</p>
                  <div className="est-opts">
                    {DIRECTIONS.map((d) => (
                      <Opt key={d.key} on={dir === d.key} onClick={() => setDir(d.key)} title={d.label} icon={<Compass deg={d.aspect} />} />
                    ))}
                    <Opt on={false} onClick={() => { setDir('se_sw'); setPitch('typical'); go(2); }} title="Not sure" sub="Use a typical roof" />
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
                <button type="button" className="est-back" onClick={() => go(step - 1)}>
                  ← Back
                </button>
              ) : (
                <span />
              )}
              {step < STEPS.length - 1 ? (
                <button type="button" className="btn btn-solar" disabled={!canNext} onClick={() => go(step + 1)}>
                  Next
                </button>
              ) : (
                <button type="button" className="btn btn-solar" onClick={() => { setDone(true); go(0); }}>
                  Show my estimate
                </button>
              )}
            </div>
          </div>
        ) : (
          <Result r={r} withBattery={withBattery} inputs={inputs} settings={settings} postcode={postcode} town={yieldData?.town ?? ''} source={yieldData?.source ?? 'fallback'} note={yieldNote} controls={{ shade, setShade, daytime, setDaytime, battery, setBattery, ev, setEv, heatpump, setHeatpump }} onRestart={() => { setDone(false); setStep(0); }} />
        )}
      </div>
    </>
  );
}

type Controls = { shade: Shade; setShade: (s: Shade) => void; daytime: Daytime; setDaytime: (d: Daytime) => void; battery: boolean; setBattery: (b: boolean) => void; ev: boolean; setEv: (b: boolean) => void; heatpump: boolean; setHeatpump: (b: boolean) => void };

function Result({ r, withBattery, inputs, settings, postcode, town, source, note, controls, onRestart }: { r: ReturnType<typeof estimate>; withBattery: ReturnType<typeof estimate> | null; inputs: Inputs; settings: EstimatorSettings; postcode: string; town: string; source: 'pvgis' | 'fallback'; note: string; controls: Controls; onRestart: () => void }) {
  const home = inputs.who === 'home';
  const max = Math.max(...r.monthly, 1);
  const pot = potentialOf(inputs.yieldKwhPerKwp * SHADE_FACTOR[inputs.shade]);
  const usedPct = r.generation > 0 ? (r.selfUsed / r.generation) * 100 : 0;
  return (
    <div className="est-res">
      <div className="est-card est-rating">
        <span className="est-suns" role="img" aria-label={`${pot.suns} out of 5 suns`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <svg key={n} viewBox="0 0 24 24" width="26" height="26" className={n <= pot.suns ? 'on' : ''} aria-hidden="true">
              <circle cx="12" cy="12" r="4.5" fill="currentColor" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                <path key={a} d="M12 2.5 V5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" transform={`rotate(${a} 12 12)`} />
              ))}
            </svg>
          ))}
        </span>
        <h2>{pot.label}</h2>
        <p>
          {pot.line} About <b>{num(inputs.yieldKwhPerKwp * SHADE_FACTOR[inputs.shade])} kWh</b> a year from each kWp of panels{town ? ` in ${town}` : ''}.
        </p>
      </div>
      <div className="est-resgrid">
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
          <p className="est-note">That is a saving of about {gbp(r.saving)} a year: {gbp(r.selfUsed * (settings.importPence / 100))} from power you use yourself and {gbp(r.exported * (settings.exportPence / 100))} from what you export.</p>
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

        <div className="est-card est-pad">
          <h3>What it makes, month by month</h3>
          <svg className="est-chart" viewBox="0 0 320 150" role="img" aria-label="Solar generation by month in kilowatt hours">
            {[0, 0.5, 1].map((t) => (
              <g key={t}>
                <line x1="28" x2="316" y1={118 - t * 100} y2={118 - t * 100} stroke="currentColor" opacity=".12" />
                <text x="24" y={121 - t * 100} textAnchor="end" fontSize="8" fill="currentColor" opacity=".6">
                  {num(max * t)}
                </text>
              </g>
            ))}
            {r.monthly.map((m, i) => {
              const h = (m / max) * 100;
              return (
                <g key={i}>
                  <title>{`${MONTH_NAMES[i]}: ${num(m)} kWh`}</title>
                  <rect x={32 + i * 24} y={118 - h} width="17" height={h} fill="var(--solar)" />
                  <text x={40.5 + i * 24} y="132" textAnchor="middle" fontSize="9" fill="currentColor" opacity=".7">
                    {MONTHS[i]}
                  </text>
                </g>
              );
            })}
            <text x="316" y="147" textAnchor="end" fontSize="7.5" fill="currentColor" opacity=".55">
              kWh per month
            </text>
          </svg>
          <p className="est-note">
            {source === 'pvgis' ? `Based on satellite weather data for ${town || postcode}, for your roof's direction and pitch.` : 'Based on typical South Wales sunshine for your roof (we could not reach the weather data just now).'} Summer makes several times more than winter.
          </p>
        </div>
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
          <span className="sep" />
          {(['none', 'some', 'lots'] as const).map((s) => (
            <button key={s} type="button" className={controls.shade === s ? 'on' : ''} aria-pressed={controls.shade === s} onClick={() => controls.setShade(s)}>
              {s === 'none' ? 'No shade' : s === 'some' ? 'Some shade' : 'Lots of shade'}
            </button>
          ))}
          <span className="sep" />
          {(['out', 'some', 'home'] as const).map((d) => (
            <button key={d} type="button" className={controls.daytime === d ? 'on' : ''} aria-pressed={controls.daytime === d} onClick={() => controls.setDaytime(d)}>
              {d === 'out' ? 'Out all day' : d === 'some' ? 'In some days' : 'Home all day'}
            </button>
          ))}
          <button type="button" className="est-link" onClick={onRestart}>
            Start again
          </button>
        </div>
        {r.needsG99 && <p className="est-note">A system over 3.68 kW needs approval from your network operator (a G99 application). We handle that for you.</p>}
        {note && <p className="est-note">{note}</p>}
      </div>

      <Lead r={r} inputs={inputs} postcode={postcode} />

      <details className="assumptions">
        <summary>What’s behind the numbers</summary>
        <ul>
          <li>Yield: {num(inputs.yieldKwhPerKwp)} kWh per kWp a year for your postcode, roof direction and pitch ({source === 'pvgis' ? 'EU PVGIS data' : 'typical South Wales figure'}), less shading of {inputs.shade === 'none' ? '0' : inputs.shade === 'some' ? '10' : '22'}%.</li>
          <li>Electricity price {settings.importPence}p per kWh; export payment {settings.exportPence}p per kWh (Smart Export Guarantee rates vary from about 4p to 15p).</li>
          <li>You use about {Math.round(r.selfPct * 100)}% of the solar yourself, based on who is home in the day{r.batteryKwh ? ', with the battery' : ''}{inputs.ev ? ', and an electric car' : ''}{inputs.heatpump ? ', and a heat pump' : ''}.</li>
          <li>{home ? 'Home' : 'Business'} price £{(home ? settings.homePerKwp : settings.businessPerKwp).toLocaleString('en-GB')} per kWp installed{r.batteryKwh ? `, plus £${(settings.batteryPerKwh * settings.batteryKwh).toLocaleString('en-GB')} for the battery` : ''}. Savings are shown ±12% and prices ±8%.</li>
          <li>25-year figure: panels lose {settings.degradationPct}% a year and electricity prices are assumed {settings.priceRisePct ? `to rise ${settings.priceRisePct}% a year` : 'not to rise (today’s prices, a cautious view)'}.</li>
          <li>CO₂: about {r.co2Tonnes.toFixed(1)} tonnes a year, at {settings.co2PerKwh} kg per kWh.</li>
        </ul>
      </details>
      <p className="disc est-disc">This is an estimate, not a quote. Your free survey checks your roof, shading, electrics and meter, and gives exact figures. Heliaxis is an MCS-certified installer in South Wales.</p>
    </div>
  );
}

function Lead({ r, inputs, postcode }: { r: ReturnType<typeof estimate>; inputs: Inputs; postcode: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [wa, setWa] = useState(false);
  const [trap, setTrap] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState('');
  async function send() {
    setErr('');
    if (name.trim().length < 2) return setErr('Please add your name.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Please check your email address.');
    if (phone.replace(/\D/g, '').length < 10) return setErr('Please check your phone number.');
    setBusy(true);
    const dir = 'see estimate';
    const message = `Solar estimator: ${r.kwp.toFixed(2)} kWp (${r.panels} panels)${r.batteryKwh ? ` + ${r.batteryKwh} kWh battery` : ''}. About ${num(r.generation)} kWh a year, saving about ${gbp(r.saving)} a year, indicative cost ${gbpRound(r.cost, 100)}, payback about ${yrs(r.paybackYears)} years. Uses ${inputs.usage.kind === 'bill' ? `£${inputs.usage.value}/month` : `${num(inputs.usage.value)} kWh/year`}; ${inputs.shade} shade; daytime: ${inputs.daytime}${inputs.ev ? '; electric car' : ''}${inputs.heatpump ? '; heat pump' : ''} (${dir}).`;
    try {
      const res = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim(), postcode, propertyType: inputs.who, interests: ['Solar PV Installation', ...(inputs.battery ? ['Battery Storage'] : [])], message, source: 'solar-estimator', whatsappOptIn: wa, company_website: trap }),
      });
      const d = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (res.ok && d.success) setSent(name.trim().split(/\s+/)[0]);
      else setErr(d.error || 'Something went wrong. Please try again, or call us on 01633 965205.');
    } catch {
      setErr('Something went wrong. Please try again, or call us on 01633 965205.');
    }
    setBusy(false);
  }
  if (sent) {
    return (
      <div className="est-card est-pad est-lead">
        <h3>Thank you, {sent}</h3>
        <p>We have your estimate and will be in touch within one working day to arrange your free survey. No obligation.</p>
      </div>
    );
  }
  return (
    <div className="est-card est-pad est-lead">
      <h3>Want exact figures? Book your free survey</h3>
      <p className="est-sub">We will look at your roof, shading and electrics and give you a fixed price. No obligation, no pushy sales.</p>
      <div className="est-fields">
        <input className="est-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" aria-label="Your name" />
        <input className="est-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" autoComplete="email" aria-label="Email" />
        <input className="est-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile or phone" type="tel" autoComplete="tel" aria-label="Phone" />
        <input className="est-trap" tabIndex={-1} autoComplete="off" aria-hidden="true" value={trap} onChange={(e) => setTrap(e.target.value)} name="company_website" />
      </div>
      <label className="est-check">
        <input type="checkbox" checked={wa} onChange={(e) => setWa(e.target.checked)} /> OK to message me on WhatsApp about my enquiry
      </label>
      {err && <p className="est-err">{err}</p>}
      <div className="est-leadbtns">
        <button type="button" className="btn btn-solar" disabled={busy} onClick={() => void send()}>
          {busy ? 'Sending…' : 'Send me my estimate and book a survey'}
        </button>
        <Link className="est-link" href={`/book-a-survey?type=solar&postcode=${encodeURIComponent(postcode)}`}>
          Or pick a survey time yourself
        </Link>
      </div>
      <p className="est-fine">We use your details to reply to your enquiry. See our <Link href="/privacy-policy">privacy policy</Link>.</p>
    </div>
  );
}
