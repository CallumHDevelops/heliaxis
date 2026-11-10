/** Template 1 · Classic. Dark header band, roof plan beside estimate table, gold finance strip. */
import { Wordmark } from '@/components/prospectpv/brand/Spark';
import { annualKwh, kwp, money } from '@/lib/prospectpv/format';
import {
  AddressWindow, indicativeNote, layoutNote, BackFooter, BenefitIcon, benefitsFor, FinanceExample, FrontFooter, ImageSlot,
  QrCode, Rich, RoofPlan, Signature, steps, type TemplateProps,
} from '../parts';

export function T1Front({ data, copy, preview }: TemplateProps) {
  const e = data.estimate;
  const [before, highlight] = copy('headline').split('**');
  return (
    <section className="pv-page t1">
      <AddressWindow data={data} />
      <div className="pv-top">
        <div className="t1-band">
          <Wordmark size={22} tone="light" logoUrl={data.images.logoWhite || undefined} />
          <div className="t1-band-meta">
            {data.company.phone}
            <br />
            {data.company.website}
          </div>
        </div>
        <div className="pv-top-right pv-meta">
          {data.date}
          <br />
          Ref: {data.letterCode}
        </div>
      </div>

      <div className="t1-intro">
        <h1>
          {before}
          {highlight ? <span className="t1-hl">{highlight}</span> : null}
        </h1>
        <p>{copy('intro')}</p>
      </div>

      <div className="t1-grid">
        <div className="t1-roofcard">
          <div className="pv-label">Your roof from above</div>
          <RoofPlan roof={data.roof} tone="light" />
          <div className="t1-caption">{layoutNote(data)}</div>
        </div>
        <div className="t1-est">
          <div className="pv-label">Your indicative estimate</div>
          <div className="pv-rows">
            <div><span>Recommended package</span><strong>{data.package.name}</strong></div>
            <div><span>Solar panels</span><strong>{e.panelCount}</strong></div>
            <div><span>System size</span><strong>{kwp(e.kwp)} kWp</strong></div>
            <div><span>GoodWe ESA battery</span><strong>{e.batteryKwh} kWh</strong></div>
            <div><span>Yearly generation</span><strong>~{annualKwh(e.annualKwh)} kWh</strong></div>
          </div>
          <div className="pv-indicative">{indicativeNote(data)}</div>
        </div>
      </div>

      <div className="t1-strip pv-xh">
        <h3>{copy('stripTitle')}</h3>
        <p>{copy('stripBody')}</p>
      </div>

      <div className="t1-sign">
        <div>
          Yours sincerely,
          <Signature data={data} preview={preview} />
          <strong>{data.sender.name}</strong>, {data.sender.role}, Heliaxis
        </div>
        <div className="t1-cta">
          <div>
            <strong>{copy('ctaTitle')}</strong>
            <br />
            Scan, or visit
            <br />
            {data.qrUrl.replace(/^https?:\/\//, '')}
          </div>
          <QrCode url={data.qrUrl} size={92} />
        </div>
      </div>

      <FrontFooter copy={copy} />
    </section>
  );
}

export function T1Back({ data, copy, preview }: TemplateProps) {
  const p = data.package;
  return (
    <section className="pv-page t1">
      <div className="t1-backband">
        <Wordmark size={15} tone="light" logoUrl={data.images.logoWhite || undefined} />
        <span>YOUR PACKAGE DETAILS · PAGE 2 OF 2</span>
      </div>

      <div className="t1-backhead">
        <h2>Your {p.name} package</h2>
        {p.description ? <p>{p.description}</p> : null}
      </div>

      <div className="t1-pkg">
        <ImageSlot url={data.images.esaUnit} label="GoodWe ESA unit on a wall" preview={preview} />
        <div className="t1-pkg-right">
          <div className="pv-rows">
            <div><span>Solar panels</span><strong>{data.estimate.panelCount} × {p.panelModel} {p.panelWatts} W</strong></div>
            <div><span>Inverter and battery</span><strong>GoodWe ESA {p.esaModel}</strong></div>
            <div><span>Usable storage</span><strong>{data.estimate.batteryKwh} kWh</strong></div>
            <div><span>Monitoring</span><strong>{p.monitoringApp}</strong></div>
            <div><span>Warranties</span><strong>{p.warrantyPanelYrs} yr panels · {p.warrantyBatteryYrs} yr battery</strong></div>
          </div>
          <div className="t1-price pv-xh pv-xh--dark">
            <div className="pv-label">Fully installed price</div>
            <div className="pv-price-num">£{money(p.priceIncVat)}</div>
            <small>{copy('priceNote')}</small>
          </div>
        </div>
      </div>

      <div className="t1-why">
        <div className="pv-label">{copy('benefitsTitle')}</div>
        <div className="t1-why-grid">
          {benefitsFor(data).map((b) => (
            <div key={b.key}>
              <strong>
                <BenefitIcon claim={b.key} size={22} />
                {b.title}
              </strong>
              {b.long}
            </div>
          ))}
        </div>
      </div>

      <div className="t1-bottom">
        <div className="t1-fin pv-xh">
          <h3>{data.finance.enabled ? 'Warm Homes loan' : copy('noFinanceTitle')}</h3>
          {data.finance.enabled ? copy('financeBody') : copy('noFinanceBody')}
          <FinanceExample data={data} />
        </div>
        <div className="t1-next">
          <h3>{copy('nextTitle')}</h3>
          <ol>
            {steps(copy).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <Rich text={copy('nextCall')} as="div" className="pv-call" />
        </div>
      </div>

      <BackFooter data={data} />
    </section>
  );
}
