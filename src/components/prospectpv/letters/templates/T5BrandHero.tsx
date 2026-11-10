/** Template 5 · Brand Hero (default). Gold hero with cross-hatch, dark QR band, dark finance band. */
import { Wordmark } from '@/components/prospectpv/brand/Spark';
import { annualKwh, kwp, money } from '@/lib/prospectpv/format';
import {
  AddressWindow, indicativeNote, layoutNote, BackFooter, BenefitIcon, benefitsFor, Eyebrow, FinanceExample, FrontFooter,
  ImageSlot, QrCode, Rich, RoofPlan, steps, type TemplateProps,
} from '../parts';

export function T5Front({ data, copy, preview }: TemplateProps) {
  const e = data.estimate;
  return (
    <section className="pv-page t5">
      <AddressWindow data={data} />
      <div className="pv-top">
        <div className="pv-top-right">
          <Wordmark size={22} logoUrl={data.images.logo || undefined} />
          <div className="pv-meta">{data.date}</div>
        </div>
      </div>

      <div className="t5-hero pv-xh">
        <div className="t5-hero-grid">
          <div>
            <Eyebrow>{copy('eyebrow')}</Eyebrow>
            <h1>{copy('headline')}</h1>
            <Rich text={copy('lead')} as="div" className="t5-lead" />
          </div>
          <RoofPlan roof={data.roof} tone="ink-panels" />
        </div>
        <div className="t5-chips">
          <div><strong>{data.package.name}</strong> package</div>
          <div><strong>{kwp(e.kwp)} kWp</strong> solar</div>
          <div><strong>{e.batteryKwh} kWh</strong> battery</div>
          <div>~<strong>{annualKwh(e.annualKwh)} kWh</strong> a year</div>
        </div>
        <div className="pv-indicative">{indicativeNote(data)}</div>
      </div>

      <div className="t5-body">
        <div>
          <Rich text={copy('body')} />
        </div>
        <ImageSlot url={data.images.install} label="finished Heliaxis install" preview={preview} />
      </div>

      <div className="t5-qr pv-xh pv-xh--dark">
        <QrCode url={data.qrUrl} size={100} />
        <div>
          <Eyebrow spark={false}>{copy('qrEyebrow')}</Eyebrow>
          <h3>{copy('qrTitle')}</h3>
          {copy('qrBody')}
        </div>
      </div>

      <FrontFooter copy={copy} />
    </section>
  );
}

export function T5Back({ data, copy, preview }: TemplateProps) {
  const p = data.package;
  return (
    <section className="pv-page t5">
      <div className="t5-back-top">
        <ImageSlot url={data.images.package ?? data.images.esaUnit} label="GoodWe ESA unit" preview={preview} />
        <div>
          <Eyebrow>Your package</Eyebrow>
          <h2>{p.name}</h2>
          <div className="t5-spec">
            <div>{data.estimate.panelCount} × {p.panelModel} {p.panelWatts} W panels</div>
            <div>GoodWe ESA {p.esaModel} all-in-one</div>
            <div>{data.estimate.batteryKwh} kWh usable battery storage</div>
            <div>Monitoring via {p.monitoringApp}</div>
            <div>{p.warrantyPanelYrs}-yr panel and {p.warrantyBatteryYrs}-yr battery warranties</div>
          </div>
          <div className="t5-pricetag pv-xh">
            <div className="pv-label">{copy('priceLabel')}</div>
            <div className="pv-price-num">£{money(p.priceIncVat)}</div>
            <small>{copy('priceNote')}</small>
          </div>
        </div>
      </div>

      <div className="t5-benefits">
        <h3>{copy('benefitsTitle')}</h3>
        <div className="t5-bgrid">
          {benefitsFor(data).map((b, i) => (
            <div key={b.key}>
              <div className="t5-bhead">
                <div className="pv-iconbox"><BenefitIcon claim={b.key} /></div>
                <span className="t5-bnum">S/{String(i + 1).padStart(2, '0')}</span>
              </div>
              <strong>{b.title}</strong>
              {b.short}
            </div>
          ))}
        </div>
      </div>

      <div className="t5-fin pv-xh pv-xh--dark">
        <h3>{data.finance.enabled ? copy('financeTitle') : copy('noFinanceTitle')}</h3>
        <div>
          {data.finance.enabled ? copy('financeBody') : copy('noFinanceBody')}
          <FinanceExample data={data} />
        </div>
      </div>

      <div className="t5-steps">
        {steps(copy).map((s, i) => (
          <div key={i}>
            <b>{String(i + 1).padStart(2, '0')}</b>
            <strong>{s}</strong>
          </div>
        ))}
        <div className="t5-steps-qr">
          <QrCode url={data.qrUrl} size={80} />
          {copy('qrBack')}
        </div>
      </div>

      <BackFooter data={data} />
      <div className="t5-goldline" />
    </section>
  );
}

