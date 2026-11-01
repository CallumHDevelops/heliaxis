'use client';

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { BrandLogo } from '@/components/theme/BrandLogo';
import { WhatsAppIcon, whatsappHref } from '@/components/site/WhatsAppButton';
import type { InteractiveData } from '@/lib/quotes/interactive';
import { arrow, howItWorks, NODE_AT, NODE_LABEL, NODE_SIZE, type Node } from '@/lib/quotes/how-it-works';
import { MCS_NOTE, mcsTable } from '@/lib/quotes/mcs';
import { MCS_EXPLAINED } from '@/lib/quotes/types';
import { paybackWords, recalc, type Basis, type Tariff } from '@/lib/quotes/roi';
import { useEngagement } from '../useEngagement';
import '../portal.css';
import './proposal.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const n0 = (x: number) => Math.round(x).toLocaleString('en-GB');
const gbp = (x: number) => `${x < 0 ? '−' : ''}£${n0(Math.abs(x))}`;
const kw = (x: number) => `${Math.round(x * 100) / 100}`;

/**
 * The proposal as a web page: the design, the equipment and the performance, and a place to try your own energy prices (one price or a
 * time-of-use tariff, the standing charge, what you are paid for export and how fast prices rise) and see the saving, payback and return
 * worked again from the design software's own energy figures. Nothing is saved: changing a price never changes the quote.
 */
export function InteractiveProposal({ data, back }: { data: InteractiveData; back?: { href: string; label: string } }) {
  const o = data.option;
  const gen = o.monthlyKwh?.length === 12 ? o.monthlyKwh : null;
  const use = o.monthlyUseKwh?.length === 12 ? o.monthlyUseKwh : null;

  // What the design software assumed: the starting point, and what "reset" goes back to.
  const proposalTariff: Tariff = useMemo(() => {
    const day = o.tariffDayPence ?? 30;
    const night = o.tariffNightPence ?? day;
    const tou = night !== day;
    return { mode: tou ? 'tou' : 'flat', flatPence: day, dayPence: day, eveningPence: day, nightPence: night, standingPencePerDay: o.standingPencePerDay ?? 0, exportPence: o.exportPence ?? 15, risePct: o.priceRisePct ?? 7 };
  }, [o]);
  const basis: Basis | null = useMemo(() => {
    const generation = o.annualGenerationKwh;
    const consumption = o.consumptionKwh;
    if (!generation || !consumption) return null;
    const selfPv = o.selfUsePvKwh ?? (o.selfSufficiencyPvOnlyPct ? (consumption * o.selfSufficiencyPvOnlyPct) / 100 : undefined);
    const selfBat = o.selfUseBatteryKwh ?? (o.selfSufficiencyPct ? (consumption * o.selfSufficiencyPct) / 100 : undefined);
    if (!selfPv && !selfBat) return null;
    const hasBattery = !!(o.batteryUsableKwh && selfPv && selfBat && selfBat > selfPv);
    return { generationKwh: generation, consumptionKwh: consumption, selfPvKwh: selfPv ?? selfBat ?? 0, selfWithBatteryKwh: selfBat ?? selfPv ?? 0, hasBattery, degradationPct: o.degradationPct ?? 0.4, discountPct: o.discountPct ?? 6.75, years: o.cumulativeGbp?.length ?? 20, priceGbp: data.priceGbp, proposalSavingGbp: o.annualSavingsGbp, proposalTariff };
  }, [o, data.priceGbp, proposalTariff]);

  const [t, setT] = useState<Tariff>(proposalTariff);
  const touched = useRef(false);
  const edit = (patch: Partial<Tariff>) => {
    setT((cur) => ({ ...cur, ...patch }));
    if (!touched.current && data.token) {
      touched.current = true;
      void fetch(`/api/my/${data.token}/event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'prices_edited' }), keepalive: true }).catch(() => null);
    }
  };
  useEffect(() => {
    if (data.token) void fetch(`/api/my/${data.token}/event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'proposal_opened' }), keepalive: true }).catch(() => null);
  }, [data.token]);

  useEngagement(data.token ?? '', !!data.token);
  const r = useMemo(() => (basis ? recalc(basis, t) : null), [basis, t]);
  const theirs = useMemo(() => (basis ? recalc(basis, proposalTariff) : null), [basis, proposalTariff]);
  const changed = JSON.stringify(t) !== JSON.stringify(proposalTariff);
  const money = data.showFinancials && !!r && !!basis;
  const contents: { id: string; label: string }[] = [
    ...(tilesPresent(o) ? [{ id: 'design', label: 'Your system design' }] : []),
    ...(o.panelCount || o.inverterModel || o.batteryModel ? [{ id: 'setup', label: 'Your Solar Setup' }] : []),
    ...(o.monthlyKwh?.length === 12 ? [{ id: 'performance', label: 'Expected performance' }] : []),
    { id: 'howitworks', label: 'How your system works' },
    ...(mcsTable(o).length ? [{ id: 'mcs', label: 'MCS performance estimate' }] : []),
    ...(data.pictures.sunpath ? [{ id: 'sunpath', label: 'Sun path and shading' }] : []),
    ...(money ? [{ id: 'prices', label: 'Your energy prices and savings' }] : []),
    ...(data.about ? [{ id: 'about', label: 'About Heliaxis' }] : []),
    ...(data.survey ? [{ id: 'survey', label: 'Structural requirements and survey' }] : []),
  ];

  const tiles: { v: string; l: string }[] = [
    ...(o.systemKwp ? [{ v: `${kw(o.systemKwp)} kWp`, l: 'System size' }] : []),
    ...(o.annualGenerationKwh ? [{ v: `${n0(o.annualGenerationKwh)} kWh`, l: 'Generated a year' }] : []),
    ...(o.batteryUsableKwh ? [{ v: `${kw(o.batteryUsableKwh)} kWh`, l: 'Battery storage' }] : []),
    ...(o.selfSufficiencyPct || o.selfSufficiencyPvOnlyPct ? [{ v: `${Math.round(o.selfSufficiencyPct ?? o.selfSufficiencyPvOnlyPct ?? 0)}%`, l: 'Self-sufficient' }] : []),
  ];
  const products = [
    ...(o.panelCount || o.panelModel ? [{ kind: 'Solar panels', title: [o.panelBrand, o.panelModel].filter(Boolean).join(' '), spec: [o.panelCount ? `${o.panelCount}${o.panelWatts ? ` × ${o.panelWatts} W` : ''}` : '', o.systemKwp ? `${kw(o.systemKwp)} kWp` : ''].filter(Boolean).join('  =  '), warranty: [o.panelProductWarrantyYears ? `${o.panelProductWarrantyYears}-yr product` : '', o.panelPerformanceWarrantyYears ? `${o.panelPerformanceWarrantyYears}-yr output` : ''].filter(Boolean).join(' · '), img: undefined as string | undefined }] : []),
    ...(o.inverterModel ? [{ kind: 'Inverter', title: [o.inverterBrand, o.inverterModel].filter(Boolean).join(' '), spec: o.inverterKw ? `${kw(o.inverterKw)} kW inverter power` : '', warranty: o.inverterWarrantyYears ? `${o.inverterWarrantyYears}-year warranty` : '', img: data.pictures.inverter }] : []),
    ...(o.batteryModel || o.batteryUsableKwh ? [{ kind: 'Battery storage', title: [o.batteryModules && o.batteryModules > 1 ? `${o.batteryModules} ×` : '', o.batteryBrand, o.batteryModel].filter(Boolean).join(' '), spec: o.batteryUsableKwh ? `${kw(o.batteryUsableKwh)} kWh usable` : '', warranty: o.batteryWarrantyYears ? `${o.batteryWarrantyYears}-year warranty` : '', img: data.pictures.battery }] : []),
  ];

  // The way in: a greeting, the introduction, and the chance to confirm their energy costs before the proposal opens.
  const [stage, setStage] = useState<'welcome' | 'tariff' | 'proposal'>('welcome');
  const greeting = useSyncExternalStore(
    () => () => undefined,
    () => {
      const h = new Date().getHours();
      return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    },
    () => 'Hello'
  );
  useEffect(() => {
    if (stage === 'proposal') return;
    const was = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = was;
    };
  }, [stage]);

  // Where the reader has got to: the section in view, and how far through the whole proposal they are.
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState('');
  const [progress, setProgress] = useState(0);
  const ids = contents.map((c) => c.id).join('|');
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const list = ids ? ids.split('|') : [];
    const update = () => {
      const inner = getComputedStyle(sc).overflowY === 'auto' && sc.scrollHeight > sc.clientHeight + 1;
      const top = inner ? sc.getBoundingClientRect().top : 0;
      let cur = list[0] ?? '';
      for (const id of list) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - top <= 140) cur = id;
      }
      const max = inner ? sc.scrollHeight - sc.clientHeight : document.documentElement.scrollHeight - window.innerHeight;
      const pos = inner ? sc.scrollTop : window.scrollY;
      if (max > 0 && pos >= max - 4) cur = list[list.length - 1] ?? cur;
      setActive(cur);
      setProgress(max > 0 ? Math.min(1, Math.max(0, pos / max)) : 0);
    };
    update();
    sc.addEventListener('scroll', update, { passive: true });
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      sc.removeEventListener('scroll', update);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [ids]);
  const jump = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    if (!sheet) return;
    const was = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = was;
    };
  }, [sheet]);
  const activeAt = Math.max(0, contents.findIndex((c) => c.id === active));
  const intro = introBody(data.intro);

  // Staff preview has no customer link: the buttons show, and say so when pressed.
  const acceptHref = data.token ? `/my/${data.token}?accept=1` : '#accept';
  const [toast, setToast] = useState('');
  const onAccept = (e: React.MouseEvent) => {
    if (data.token) return;
    e.preventDefault();
    setToast('Preview only: on the customer’s own link this opens the signing box.');
    setTimeout(() => setToast(''), 3500);
  };
  const waText = `Hi Heliaxis, I have a question about my proposal ${data.quoteNumber}`;
  const sideBody = (
    <>
      {acceptHref && (
        <a className="pt-btn ip-accept" href={acceptHref} onClick={onAccept}>
          Accept this quote · £{n0(data.priceGbp)}
        </a>
      )}
      <nav className="pt-card ip-toc" aria-label="Contents">
        <h2>Contents</h2>
        <div className="ip-bar-top" role="progressbar" aria-label="How far through your proposal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <i style={{ width: `${progress * 100}%` }} />
        </div>
        <ul>
          {contents.map((c, i) => (
            <li key={c.id} className={c.id === active ? 'on' : i < activeAt ? 'done' : ''}>
              <a
                href={`#${c.id}`}
                onClick={(e) => {
                  setSheet(false);
                  jump(c.id)(e);
                }}
                aria-current={c.id === active ? 'true' : undefined}
              >
                {c.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="ip-accred-side">
        <small>Accredited and certified</small>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/heliaxis-accreditations-light.png" alt="MCS Certified, TrustMark, NAPIT, RECC and SSIP" />
      </div>
      <div className="pt-card ip-contact">
        <h2>Questions? Talk to us</h2>
        <a className="pt-btn ip-wa" href={whatsappHref(waText)} target="_blank" rel="noopener noreferrer">
          <WhatsAppIcon size={18} /> WhatsApp us
        </a>
        <div className="pt-row">
          <a className="pt-btn ghost" href="tel:01633965205">
            Call us
          </a>
          <a className="pt-btn ghost" href={`mailto:hello@heliaxis.co.uk?subject=${encodeURIComponent(`My proposal ${data.quoteNumber}`)}`}>
            Email us
          </a>
        </div>
      </div>
    </>
  );

  return (
    <div className="pt ip">
      {stage !== 'proposal' && (
        <div className="ip-gate" role="dialog" aria-modal="true" aria-label="Welcome">
          <div className={`ip-gate-card${stage === 'welcome' ? ' welcome' : ''}`}>
            <BrandLogo width={128} />
            {stage === 'welcome' ? (
              <>
                <h1>
                  {greeting} {data.first},
                </h1>
                {intro.map((p, i) => (
                  <p key={p} className={i > 0 ? 'ip-more' : undefined}>
                    {p}
                  </p>
                ))}
                {money ? (
                  <>
                    <p>We have added your estimated energy costs, but you can confirm them by hitting the button below, or press skip to get straight into your proposal.</p>
                    <ul className="ip-assume">
                      <li>{proposalTariff.mode === 'flat' ? `${proposalTariff.flatPence}p per kWh` : `${proposalTariff.dayPence}p day, ${proposalTariff.nightPence}p night per kWh`}</li>
                      <li>{proposalTariff.standingPencePerDay}p a day standing charge</li>
                      <li>{proposalTariff.exportPence}p per kWh for power you export</li>
                    </ul>
                    <div className="pt-row">
                      <button type="button" className="pt-btn ghost" onClick={() => setStage('proposal')}>
                        Skip
                      </button>
                      <button type="button" className="pt-btn" onClick={() => setStage('tariff')}>
                        Enter my tariff
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="pt-row">
                    <button type="button" className="pt-btn" onClick={() => setStage('proposal')}>
                      View my proposal
                    </button>
                  </div>
                )}
              </>
            ) : (
              r &&
              basis &&
              theirs && (
                <>
                  <h1>Your energy costs</h1>
                  <p className="pt-muted">Change these to match your bill and the figures update straight away. Nothing here changes your quote.</p>
                  <TariffEditor t={t} edit={edit} />
                  <div className="ip-tiles ip-results" aria-live="polite">
                    <Result v={gbp(r.yearOneGbp)} l="Saved in year one" was={changed ? gbp(theirs.yearOneGbp) : null} />
                    <Result v={paybackWords(r.paybackYears)} l="Payback" was={changed ? paybackWords(theirs.paybackYears) : null} />
                  </div>
                  <div className="pt-row">
                    {changed && (
                      <button type="button" className="pt-btn ghost" onClick={() => setT(proposalTariff)}>
                        Back to the design’s prices
                      </button>
                    )}
                    <button type="button" className="pt-btn" onClick={() => setStage('proposal')}>
                      Show my proposal
                    </button>
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}
      <header className="pt-head">
        <BrandLogo width={128} />
        <span className="ip-head-right">
          <span className="pt-head-tag">Your proposal · {data.quoteNumber}</span>
          {acceptHref && (
            <a className="pt-btn ip-accept-head" href={acceptHref} onClick={onAccept}>
              Accept quote
            </a>
          )}
        </span>
      </header>
      <div className="ip-shell">
        <aside className="ip-side">
          {back && (
            <a className="ip-back" href={back.href}>
              ← {back.label}
            </a>
          )}
          <div className="ip-side-body">{sideBody}</div>
        </aside>

        <div className="ip-scroll" ref={scroller}>
          <main className="pt-main ip-main">
            <section className="pt-hello">
              <h1>
                {greeting} {data.first}
              </h1>
              <p>
                {data.title} · {data.quoteNumber}
              </p>
            </section>

        {tiles.length > 0 && (
          <div className="ip-tiles" id="design" data-track="design">
            {tiles.map((x) => (
              <div key={x.l} className="ip-tile">
                <b>{x.v}</b>
                <small>{x.l}</small>
              </div>
            ))}
          </div>
        )}

        {data.pictures.roof && (
          <figure className="pt-card ip-roof">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.pictures.roof} alt="Your roof with the proposed panels" />
            <figcaption>Your roof with the proposed panels. Indicative: the final layout is confirmed at survey.</figcaption>
          </figure>
        )}

        {products.length > 0 && (
          <section className="pt-card" id="setup" data-track="setup">
            <h2>Your Solar Setup</h2>
            <div className="ip-products">
              {products.map((p) => (
                <div key={p.kind} className="ip-product">
                  <div className="ip-product-img">
                    {p.img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.img} alt={p.title} />
                    ) : (
                      <svg viewBox="0 0 60 80" aria-hidden="true">
                        <rect x="2" y="2" width="56" height="76" fill="#212b45" stroke="#8a8a8a" />
                        {[1, 2, 3].map((i) => (
                          <line key={`v${i}`} x1={2 + i * 14} y1="2" x2={2 + i * 14} y2="78" stroke="#59637b" strokeWidth="0.5" />
                        ))}
                        {[1, 2, 3, 4, 5].map((i) => (
                          <line key={`h${i}`} x1="2" y1={2 + i * 12.67} x2="58" y2={2 + i * 12.67} stroke="#59637b" strokeWidth="0.5" />
                        ))}
                      </svg>
                    )}
                  </div>
                  <div className="ip-product-body">
                    <small>{p.kind}</small>
                    <b>{p.title}</b>
                    {p.spec && <span>{p.spec}</span>}
                    {p.warranty && <em>{p.warranty}</em>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {gen && (
          <section className="pt-card" id="performance" data-track="performance">
            <h2>Expected performance</h2>
            <p className="pt-muted">What your system should generate each month, against the electricity you use.</p>
            <GenerationChart gen={gen} use={use} />
            {(o.selfSufficiencyPvOnlyPct || o.selfSufficiencyPct) && (
              <div className="ip-cover">
                {o.selfSufficiencyPvOnlyPct ? <Cover label="Panels only" pct={o.selfSufficiencyPvOnlyPct} /> : null}
                {o.selfSufficiencyPct ? <Cover label="Panels with the battery" pct={o.selfSufficiencyPct} strong /> : null}
              </div>
            )}
          </section>
        )}

        {(products.length > 0 || gen) && (
          <section className="pt-card" id="howitworks" data-track="howitworks">
            <h2>How your system works</h2>
            <p className="pt-muted">Where your electricity comes from and goes, through the day.</p>
            <FlowDiagram states={howItWorks(!!(o.batteryUsableKwh || o.batteryModel))} hasBattery={!!(o.batteryUsableKwh || o.batteryModel)} />
          </section>
        )}

        {mcsTable(o).length > 0 && (
          <section className="pt-card" id="mcs" data-track="mcs">
            <h2>MCS performance estimate: your solar installation</h2>
            <p className="pt-muted">Calculated for your property, {data.first ? `${data.first}, ` : ''}so these figures are for your roof and your system, not a standard example.</p>
            {mcsTable(o).map((sec) => (
              <table key={sec.title} className="ip-mcs">
                <caption>{sec.title}</caption>
                <tbody>
                  {sec.rows.map((r) => (
                    <tr key={r.label}>
                      <th scope="row">{r.label}</th>
                      <td>{r.value}</td>
                      <td>{r.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
            <p className="pt-muted ip-note">{MCS_NOTE}</p>
          </section>
        )}

        {data.pictures.sunpath && (
          <section className="pt-card" id="sunpath" data-track="sunpath">
            <h2>Sun path and shading</h2>
            <div className="ip-sun">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.pictures.sunpath} alt="Sun path and shading diagram" />
              <div>
                <h3>How to read this</h3>
                <p>This diagram shows where the sun is in the sky through the year, as seen from the middle of your panels.</p>
                <p>Left to right is east, through south in the middle, to west. Height is how high the sun climbs: the top curve is the summer sun and the bottom curve the winter sun.</p>
                <p>Green areas are sunlight reaching your panels. Red areas are where something blocks the sun. The grey bars along the bottom are the outline of buildings, trees or hills on your skyline.</p>
                {o.shadeFactor && o.shadeFactor > 0 && o.shadeFactor <= 1 ? (
                  <p>
                    In your design about {Math.round((1 - o.shadeFactor) * 100)}% of the sunlight is lost to shading (a shade factor of {o.shadeFactor}). The rest reaches the panels.
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        )}

        {money && r && basis && theirs && (
          <section className="pt-card ip-money" id="prices" data-track="prices">
            <h2>Your energy prices and savings</h2>
            <p className="pt-muted">
              Worked from {t.mode === 'flat' ? `${t.flatPence}p per kWh` : `${t.dayPence}p day, ${t.eveningPence}p evening and ${t.nightPence}p night per kWh`}, a {t.standingPencePerDay}p a day standing charge, {t.exportPence}p per kWh for export and a {t.risePct}% yearly price rise
              {changed ? ', as you entered them' : ', the design’s own assumptions'}.
            </p>
            <div className="pt-row">
              <button type="button" className="pt-btn ghost" onClick={() => setStage('tariff')}>
                Change my prices
              </button>
              {changed && (
                <button type="button" className="pt-btn ghost" onClick={() => setT(proposalTariff)}>
                  Back to the design’s prices
                </button>
              )}
            </div>
            <div className="ip-tiles ip-results" aria-live="polite">
              <Result v={gbp(r.yearOneGbp)} l="Saved in year one" was={changed ? gbp(theirs.yearOneGbp) : null} />
              <Result v={paybackWords(r.paybackYears)} l="Payback" was={changed ? paybackWords(theirs.paybackYears) : null} />
              <Result v={gbp(r.netSavingsGbp)} l={`Net saving over ${basis.years} years`} was={changed ? gbp(theirs.netSavingsGbp) : null} />
              <Result v={`${Math.round(r.roiPct)}%`} l="Return on investment" was={changed ? `${Math.round(theirs.roiPct)}%` : null} />
              <Result v={r.irrPct === null ? '–' : `${r.irrPct.toFixed(1)}%`} l="Rate of return (IRR)" was={changed && theirs.irrPct !== null ? `${theirs.irrPct.toFixed(1)}%` : null} />
              <Result v={gbp(r.npvGbp)} l={`Net present value (${basis.discountPct}%)`} was={changed ? gbp(theirs.npvGbp) : null} />
            </div>
            <p className="ip-bills">
              Your yearly electricity bill: <b>{gbp(r.billBeforeGbp)}</b> without solar, <b>{gbp(r.billAfterGbp)}</b> with it (standing charge included).
            </p>
            <PaybackChart price={basis.priceGbp} cum={r.cumulative} firstYear={o.firstYear ?? new Date().getFullYear()} payback={r.paybackYears} />
            <p className="pt-muted ip-note">
              {r.matched ? 'Worked from the design software’s own energy figures and matched to its first-year saving at its prices, so unchanged prices give its numbers.' : 'Worked from the design software’s energy figures.'} It is an estimate from yearly energy flows, not a half-hourly simulation, and prices can go down as well as up.
            </p>
          </section>
        )}

        {data.about && (
          <section className="pt-card ip-about" id="about" data-track="about">
            <h2>About Heliaxis</h2>
            <div className="ip-about-body">
              <figure className="ip-about-photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/heliaxis-about-callum.jpg" alt="Callum Hiscott, Managing Director of Heliaxis" />
                <figcaption>
                  <b>Callum Hiscott</b>
                  <span>Managing Director, Heliaxis</span>
                </figcaption>
              </figure>
              <div className="ip-about-text">
                {data.about.split(/\n{2,}/).map((p, i) =>
                  /^I believed it could be done better/i.test(p) ? (
                    <blockquote key={p}>{p}</blockquote>
                  ) : (
                    <p key={p} className={i === 0 ? 'lead' : undefined}>
                      {p}
                    </p>
                  )
                )}
              </div>
            </div>
            <div className="ip-mcs-box">
              <h3>What MCS certification means</h3>
              <p>{MCS_EXPLAINED}</p>
            </div>
          </section>
        )}

        {data.survey && (
          <section className="pt-card" id="survey" data-track="survey">
            <h2>Structural requirements and survey</h2>
            {data.survey.split(/\n{2,}/).map((p) => (
              <p key={p}>{p}</p>
            ))}
          </section>
        )}

        {acceptHref && (
          <section className="pt-card ip-go" id="accept">
            <h2>Ready to go ahead?</h2>
            <p className="pt-muted">Accept the quote and choose your installation dates. You can still message us with any question first.</p>
            <div className="pt-row">
              <a className="pt-btn" href={acceptHref} onClick={onAccept}>
                Accept this quote · £{n0(data.priceGbp)}
              </a>
              <a className="pt-btn ghost" href={whatsappHref(waText)} target="_blank" rel="noopener noreferrer">
                Ask a question first
              </a>
            </div>
          </section>
        )}

        <p className="pt-foot ip-foot">
          This system has been designed in third-party design software (OpenSolar). The key data points in this proposal have been extracted from that design and presented fairly. Figures are estimates, not guarantees. This proposal is subject to the terms and conditions in your quote.
        </p>
          </main>
        </div>
      </div>
      <div className="ip-bar" role="toolbar" aria-label="Proposal menu">
        <button type="button" onClick={() => setSheet(true)} aria-haspopup="dialog">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          <span>Menu</span>
        </button>
        {acceptHref && (
          <a className="wa" href={acceptHref} onClick={onAccept}>
            <span>Accept</span>
          </a>
        )}
        <a href={whatsappHref(waText)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp us">
          <WhatsAppIcon size={18} />
          <span>WhatsApp</span>
        </a>
        <a href="tel:01633965205" aria-label="Call us">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6.5 3h3l1.5 5-2 1.5a12 12 0 0 0 5 5l1.5-2 5 1.5v3a2 2 0 0 1-2 2A17 17 0 0 1 4.5 5a2 2 0 0 1 2-2Z" />
          </svg>
          <span>Call</span>
        </a>
      </div>
      {toast && (
        <div className="ip-toast" role="status">
          {toast}
        </div>
      )}
      {sheet && (
        <div className="ip-sheet" role="dialog" aria-modal="true" aria-label="Contents" onClick={() => setSheet(false)}>
          <div className="ip-sheet-panel" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="pt-btn ghost ip-sheet-close" onClick={() => setSheet(false)}>
              Close
            </button>
            {sideBody}
          </div>
        </div>
      )}
    </div>
  );
}

/** The introduction without its greeting and sign-off (the page greets them itself). */
function introBody(intro: string | null): string[] {
  if (!intro) return [];
  const paras = intro.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paras[0] && /^(hi|hello|dear)\b[^.!?]{0,40},?$/i.test(paras[0])) paras.shift();
  else if (paras[0]) paras[0] = paras[0].replace(/^(hi|hello|dear)\s+[^,.\n]{1,40},\s*/i, '');
  while (paras.length && /^(yours|kind regards|best regards|regards|many thanks|thanks|heliaxis$)/i.test(paras[paras.length - 1])) paras.pop();
  if (paras[0]) paras[0] = paras[0].charAt(0).toUpperCase() + paras[0].slice(1);
  return paras;
}

function TariffEditor({ t, edit }: { t: Tariff; edit: (patch: Partial<Tariff>) => void }) {
  return (
    <>
      <div className="ip-seg" role="group" aria-label="How you are charged">
        <button type="button" className={t.mode === 'flat' ? 'on' : ''} aria-pressed={t.mode === 'flat'} onClick={() => edit({ mode: 'flat' })}>
          One price all day
        </button>
        <button type="button" className={t.mode === 'tou' ? 'on' : ''} aria-pressed={t.mode === 'tou'} onClick={() => edit({ mode: 'tou' })}>
          Time of use tariff
        </button>
      </div>
      <div className="ip-fields">
        {t.mode === 'flat' ? (
          <Field label="Unit price (pence per kWh)" value={t.flatPence} onChange={(v) => edit({ flatPence: v, dayPence: v, eveningPence: v, nightPence: v })} />
        ) : (
          <>
            <Field label="Day rate (pence per kWh)" hint="What your panels use directly is worth this." value={t.dayPence} onChange={(v) => edit({ dayPence: v })} />
            <Field label="Evening rate (pence per kWh)" hint="What your battery supplies is worth this." value={t.eveningPence} onChange={(v) => edit({ eveningPence: v })} />
            <Field label="Night rate (pence per kWh)" hint="Shown for your bill; night-time battery charging isn’t modelled." value={t.nightPence} onChange={(v) => edit({ nightPence: v })} />
          </>
        )}
        <Field label="Standing charge (pence per day)" hint="The same with or without solar, so it changes your bills, not your saving." value={t.standingPencePerDay} onChange={(v) => edit({ standingPencePerDay: v })} />
        <Field label="Paid for export (pence per kWh)" hint="What your supplier pays for power sent to the grid." value={t.exportPence} onChange={(v) => edit({ exportPence: v })} />
        <Field label="Yearly price rise (%)" hint="How fast you expect electricity to get dearer." value={t.risePct} onChange={(v) => edit({ risePct: v })} />
      </div>
    </>
  );
}

function tilesPresent(o: InteractiveData['option']) {
  return !!(o.systemKwp || o.annualGenerationKwh || o.batteryUsableKwh || o.selfSufficiencyPct || o.selfSufficiencyPvOnlyPct);
}

function Field({ label, hint, value, onChange }: { label: string; hint?: string; value: number; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div className="ip-field">
      <label className="pt-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="pt-input" type="number" inputMode="decimal" step="0.1" min="0" value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
      {hint && <small>{hint}</small>}
    </div>
  );
}

function Result({ v, l, was }: { v: string; l: string; was: string | null }) {
  return (
    <div className="ip-tile">
      <b>{v}</b>
      <small>{l}</small>
      {was && <em>design’s figure: {was}</em>}
    </div>
  );
}

function Cover({ label, pct, strong }: { label: string; pct: number; strong?: boolean }) {
  return (
    <div className="ip-bar">
      <span>
        <b>{label}</b>
        <b>{Math.round(pct * 10) / 10}%</b>
      </span>
      <i>
        <u className={strong ? 'strong' : ''} style={{ width: `${Math.min(100, pct)}%` }} />
      </i>
    </div>
  );
}

/** Whether the phone is held upright (so a full-screen chart is turned on its side for reading). */
function usePortrait() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia('(orientation: portrait)');
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia('(orientation: portrait)').matches,
    () => false
  );
}

/** A chart with an Expand button (on phones): opens it full screen, turned sideways if the phone is upright, so it can be read. */
function ChartFrame({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const portrait = usePortrait();
  useEffect(() => {
    if (!open) return;
    const was = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = was;
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <>
      <button type="button" className="pt-btn ghost ip-expand" onClick={() => setOpen(true)}>
        Expand chart
      </button>
      {children}
      {open && (
        <div className={`ip-full${portrait ? ' rot' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
          <div className="ip-full-inner">
            <div className="ip-full-head">
              <b>{title}</b>
              <button type="button" className="pt-btn ghost" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <div className="ip-full-chart">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function GenerationChart({ gen, use }: { gen: number[]; use: number[] | null }) {
  return (
    <ChartFrame title="Expected performance">
      <GenerationPlot gen={gen} use={use} />
    </ChartFrame>
  );
}

function GenerationPlot({ gen, use }: { gen: number[]; use: number[] | null }) {
  const [hi, setHi] = useState<number | null>(null);
  const W = 600;
  const H = 210;
  const base = H - 24;
  const top = 18;
  const max = Math.max(...gen, ...(use ?? []), 1);
  const y = (v: number) => base - ((base - top) * v) / max;
  const col = W / 12;
  const diff = hi !== null && use ? gen[hi] - use[hi] : null;
  return (
    <div className="ip-chartwrap" onMouseLeave={() => setHi(null)}>
      <svg className="ip-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly generation against use. Hover or tap a month for its figures.">
        <line x1="0" y1={base} x2={W} y2={base} stroke="currentColor" strokeOpacity="0.2" />
        {gen.map((v, i) => (
          <g key={i}>
            {hi === i && <rect x={i * col} y={top - 6} width={col} height={base - top + 6} fill="#F8BC1E" opacity="0.16" />}
            <rect x={i * col + col * 0.2} y={y(v)} width={col * 0.6} height={Math.max(1, base - y(v))} fill={hi === i ? '#C77F04' : '#F8BC1E'} />
            <text x={i * col + col / 2} y={base + 14} textAnchor="middle" fontSize="10" fill="currentColor" opacity={hi === i ? 1 : 0.6} fontWeight={hi === i ? 700 : 400}>
              {MONTHS[i]}
            </text>
            <text x={i * col + col / 2} y={y(v) - 4} textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.75">
              {n0(v)}
            </text>
          </g>
        ))}
        {use && (
          <>
            <polyline points={use.map((v, i) => `${i * col + col / 2},${y(v)}`).join(' ')} fill="none" stroke="#211F18" strokeWidth="2" strokeLinejoin="round" />
            {use.map((v, i) => (
              <rect key={i} x={i * col + col / 2 - (hi === i ? 4 : 2.5)} y={y(v) - (hi === i ? 4 : 2.5)} width={hi === i ? 8 : 5} height={hi === i ? 8 : 5} fill="#211F18" />
            ))}
          </>
        )}
        <rect x="0" y="0" width="9" height="7" fill="#F8BC1E" />
        <text x="14" y="7" fontSize="10" fill="currentColor">
          Generated
        </text>
        {use && (
          <>
            <line x1="80" y1="4" x2="96" y2="4" stroke="#211F18" strokeWidth="2" />
            <text x="100" y="7" fontSize="10" fill="currentColor">
              Your use
            </text>
          </>
        )}
        {gen.map((_, i) => (
          <rect key={i} className="ip-hit" x={i * col} y="0" width={col} height={H} fill="transparent" tabIndex={0} role="button" aria-label={`${MONTHS_LONG[i]}: generated ${n0(gen[i])} kWh${use ? `, you use ${n0(use[i])} kWh` : ''}`} onMouseEnter={() => setHi(i)} onFocus={() => setHi(i)} onBlur={() => setHi(null)} onClick={() => setHi(i)} />
        ))}
      </svg>
      {hi !== null && (
        <div className="ip-tip" style={{ left: `${Math.min(84, Math.max(16, ((hi + 0.5) / 12) * 100))}%` }} role="status">
          <b>{MONTHS_LONG[hi]}</b>
          <span>
            <i className="g" /> Generated <b>{n0(gen[hi])} kWh</b>
          </span>
          {use && (
            <span>
              <i className="u" /> You use <b>{n0(use[hi])} kWh</b>
            </span>
          )}
          {diff !== null && <em>{diff >= 0 ? `${n0(diff)} kWh more than you use` : `${n0(-diff)} kWh less than you use`}</em>}
        </div>
      )}
    </div>
  );
}

function PaybackChart({ cum, firstYear, payback, price }: { cum: number[]; firstYear: number; payback: number | null; price: number }) {
  const [hi, setHi] = useState<number | null>(null);
  const [sel, setSel] = useState(0);
  const W = 600;
  const H = 230;
  const left = 44;
  const top = 26;
  const base = H - 26;
  const max = Math.max(...cum, 0);
  const min = Math.min(...cum, 0);
  const span = max - min || 1;
  const y = (v: number) => base - ((base - top) * (v - min)) / span;
  const col = (W - left) / cum.length;
  const zero = y(0);
  const ticks = [min, 0, max].filter((v, i, a) => a.indexOf(v) === i);
  const soFar = sel > 0 ? cum[sel - 1] + price : 0;
  const thisYear = sel > 0 ? cum[sel] - cum[sel - 1] : cum[0] + price;
  const plot = (
    <div className="ip-chartwrap" onMouseLeave={() => setHi(null)}>
    <svg className="ip-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cumulative net saving by year">
      <text x="0" y="10" fontSize="11" fontWeight="700" fill="currentColor">
        Cumulative net saving, year by year
      </text>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={left} y1={y(v)} x2={W} y2={y(v)} stroke="currentColor" strokeOpacity={v === 0 ? 0.7 : 0.15} />
          <text x={left - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fill="currentColor" opacity="0.65">
            {v === 0 ? '£0' : `${v < 0 ? '−' : ''}£${n0(Math.abs(v) / 1000)}k`}
          </text>
        </g>
      ))}
      {cum.map((v, i) => (
        <g key={i}>
          <rect x={left + i * col + col * 0.17} y={Math.min(y(v), zero)} width={col * 0.66} height={Math.max(1, Math.abs(y(v) - zero))} fill={hi === i ? '#C77F04' : v >= 0 ? '#F8BC1E' : '#c9c4b8'} stroke={sel === i ? '#211F18' : 'none'} strokeWidth="1.5" />
          {(i % 2 === 0 || i === cum.length - 1) && (
            <text x={left + i * col + col / 2} y={base + 14} textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.6">
              {firstYear + i}
            </text>
          )}
        </g>
      ))}
      {[0, cum.length - 1].map((i) => (
        <text key={i} x={Math.min(Math.max(left + i * col + col / 2, left + 24), W - 24)} y={cum[i] >= 0 ? y(cum[i]) - 4 : zero - 5} textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor">
          {gbp(cum[i])}
        </text>
      ))}
      {payback !== null && payback > 0 && payback < cum.length + 0.01 && (
        <g>
          <line x1={left + payback * col} y1={top} x2={left + payback * col} y2={base} stroke="#C77F04" strokeDasharray="4 3" />
          <text x={Math.min(left + payback * col + 5, W - 110)} y={top + 10} fontSize="10" fontWeight="700" fill="#C77F04">
            Payback: {paybackWords(payback)}
          </text>
        </g>
      )}
      {cum.map((_, i) => (
        <rect key={`h${i}`} className="ip-hit" x={left + i * col} y="0" width={col} height={H} fill="transparent" tabIndex={0} role="button" aria-label={`${firstYear + i}: ${gbp(cum[i])} cumulative net saving`} onMouseEnter={() => setHi(i)} onFocus={() => setHi(i)} onBlur={() => setHi(null)} onClick={() => setSel(i)} />
      ))}
    </svg>
      {hi !== null && (
        <div className="ip-tip" style={{ left: `${Math.min(84, Math.max(16, ((left + (hi + 0.5) * col) / W) * 100))}%` }} role="status">
          <b>{firstYear + hi}</b>
          <span>
            Year {hi + 1}: <b>{gbp(cum[hi])}</b> in total
          </span>
          {hi > 0 && <em>{gbp(cum[hi] - cum[hi - 1])} that year</em>}
        </div>
      )}
    </div>
  );
  return (
    <>
    <ChartFrame title="Cumulative net saving, year by year">{plot}</ChartFrame>
    <div className="ip-sum">
      <div className="ip-sum-head">
        <b>
          Year {sel + 1} · {firstYear + sel}
        </b>
        <input type="range" min={0} max={cum.length - 1} value={sel} onChange={(e) => setSel(Number(e.target.value))} aria-label="Choose a year" />
      </div>
      <dl>
        <div>
          <dt>Investment</dt>
          <dd>{gbp(price)}</dd>
        </div>
        {sel > 0 && (
          <div>
            <dt>Saving so far</dt>
            <dd>{gbp(soFar)}</dd>
          </div>
        )}
        <div>
          <dt>Year {sel + 1} saving</dt>
          <dd>{gbp(thisYear)}</dd>
        </div>
        <div className="net">
          <dt>Net</dt>
          <dd className={cum[sel] >= 0 ? 'pos' : 'neg'}>{gbp(cum[sel])}</dd>
        </div>
      </dl>
      <small>Net is the savings so far, less what you invested. It turns positive in the year you are paid back.</small>
    </div>
    </>
  );
}

/**
 * One diagram that plays through the day: sun, evening, night. Energy travels along the lines as moving dots, the parts light up or rest,
 * and it moves on by itself every few seconds until the reader picks a moment.
 */
function FlowDiagram({ states, hasBattery }: { states: ReturnType<typeof howItWorks>; hasBattery: boolean }) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(false);
  useEffect(() => {
    if (picked) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % states.length), 8000);
    return () => clearInterval(t);
  }, [picked, states.length]);
  const state = states[idx];
  const nodes: Node[] = hasBattery ? ['home', 'solar', 'grid', 'battery'] : ['home', 'solar', 'grid'];
  const h = NODE_SIZE / 2;
  const uid = useId().replace(/:/g, '');
  return (
    <div className="ip-flowbox">
      <div className="ip-flowtabs" role="tablist" aria-label="Moment of the day">
        {states.map((st, i) => (
          <button
            key={st.title}
            type="button"
            role="tab"
            aria-selected={i === idx}
            className={i === idx ? 'on' : ''}
            onClick={() => {
              setPicked(true);
              setIdx(i);
            }}
          >
            {st.title}
          </button>
        ))}
      </div>
      <svg className="ip-flowsvg" viewBox="0 0 160 160" role="img" aria-label={`${state.title}: ${state.caption}`}>
        <defs>
          <marker id={`arr-${uid}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M1 1 L7 4 L1 7" fill="none" stroke="#C77F04" strokeWidth="1.2" />
          </marker>
        </defs>
        {state.flows.map(([a, b]) => {
          const ar = arrow(a, b);
          const path = `M${ar.x1} ${ar.y1 + 6} L${ar.x2} ${ar.y2 + 6}`;
          return (
            <g key={`${idx}${a}${b}`}>
              <path d={path} className="ip-fl-base" fill="none" />
              <path d={path} className="ip-fl-run" fill="none" markerEnd={`url(#arr-${uid})`} />
            </g>
          );
        })}
        {nodes.map((n) => {
          const c = { x: NODE_AT[n].x, y: NODE_AT[n].y + 6 };
          const off = state.off.includes(n);
          return (
            <g key={n} className={off ? 'ip-node off' : 'ip-node'}>
              <circle cx={c.x} cy={c.y} r={h - 1} />
              <g className="ip-ic" transform={`translate(${c.x} ${c.y}) scale(0.78)`} fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                {n === 'home' && <path d="M-8 1 L0 -7 L8 1 M-5.5 0 V8 H5.5 V0" />}
                {n === 'solar' && (
                  <>
                    <circle r="3.4" />
                    <path d="M0 -8 V-6 M0 6 V8 M-8 0 H-6 M6 0 H8 M-5.6 -5.6 L-4.4 -4.4 M4.4 4.4 L5.6 5.6 M-5.6 5.6 L-4.4 4.4 M4.4 -4.4 L5.6 -5.6" />
                  </>
                )}
                {n === 'grid' && <path d="M0 -9 L-6 9 M0 -9 L6 9 M-3.5 0 H3.5 M-5 5 H5 M-8 -4 H8" />}
                {n === 'battery' && (
                  <>
                    <rect x="-8" y="-5" width="14" height="10" rx="1" />
                    <path d="M8 -2 V2 M-4 -2 V2 M0 -2 V2" />
                  </>
                )}
              </g>
              <text x={c.x} y={n === 'home' ? c.y - h - 3 : c.y + h + 9} textAnchor="middle" fontSize="6.5" letterSpacing="1" fill="currentColor" opacity="0.75">
                {NODE_LABEL[n].toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>
      <p key={idx} className="ip-flowcap">
        {state.caption}
      </p>
    </div>
  );
}
