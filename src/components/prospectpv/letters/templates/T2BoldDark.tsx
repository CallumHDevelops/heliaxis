/** Template 2 · Bold Dark. Huge gold panel count on a dark band. */
import { Wordmark } from '@/components/prospectpv/brand/Spark';
import { annualKwh, kwp, money } from '@/lib/prospectpv/format';
import {
  AddressWindow, indicativeNote, layoutNote, BackFooter, benefitsFor, Eyebrow, FinanceExample, FrontFooter, ImageSlot,
  QrCode, Rich, RoofPlan, steps, type TemplateProps,
} from '../parts';

export function T2Front({ data, copy }: TemplateProps) {
  const e = data.estimate;
  return (
    <section className="pv-page t2">
      <AddressWindow data={data} />
      <div className="pv-top">
        <div className="pv-top-right">
          <Wordmark size={21} logoUrl={data.images.logo || undefined} />
          <div className="pv-meta">
            {data.date}
            <br />
            {data.company.phone} · {data.company.website}
          </div>
        </div>
      </div>

      <div className="t2-band pv-xh pv-xh--dark">
        <div>
          <Eyebrow>Roof estimate · {data.address.line1}</Eyebrow>
          <div className="t2-num">{e.panelCount}</div>
          <div className="t2-caption">{copy('numberCaption')}</div>
          <div className="t2-sub">{copy('sub')}</div>
        </div>
        <RoofPlan roof={data.roof} tone="dark" />
      </div>

      <div className="t2-stats">
        <div><div className="pv-label">Package</div><strong>{data.package.name}</strong></div>
        <div><div className="pv-label">System size</div><strong>{kwp(e.kwp)} kWp</strong></div>
        <div><div className="pv-label">Battery</div><strong>{e.batteryKwh} kWh</strong></div>
        <div><div className="pv-label">Generation a year</div><strong>~{annualKwh(e.annualKwh)} kWh</strong></div>
      </div>
      <div className="t2-stats-note pv-indicative">{indicativeNote(data)}</div>

      <div className="t2-body">
        <Rich text={copy('body')} />
      </div>

      <div className="t2-cta">
        <QrCode url={data.qrUrl} size={84} />
        <div>
          <strong>{copy('ctaTitle')}</strong>
          Scan the code, visit {data.qrUrl.replace(/^https?:\/\//, '')} or call {data.company.phone}.
        </div>
      </div>

      <FrontFooter copy={copy} />
    </section>
  );
}

export function T2Back({ data, copy, preview }: TemplateProps) {
  const p = data.package;
  return (
    <section className="pv-page t2">
      <div className="t2-backband pv-xh pv-xh--dark">
        <div>
          <Eyebrow>Your package</Eyebrow>
          <h2>{p.name}</h2>
          <div className="t2-line">
            {data.estimate.panelCount} panels · GoodWe ESA all-in-one · {data.estimate.batteryKwh} kWh battery
          </div>
          <span className="pv-label">{copy('priceLabel')}</span>
          <div className="pv-price-num">£{money(p.priceIncVat)}</div>
          <small>{copy('priceNote')}</small>
        </div>
        <ImageSlot url={data.images.esaUnit} label="GoodWe ESA unit" preview={preview} dark />
      </div>

      <div className="t2-cols">
        <div>
          <h3>What’s included</h3>
          <div className="t2-list">
            <div>{data.estimate.panelCount} × {p.panelModel} {p.panelWatts} W panels</div>
            <div>GoodWe ESA {p.esaModel} inverter and battery</div>
            <div>{data.estimate.batteryKwh} kWh usable storage</div>
            {p.mounting ? <div>{p.mounting}</div> : null}
            <div>Monitoring via {p.monitoringApp}</div>
            <div>{p.warrantyPanelYrs}-year panel and {p.warrantyBatteryYrs}-year battery warranties</div>
          </div>
        </div>
        <div>
          <h3>{copy('benefitsTitle')}</h3>
          <div className="t2-why">
            {benefitsFor(data).map((b) => (
              <div key={b.key}>
                <strong>{b.title}.</strong> {b.long}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="t2-fin pv-xh">
        <h3>{data.finance.enabled ? copy('financeTitle') : copy('noFinanceTitle')}</h3>
        <div>
          {data.finance.enabled ? copy('financeBody') : copy('noFinanceBody')}
          <FinanceExample data={data} />
        </div>
      </div>

      <div className="t2-steps">
        <h3>{copy('stepsTitle')}</h3>
        <div className="t2-steps-grid">
          {steps(copy).map((s, i) => (
            <div key={i}>
              <b>{String(i + 1).padStart(2, '0')}</b>
              {s}
            </div>
          ))}
        </div>
      </div>

      <BackFooter data={data} />
    </section>
  );
}
