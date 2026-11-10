'use client';
/**
 * Personal landing page (spec section 7). Calculator state stays in the
 * browser; nothing about usage is sent until the person books with consent.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { RoofPlan } from '@/components/prospectpv/brand/RoofPlan';
import { Spark, Wordmark } from '@/components/prospectpv/brand/Spark';
import { availableExtras, BEST_TIMES, CONSENT_TEXT, moduleLimit, quote, validateBooking, type BestTime, type FieldErrors } from '@/lib/prospectpv/booking';
import { annualKwh, kwp, money, oneDp, oneLineAddress, pence } from '@/lib/prospectpv/format';
import type { LandingModel } from '@/lib/prospectpv/landing';
import { calculateSavings, type HomePattern } from '@/lib/prospectpv/savings';

function Eyebrow({ children, id }: { children: string; id?: string }) {
  return (
    <div className="pvl-eyebrow" id={id}>
      <Spark size={12} color="currentColor" />
      {children}
    </div>
  );
}

const HOME_OPTIONS: { id: HomePattern; label: string }[] = [
  { id: 'out', label: 'Mostly out' },
  { id: 'some', label: 'Some days' },
  { id: 'all', label: 'Home all day' },
];

export type LandingViewProps = {
  model: LandingModel;
  /** Where the booking is POSTed. */
  bookingEndpoint?: string;
  optOutHref: string;
  /** Shown only when the walk-in lookup is switched on in settings. */
  checkAnotherHref?: string;
};

export function LandingView({ model, bookingEndpoint = '/api/prospectpv/book', optOutHref, checkAnotherHref }: LandingViewProps) {
  const { letter, settings, quoteContext } = model;
  const inputs = settings.inputs;
  const a = settings.assumptions;

  const [usage, setUsage] = useState(inputs.usage_default);
  const [bill, setBill] = useState(inputs.bill_default);
  const [home, setHome] = useState<HomePattern>(inputs.home_default);
  const [mods, setMods] = useState(0);
  const [chosen, setChosen] = useState<string[]>([]);

  const extras = availableExtras(quoteContext);
  const maxMods = moduleLimit(quoteContext);
  const q = quote(quoteContext, mods, chosen);

  const savings = useMemo(() => {
    if (!model.calculatorOn) return null;
    return calculateSavings(
      { usageKwh: usage, monthlyBill: bill, homePattern: home, batteryKwh: q.batteryKwh, diverter: q.diverter },
      {
        generationKwh: letter.estimate.annualKwh,
        segRate: a.seg_rate_gbp_per_kwh!,
        offPeakSpread: a.off_peak_spread_gbp_per_kwh!,
        standingPerYear: a.standing_charge_gbp_per_year!,
        coefficients: settings.coefficients,
      },
      { packagePrice: q.total, extraModules: 0, modulePrice: 0, extrasPrices: [] },
    );
  }, [model.calculatorOn, usage, bill, home, q.batteryKwh, q.diverter, q.total, letter.estimate.annualKwh, a, settings.coefficients]);

  const toggleExtra = (key: string) => setChosen((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));
  const p = letter.package;
  const phone = letter.company.phone;
  const tel = `tel:${phone.replace(/\s/g, '')}`;
  const L = settings.landing;
  const basis = letter.source === 'manual' ? 'Indicative estimate.' : 'Indicative estimate from aerial data.';

  const steps: { title: string; text: string }[] = [
    { title: 'Free survey', text: 'We visit, check your roof, your wiring and where the battery will go. No obligation.' },
    { title: 'MCS estimate and fixed quote', text: 'A full performance estimate for your home, and a fixed price in writing.' },
    model.financeOn
      ? { title: 'Finance, if you want it', text: 'Choose whether to spread the cost. You decide after you’ve seen your quote.' }
      : { title: 'Book your install date', text: 'Pick a date that suits you. We handle the scaffolding and the certificate.' },
    { title: 'Install and handover', text: 'We install, commission and show you how to use it. We’re here afterwards too.' },
  ];

  return (
    <div className="pvl">
      <header className="pvl-hero pv-xh pv-xh--dark">
        <div className="pvl-wrap">
          <div className="pvl-bar">
            <Wordmark size={18} tone="light" logoUrl={letter.images.logoWhite || undefined} />
            <a href={tel}>{phone}</a>
          </div>
          <div className="pvl-herogrid">
            <div className="pvl-herotext">
              <h1>
                Hey <span>{letter.address.line1}</span>!
              </h1>
              <p className="pvl-glad">We’re so glad you got our letter.</p>
              <p className="pvl-lede">
                This page is here so you can get to know us a bit better, and so we can get to know you and your home. Have a
                play with the numbers below. Nothing is saved until you choose to book.
              </p>
              <div className="pvl-cta">
                <a className="pvl-btn pvl-btn--solar" href="#calc">See what you could save</a>
                <a className="pvl-btn pvl-btn--ghost" href="#book">Book a free survey</a>
              </div>
              {checkAnotherHref ? <a className="pvl-link" href={checkAnotherHref}>Not your address? Check another</a> : null}
            </div>
            <section className="pvl-roofhero" aria-labelledby="pvl-roof">
              <Eyebrow>Your roof</Eyebrow>
              <h2 id="pvl-roof">Room for {letter.estimate.panelCount} panels</h2>
              <RoofPlan roof={letter.roof} tone="dark" />
              <div className="pvl-roofstats">
                <div>System<strong>{kwp(letter.estimate.kwp)} kWp</strong></div>
                <div>Generates<strong>~{annualKwh(letter.estimate.annualKwh)} kWh</strong></div>
                <div>Faces<strong>{letter.roof.mainAspect}</strong></div>
              </div>
              <div className="pvl-note">{basis} Layout is illustrative.</div>
            </section>
          </div>
        </div>
      </header>

      <section className="pvl-trust" aria-label="Accreditations">
        <div className="pvl-wrap pvl-trustin">
          <span className="pvl-trusttext">Accredited installers</span>
          {letter.images.accreditations ? (
            <img className="pvl-accred" src={letter.images.accreditations} alt="MCS, RECC and NAPIT accreditations" />
          ) : (
            <div className="pvl-tiles pvl-tiles--row">
              <div><strong>MCS</strong>Certified</div>
              <div><strong>RECC</strong>Member</div>
              {L.review_rating ? <div><strong>{L.review_rating}</strong>Reviews</div> : null}
            </div>
          )}
        </div>
      </section>

      <main>
        <section className="pvl-wrap pvl-how" aria-labelledby="pvl-how">
          <Eyebrow>What happens next</Eyebrow>
          <h2 id="pvl-how">Four steps from here to solar</h2>
          <ol className="pvl-steps">
            {steps.map((s, i) => (
              <li key={s.title}>
                <span className="pvl-stepnum" aria-hidden="true">{i + 1}</span>
                <strong>{s.title}</strong>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="pvl-wrap pvl-split" id="calc">
          <div className="pvl-left">
            {model.calculatorOn ? (
              <section className="pvl-sec" aria-labelledby="pvl-home">
                <Eyebrow>Tell us about your home</Eyebrow>
                <h2 id="pvl-home">How much could you save?</h2>
                <div className="pvl-card pvl-calc">
                  <label className="pvl-field">
                    <span className="pvl-field-head">Electricity use per year<strong>{money(usage)} kWh</strong></span>
                    <input
                      type="range" min={inputs.usage_min} max={inputs.usage_max} step={inputs.usage_step} value={usage}
                      onChange={(e) => setUsage(Number(e.target.value))} aria-valuetext={`${money(usage)} kilowatt hours`}
                    />
                    <small>Find it on your bill or energy app. A typical home uses around {money(inputs.usage_typical_hint)} kWh.</small>
                  </label>
                  <label className="pvl-field">
                    <span className="pvl-field-head">Monthly electricity bill<strong>£{money(bill)}</strong></span>
                    <input
                      type="range" min={inputs.bill_min} max={inputs.bill_max} step={inputs.bill_step} value={bill}
                      onChange={(e) => setBill(Number(e.target.value))} aria-valuetext={`£${money(bill)} a month`}
                    />
                  </label>
                  <div className="pvl-field" role="group" aria-labelledby="pvl-who">
                    <span id="pvl-who">Who’s usually home in the day?</span>
                    <div className="pvl-pills">
                      {HOME_OPTIONS.map((o) => (
                        <button key={o.id} type="button" className="pvl-pill" aria-pressed={home === o.id} onClick={() => setHome(o.id)}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="pvl-sec" aria-labelledby="pvl-build">
              <Eyebrow>Build your system</Eyebrow>
              <h2 id="pvl-build">Your {p.name} package, plus extras</h2>
              <div className="pvl-card pvl-included">
                <div className="pvl-included-head">
                  <strong>Included</strong>
                  <span>£{money(p.priceIncVat)}</span>
                </div>
                <p>
                  {letter.estimate.panelCount} × {p.panelModel} panels · GoodWe ESA all-in-one · {letter.estimate.batteryKwh} kWh
                  battery · {p.monitoringApp} app · MCS certificate
                </p>
              </div>

              {maxMods > 0 ? (
                <div className="pvl-card pvl-stepper">
                  <div>
                    <strong>Bigger battery</strong>
                    <br />
                    <span className="pvl-sub">Add {quoteContext.moduleKwh} kWh modules · £{money(quoteContext.modulePrice!)} each</span>
                  </div>
                  <div className="pvl-stepper-ctrl">
                    <button type="button" onClick={() => setMods((m) => Math.max(0, m - 1))} disabled={mods === 0} aria-label="Remove a battery module">−</button>
                    <output aria-live="polite">{q.batteryKwh} kWh</output>
                    <button type="button" className="pvl-plus" onClick={() => setMods((m) => Math.min(maxMods, m + 1))} disabled={mods >= maxMods} aria-label="Add a battery module">+</button>
                  </div>
                </div>
              ) : null}

              {extras.length ? (
                <div className="pvl-extras">
                  {extras.map((x) => (
                    <label key={x.key} className="pvl-extra">
                      <input type="checkbox" checked={chosen.includes(x.key)} onChange={() => toggleExtra(x.key)} />
                      <span className="pvl-x">
                        <strong>{x.name}</strong>
                        {x.description ? <small>{x.description}</small> : null}
                      </span>
                      <span className="pvl-price">+£{money(x.price ?? 0)}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </section>
          </div>

          <aside className="pvl-right" aria-label="Your estimate">
            <div className="pvl-sticky">
              <section className="pvl-est pv-xh pv-xh--dark" aria-labelledby="pvl-est" aria-live="polite">
                <Eyebrow id="pvl-est">Your estimate</Eyebrow>
                {savings ? (
                  <div className="pvl-est-grid">
                    <div>Saving per year<b className="pvl-gold">£{money(savings.annualSaving)}</b></div>
                    <div>New monthly bill<b>£{money(savings.newMonthlyBill)}</b></div>
                    <div>Export earnings<b className="pvl-sm">£{money(savings.exportEarnings)}/yr</b></div>
                    <div>Payback<b className="pvl-sm">{savings.paybackYears === null ? '–' : `~${oneDp(savings.paybackYears)} yrs`}</b></div>
                  </div>
                ) : null}
                <div className="pvl-total">
                  <span>Total installed</span>
                  <b>£{money(q.total)}</b>
                </div>
                {model.financeOn ? (
                  <p>
                    Pay nothing upfront with a government-backed Warm Homes loan. Some lenders offer 0%.{' '}
                    <strong>{letter.finance.exampleText}</strong>
                  </p>
                ) : (
                  <p>Your free survey confirms the price before you decide.</p>
                )}
                <a className="pvl-btn pvl-btn--solar pvl-btn--block" href="#book">Book my free survey</a>
              </section>
              {savings ? (
                <p className="pvl-note">
                  Indicative estimate. Assumes export at {pence(a.seg_rate_gbp_per_kwh!)}p/kWh, a smart tariff with a{' '}
                  {pence(a.off_peak_spread_gbp_per_kwh!)}p/kWh off-peak saving and a £{money(a.standing_charge_gbp_per_year!)} yearly
                  standing charge. Your survey gives a full MCS performance estimate.
                </p>
              ) : (
                <p className="pvl-note">Your survey includes a full MCS performance estimate of what you could save.</p>
              )}
            </div>
          </aside>
        </div>

        <section className="pvl-wrap pvl-about" aria-labelledby="pvl-us">
          <div>
            <Eyebrow>Get to know us</Eyebrow>
            <h2 id="pvl-us">Local, accredited, and here after install</h2>
            <p className="pvl-story">
              We’re a South Wales solar and battery installer.{L.team_story ? ` ${L.team_story}` : ''}
            </p>
            {L.review_quote ? (
              <blockquote className="pvl-quote">
                “{L.review_quote}”
                {L.review_name ? <small>{L.review_name}</small> : null}
              </blockquote>
            ) : null}
          </div>
          {letter.images.team ? <img className="pvl-photo" src={letter.images.team} alt="The Heliaxis team" /> : null}
        </section>

        <section className="pvl-bookband" id="book" aria-labelledby="pvl-book">
          <div className="pvl-wrap pvl-bookgrid">
            <div className="pvl-bookintro">
              <Eyebrow>Book your free survey</Eyebrow>
              <h2 id="pvl-book">We’ll bring your choices with us</h2>
              <p>Your usage, bill and extras are sent with your booking so the survey starts where you left off.</p>
              <ul className="pvl-ticks">
                <li>Free, and no obligation</li>
                <li>We call at a time that suits you</li>
                <li>Your price is confirmed in writing before you decide</li>
              </ul>
              <p className="pvl-phone">Prefer to talk? Call <a href={tel}>{phone}</a></p>
            </div>
            <BookingForm
              model={model}
              endpoint={bookingEndpoint}
              total={q.total}
              calc={{ usageKwh: usage, monthlyBill: bill, homePattern: home, extraModules: mods, extras: chosen }}
            />
          </div>
        </section>
      </main>

      <footer className="pvl-foot">
        <div className="pvl-wrap">
          {model.financeOn ? <>Finance subject to status. </> : null}
          {settings.company.privacy_url ? <a href={settings.company.privacy_url}>Privacy notice</a> : null}
          {settings.company.privacy_url ? ' · ' : null}
          <a href={optOutHref}>Stop letters to this address</a>
          <br />
          Figures are indicative. A full MCS performance estimate is provided after your free survey.
          {letter.company.registeredDetails ? <> Heliaxis Limited, {letter.company.registeredDetails}</> : null}
        </div>
      </footer>
    </div>
  );
}

type CalcState = { usageKwh: number; monthlyBill: number; homePattern: HomePattern; extraModules: number; extras: string[] };

function BookingForm({ model, endpoint, total, calc }: { model: LandingModel; endpoint: string; total: number; calc: CalcState }) {
  const { letter } = model;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [bestTime, setBestTime] = useState<BestTime | ''>('');
  const [consent, setConsent] = useState(false);
  const [hp, setHp] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const request = { code: model.letterCode, name, phone, email, bestTime, consent, company: hp, ...calc };
    // Same checks the server runs, so people see every problem at once.
    const check = validateBooking(request, model.settings.inputs);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setState('sending');
    setErrors({});
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (res.ok) return setState('done');
      const body = (await res.json().catch(() => ({}))) as { errors?: FieldErrors; message?: string };
      setErrors(body.errors ?? { form: body.message ?? `We couldn’t send your booking. Call us on ${letter.company.phone}.` });
    } catch {
      setErrors({ form: `We couldn’t send your booking. Check your connection, or call us on ${letter.company.phone}.` });
    }
    setState('idle');
  }

  if (state === 'done') {
    return (
      <section className="pvl-sec" aria-live="polite">
        <div className="pvl-done" role="status">
          <h2>Thanks, {name.split(' ')[0]}. Your survey request is in.</h2>
          <p>
            We’ll call you{bestTime && bestTime !== 'Any time' ? ` in the ${bestTime.toLowerCase()}` : ''} to arrange a time.
            Your choices and the £{money(total)} total came with your booking, so the survey starts where you left off.
          </p>
          <p>
            Questions before then? Call us on <a href={`tel:${letter.company.phone.replace(/\s/g, '')}`}>{letter.company.phone}</a>.
          </p>
        </div>
      </section>
    );
  }

  const err = (k: keyof FieldErrors) =>
    errors[k] ? <span className="pvl-err" id={`pvl-err-${k}`}>{errors[k]}</span> : null;
  const inv = (k: keyof FieldErrors) => (errors[k] ? { 'aria-invalid': true, 'aria-describedby': `pvl-err-${k}` } : {});

  return (
    <div className="pvl-formcard">

        <form className="pvl-form" onSubmit={submit} noValidate>
          <label className="pvl-in">
            Property address
            <input type="text" value={oneLineAddress(letter.address)} readOnly />
          </label>
          <div className="pvl-pair">
          <label className="pvl-in">
            Your name
            <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} {...inv('name')} />
            {err('name')}
          </label>
          <label className="pvl-in">
            Phone
            <input type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} {...inv('phone')} />
            {err('phone')}
          </label>
          </div>
          <div className="pvl-pair">
          <label className="pvl-in">
            Email
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} {...inv('email')} />
            {err('email')}
          </label>
          <label className="pvl-in">
            Best time to call
            <select value={bestTime} onChange={(e) => setBestTime(e.target.value as BestTime)} {...inv('bestTime')}>
              <option value="" disabled>Choose a time</option>
              {BEST_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {err('bestTime')}
          </label>
          </div>
          <label className="pvl-hp" aria-hidden="true">
            Company
            <input type="text" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
          </label>
          <label className="pvl-consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} {...inv('consent')} />
            <span>{CONSENT_TEXT}</span>
          </label>
          {err('consent')}
          {errors.form ? <div className="pvl-err" role="alert">{errors.form}</div> : null}
          <button type="submit" className="pvl-submit" disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending…' : `Book my free survey · £${money(total)}`}
          </button>
        </form>
    </div>
  );
}
