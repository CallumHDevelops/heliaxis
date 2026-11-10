/** One letter: both sides, its link, the figures behind it, estimates and what the customer did. Server-safe. */
import { annualKwh, kwp, money, oneDp, oneLineAddress } from '@/lib/prospectpv/format';
import type { ScaffoldEstimate } from '@/lib/prospectpv/scaffolding';
import type { SavingsResult } from '@/lib/prospectpv/savings';
import type { LetterDetail as Letter } from '@/lib/prospectpv/server/data';
import { ScaledFrame } from './ui';
import Link from 'next/link';

const TEMPLATE_NAMES = ['Classic', 'Bold Dark', 'Personal Letter', 'Roof Report', 'Brand Hero'];
const stamp = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
const HOME: Record<string, string> = { out: 'Mostly out', some: 'Some days', all: 'Home all day' };
const trim = (n: number) => oneDp(n).replace(/\.0$/, '');

export function LetterDetail({ letter, previewTemplate, frontHtml, backHtml, scaffold, savings, generationKwh, calculatorHint }: {
  letter: Letter; previewTemplate: number; frontHtml: string; backHtml: string;
  scaffold: ScaffoldEstimate | null; savings: SavingsResult | null; generationKwh: number; calculatorHint: boolean;
}) {
  const d = letter.data;
  const shown = letter.uprn < 0 ? `M${Math.abs(letter.uprn)}` : String(letter.uprn);
  return (
    <>
      <p style={{ margin: '0 0 10px' }}><Link href="/admin/sales/prospectpv" className="pva-muted">← All letters</Link></p>
      <div className="pva-head">
        <div>
          <h1>{oneLineAddress(d.address)}</h1>
          <p className="pva-mono">{letter.code} · UPRN {shown} · {TEMPLATE_NAMES[letter.templateKey - 1]} · created {day.format(new Date(letter.createdAt))}{letter.source === 'manual' ? ' by hand' : ''}</p>
        </div>
        <div className="pva-actions">
          <a className="crm-btn crm-btn--ghost" href={d.qrUrl} target="_blank" rel="noreferrer">Open landing page</a>
          <a className="crm-btn crm-btn--solar" href={`/api/prospectpv/letters/${letter.id}/pdf${previewTemplate !== letter.templateKey ? `?template=${previewTemplate}` : ''}`} target="_blank" rel="noreferrer">Download PDF</a>
        </div>
      </div>

      <div className="pva-tabs" role="navigation" aria-label="Preview in another template">
        {TEMPLATE_NAMES.map((n, i) => (
          <a key={n} href={`?template=${i + 1}`} aria-current={previewTemplate === i + 1}>{n}{letter.templateKey === i + 1 ? ' (sent)' : ''}</a>
        ))}
      </div>
      <div className="pva-frames">
        <ScaledFrame html={frontHtml} title="Letter front" />
        <ScaledFrame html={backHtml} title="Letter back" />
      </div>

      <div className="pva-grid" style={{ marginTop: 20, alignItems: 'start' }}>
        <div>
          <section className="pva-card">
            <h2>What’s printed</h2>
            <div className="pva-sum" style={{ marginTop: 8 }}>
              <div><span>Package</span><strong>{d.package.name}</strong></div>
              <div><span>Panels</span><strong>{d.estimate.panelCount} × {d.package.panelModel} {d.package.panelWatts} W</strong></div>
              <div><span>Array size</span><strong>{kwp(d.estimate.kwp)} kWp</strong></div>
              <div><span>Battery</span><strong>{d.estimate.batteryKwh} kWh</strong></div>
              <div><span>Inverter</span><strong>GoodWe ESA {d.package.esaModel}</strong></div>
              <div><span>Yearly generation</span><strong>~{annualKwh(d.estimate.annualKwh)} kWh</strong></div>
              <div><span>Roof faces</span><strong>{d.roof.mainAspect}</strong></div>
              <div><span>Price on the letter</span><strong>£{money(d.package.priceIncVat)}</strong></div>
              <div><span>Link expires</span><strong>{day.format(new Date(letter.expiresAt))}</strong></div>
            </div>
          </section>

          <section className="pva-card">
            <h2>Estimates for this home</h2>
            <p className="pva-blurb">Not printed on the letter. Rough guides for you.</p>
            <div className="pva-grid">
              <div>
                <div className="pva-muted" style={{ fontSize: 13 }}>Scaffolding</div>
                {scaffold?.cost != null ? (
                  <>
                    <div className="pva-big">~£{money(scaffold.rough ?? scaffold.cost)}</div>
                    <p className="pva-note">{trim(scaffold.lengthM)} m × {trim(scaffold.heightM)} m, {letter.assessment?.storeys ?? scaffold.storeys} storeys. About {Math.round((scaffold.cost / d.package.priceIncVat) * 100)}% of the price.</p>
                  </>
                ) : <p className="pva-note">{letter.assessment?.scaffold_est != null ? `£${money(letter.assessment.scaffold_est)} when created.` : <>Add a <Link href="/admin/sales/prospectpv/settings#scaffolding">scaffolding rate</Link> to see this.</>}</p>}
              </div>
              <div>
                <div className="pva-muted" style={{ fontSize: 13 }}>Typical home saving</div>
                {savings ? (
                  <>
                    <div className="pva-big">£{money(savings.annualSaving)}<span style={{ fontSize: 15, fontWeight: 600 }}> a year</span></div>
                    <p className="pva-note">Payback about {savings.paybackYears === null ? '–' : oneDp(savings.paybackYears)} years, from {money(generationKwh)} kWh generated.</p>
                  </>
                ) : <p className="pva-note">{calculatorHint ? <>Set the <Link href="/admin/sales/prospectpv/settings#savings">savings assumptions</Link> to see this.</> : 'Not available.'}</p>}
              </div>
            </div>
          </section>
        </div>

        <section className="pva-card">
          <h2>Activity</h2>
          <dl className="pva-dl" style={{ margin: '10px 0 14px' }}>
            <dt>Page opened</dt><dd>{letter.views === 0 ? 'Not yet' : `${letter.views} time${letter.views === 1 ? '' : 's'}`}</dd>
            {letter.firstViewedAt ? <><dt>First opened</dt><dd>{stamp.format(new Date(letter.firstViewedAt))}</dd></> : null}
            {letter.lastViewedAt && letter.views > 1 ? <><dt>Last opened</dt><dd>{stamp.format(new Date(letter.lastViewedAt))}</dd></> : null}
          </dl>
          {letter.responses.length === 0 ? <p className="pva-note">Nothing yet. When they open the page or book a survey, it shows here.</p> : (
            <ul className="pva-timeline">
              {letter.responses.map((r) => (
                <li key={r.id}>
                  <time dateTime={r.createdAt}>{stamp.format(new Date(r.createdAt))}</time>
                  <div>
                    {r.type === 'qr_scan' ? 'Opened the landing page' : r.type === 'opt_out' ? <strong>Asked us to stop writing</strong> : r.type === 'call' ? 'Phoned' : (
                      <>
                        <strong>Booked a survey</strong>
                        <div>{String(r.payload.name ?? '')} · <a href={`tel:${String(r.payload.phone ?? '')}`}>{String(r.payload.phone ?? '')}</a> · {String(r.payload.email ?? '')}</div>
                        <div className="pva-note">Best time: {String(r.payload.best_time ?? '–')}. Quoted £{money(Number(r.payload.quoted_total ?? 0))}, {String(r.payload.battery_kwh ?? '')} kWh battery
                          {Array.isArray(r.payload.extras) && r.payload.extras.length ? `, extras: ${(r.payload.extras as { name: string }[]).map((x) => x.name).join(', ')}` : ''}.
                          {' '}Uses {money(Number(r.payload.usage_kwh ?? 0))} kWh a year, £{String(r.payload.monthly_bill ?? '')} a month, {HOME[String(r.payload.home_pattern)] ?? ''}.</div>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
