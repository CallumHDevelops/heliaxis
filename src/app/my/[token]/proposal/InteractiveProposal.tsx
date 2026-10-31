'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { BrandLogo } from '@/components/theme/BrandLogo';
import type { InteractiveData } from '@/lib/quotes/interactive';
import { arrow, howItWorks, NODE_AT, NODE_LABEL, NODE_SIZE, type Node } from '@/lib/quotes/how-it-works';
import { MCS_NOTE, mcsTable } from '@/lib/quotes/mcs';
import { paybackWords, recalc, type Basis, type Tariff } from '@/lib/quotes/roi';
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

  const r = useMemo(() => (basis ? recalc(basis, t) : null), [basis, t]);
  const theirs = useMemo(() => (basis ? recalc(basis, proposalTariff) : null), [basis, proposalTariff]);
  const changed = JSON.stringify(t) !== JSON.stringify(proposalTariff);
  const money = data.showFinancials && !!r && !!basis;

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

  return (
    <div className="pt ip">
      <header className="pt-head">
        <BrandLogo width={128} />
        <span className="pt-head-tag">Your proposal</span>
      </header>
      <main className="pt-main ip-main">
        {back && (
          <a className="ip-back" href={back.href}>
            ← {back.label}
          </a>
        )}
        <section className="pt-hello">
          <h1>Hi {data.first}</h1>
          <p>
            {data.title} · {data.quoteNumber}
          </p>
        </section>

        {tiles.length > 0 && (
          <div className="ip-tiles">
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
          <section className="pt-card">
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
          <section className="pt-card">
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
          <section className="pt-card">
            <h2>How your system works</h2>
            <p className="pt-muted">Where your electricity comes from and goes, through the day.</p>
            <div className="ip-flows">
              {howItWorks(!!(o.batteryUsableKwh || o.batteryModel)).map((st) => (
                <FlowPanel key={st.title} state={st} hasBattery={!!(o.batteryUsableKwh || o.batteryModel)} />
              ))}
            </div>
          </section>
        )}

        {mcsTable(o).length > 0 && (
          <section className="pt-card">
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
          <section className="pt-card">
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
          <section className="pt-card ip-money" id="prices">
            <h2>Try your own energy prices</h2>
            <p className="pt-muted">The figures below start from the design’s own assumptions. Change them to match your bill and see what it does to your saving, your payback and your return. Nothing here changes your quote.</p>

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
            {changed && (
              <button type="button" className="pt-btn ghost" onClick={() => setT(proposalTariff)}>
                Back to the design’s prices
              </button>
            )}

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
            <PaybackChart cum={r.cumulative} firstYear={o.firstYear ?? new Date().getFullYear()} payback={r.paybackYears} />
            <p className="pt-muted ip-note">
              {r.matched ? 'Worked from the design software’s own energy figures and matched to its first-year saving at its prices, so unchanged prices give its numbers.' : 'Worked from the design software’s energy figures.'} It is an estimate from yearly energy flows, not a half-hourly simulation, and prices can go down as well as up.
            </p>
          </section>
        )}

        <p className="pt-foot ip-foot">
          This system has been designed in third-party design software (OpenSolar). The key data points in this proposal have been extracted from that design and presented fairly. Figures are estimates, not guarantees. This proposal is subject to the terms and conditions in your quote.
        </p>
      </main>
    </div>
  );
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

function GenerationChart({ gen, use }: { gen: number[]; use: number[] | null }) {
  const W = 600;
  const H = 210;
  const base = H - 24;
  const top = 18;
  const max = Math.max(...gen, ...(use ?? []), 1);
  const y = (v: number) => base - ((base - top) * v) / max;
  const col = W / 12;
  return (
    <svg className="ip-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly generation against use">
      <line x1="0" y1={base} x2={W} y2={base} stroke="currentColor" strokeOpacity="0.2" />
      {gen.map((v, i) => (
        <g key={i}>
          <rect x={i * col + col * 0.2} y={y(v)} width={col * 0.6} height={Math.max(1, base - y(v))} fill="#F8BC1E" />
          <text x={i * col + col / 2} y={base + 14} textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.6">
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
            <rect key={i} x={i * col + col / 2 - 2.5} y={y(v) - 2.5} width="5" height="5" fill="#211F18" />
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
    </svg>
  );
}

function PaybackChart({ cum, firstYear, payback }: { cum: number[]; firstYear: number; payback: number | null }) {
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
  return (
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
          <rect x={left + i * col + col * 0.17} y={Math.min(y(v), zero)} width={col * 0.66} height={Math.max(1, Math.abs(y(v) - zero))} fill={v >= 0 ? '#F8BC1E' : '#c9c4b8'} />
          {(i % 2 === 0 || i === cum.length - 1) && (
            <text x={left + i * col + col / 2} y={base + 14} textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.6">
              {firstYear + i}
            </text>
          )}
        </g>
      ))}
      {[0, cum.length - 1].map((i) => (
        <text key={i} x={Math.min(Math.max(left + i * col + col / 2, left + 24), W - 24)} y={cum[i] >= 0 ? y(cum[i]) - 4 : y(cum[i]) + 11} textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor">
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
    </svg>
  );
}

function FlowPanel({ state, hasBattery }: { state: ReturnType<typeof howItWorks>[number]; hasBattery: boolean }) {
  const nodes: Node[] = hasBattery ? ['home', 'solar', 'grid', 'battery'] : ['home', 'solar', 'grid'];
  const h = NODE_SIZE / 2;
  return (
    <div className="ip-flow">
      <small>{state.title}</small>
      <svg viewBox="0 0 160 160" role="img" aria-label={`${state.title}: ${state.caption}`}>
        <defs>
          <marker id={`arr-${state.title.length}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 0 L8 4 L0 8 z" fill="#C77F04" />
          </marker>
        </defs>
        {state.flows.map(([a, b]) => {
          const ar = arrow(a, b);
          return <line key={`${a}${b}`} x1={ar.x1} y1={ar.y1 + 6} x2={ar.x2} y2={ar.y2 + 6} stroke="#C77F04" strokeWidth="2" markerEnd={`url(#arr-${state.title.length})`} />;
        })}
        {nodes.map((n) => {
          const c = { x: NODE_AT[n].x, y: NODE_AT[n].y + 6 };
          const off = state.off.includes(n);
          return (
            <g key={n}>
              <rect x={c.x - h} y={c.y - h} width={NODE_SIZE} height={NODE_SIZE} fill={off ? '#e1ded6' : '#F8BC1E'} />
              <text x={c.x} y={n === 'home' ? c.y - h - 3 : c.y + h + 9} textAnchor="middle" fontSize="7" letterSpacing="0.6" fill="currentColor" opacity="0.7">
                {NODE_LABEL[n].toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>
      <p>{state.caption}</p>
    </div>
  );
}
