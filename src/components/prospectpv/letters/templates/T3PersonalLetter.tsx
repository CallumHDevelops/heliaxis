/** Template 3 · Personal Letter. A letter from the director with photo and signature. */
import { Wordmark } from '@/components/prospectpv/brand/Spark';
import { annualKwh, kwp, money } from '@/lib/prospectpv/format';
import {
  AddressWindow, indicativeNote, layoutNote, BackFooter, benefitsFor, FinanceExample, FrontFooter, ImageSlot, QrCode, Rich,
  Signature, type TemplateProps,
} from '../parts';

const Tick = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12l5 5 9-10" />
  </svg>
);

export function T3Front({ data, copy, preview }: TemplateProps) {
  const e = data.estimate;
  return (
    <section className="pv-page t3">
      <div className="t3-strip" />
      <div className="t3-main">
        <AddressWindow data={data} />
        <div className="pv-top">
          <div className="pv-top-right" style={{ right: 64 }}>
            <Wordmark size={19} logoUrl={data.images.logo || undefined} />
            <div className="t3-letterhead">
              Heliaxis Limited
              {data.company.businessAddress ? (
                <>
                  <br />
                  {data.company.businessAddress}
                </>
              ) : null}
              <br />
              {data.company.phone}
              <br />
              {data.company.website}
            </div>
          </div>
        </div>

        <div className="t3-content">
          <div className="t3-date">{data.date}</div>
          <h1>{copy('headline')}</h1>
          <div className="t3-p">
            <Rich text={copy('body1')} />
          </div>
          <div className="t3-est">
            <div>System size<strong>{kwp(e.kwp)} kWp</strong></div>
            <div>Battery storage<strong>{e.batteryKwh} kWh</strong></div>
            <div>Indicative yearly generation<strong>~{annualKwh(e.annualKwh)} kWh</strong></div>
            <div>Fully installed<strong>£{money(data.package.priceIncVat)}</strong></div>
          </div>
          <div className="pv-indicative">{indicativeNote(data)}</div>
          <div className="t3-p">
            <Rich text={copy('body2')} />
          </div>
          <div className="t3-sign">
            <div className="t3-sign-left">
              {data.sender.photoUrl ? (
                <img className="t3-photo" src={data.sender.photoUrl} alt="" />
              ) : (
                <div className="t3-photo t3-photo--empty">{preview ? '[Photo]' : ''}</div>
              )}
              <div>
                {copy('signoff')}
                <Signature data={data} preview={preview} />
                <strong>{data.sender.name}</strong>, {data.sender.role}
              </div>
            </div>
            <div className="t3-qr">
              <QrCode url={data.qrUrl} size={86} />
              Book a survey
            </div>
          </div>
        </div>

        <FrontFooter copy={copy} />
      </div>
    </section>
  );
}

export function T3Back({ data, copy, preview }: TemplateProps) {
  const p = data.package;
  return (
    <section className="pv-page t3">
      <div className="t3-strip" />
      <div className="t3-main">
        <div className="t3-back">
          <div className="t3-back-head">
            <h2>Your {p.name} package</h2>
            <span>Prepared for {data.address.line1}</span>
          </div>
          <div className="t3-imgs">
            <ImageSlot url={data.images.install} label="finished Heliaxis roof install" preview={preview} />
            <ImageSlot url={data.images.package ?? data.images.esaUnit} label="GoodWe ESA unit" preview={preview} />
          </div>
          <div className="t3-cols">
            <div>
              <h3>The system</h3>
              <div className="pv-rows">
                <div><span>Panels</span><strong>{data.estimate.panelCount} × {p.panelModel}</strong></div>
                <div><span>Inverter + battery</span><strong>GoodWe ESA {p.esaModel}</strong></div>
                <div><span>Usable storage</span><strong>{data.estimate.batteryKwh} kWh</strong></div>
                <div><span>Monitoring</span><strong>{p.monitoringApp}</strong></div>
                <div><span>Warranties</span><strong>{p.warrantyPanelYrs} / {p.warrantyBatteryYrs} yrs</strong></div>
              </div>
              <div className="t3-price">
                <div className="pv-label">{copy('priceLabel')}</div>
                <div className="pv-price-num">£{money(p.priceIncVat)}</div>
                <small>{copy('priceNote')}</small>
              </div>
            </div>
            <div>
              <h3>{copy('benefitsTitle')}</h3>
              <div className="t3-ticks">
                {benefitsFor(data).map((b) => (
                  <div key={b.key}>
                    <Tick />
                    <span>
                      <strong>{b.title}:</strong> {b.long.charAt(0).toLowerCase() + b.long.slice(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="t3-box">
            <h3>{data.finance.enabled ? copy('financeTitle') : copy('noFinanceTitle')}</h3>
            {data.finance.enabled ? copy('financeBody') : copy('noFinanceBody')}
            <FinanceExample data={data} />
          </div>
          <div className="t3-next">
            <Rich text={copy('nextSteps')} as="div" />
          </div>
        </div>
        <BackFooter data={data} />
      </div>
    </section>
  );
}
