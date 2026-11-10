/** Template 4 · Roof Report. Survey-style report with roof assessment and spec sheet. */
import { Wordmark } from '@/components/prospectpv/brand/Spark';
import { compactKwh, kwp, money } from '@/lib/prospectpv/format';
import {
  AddressWindow, indicativeNote, layoutNote, BackFooter, benefitsFor, FinanceExample, FrontFooter, ImageSlot, QrCode, Rich,
  RoofPlan, type TemplateProps,
} from '../parts';

export function T4Front({ data, copy }: TemplateProps) {
  const e = data.estimate;
  return (
    <section className="pv-page t4">
      <AddressWindow data={data} />
      <div className="pv-top">
        <div className="pv-top-right">
          <Wordmark size={19} logoUrl={data.images.logo || undefined} />
          <div className="pv-meta">
            {data.company.phone} · {data.company.website}
          </div>
        </div>
      </div>

      <div className="t4-bar">
        <h1>{copy('reportTitle')}</h1>
        <div className="t4-ref">
          REPORT {data.letterCode}
          <br />
          {data.date.toUpperCase()}
        </div>
      </div>

      <div className="t4-grid">
        <div className="t4-roof">
          <RoofPlan roof={data.roof} tone="light" grid />
          <div className="t4-legend">
            <span><span className="t4-swatch" />Suggested panels</span>
            <span><span className="t4-dash" />Roof ridge</span>
          </div>
        </div>
        <div className="t4-assess">
          <span className="pv-label">Roof assessment</span>
          <div className="pv-rows">
            <div><span>Main roof faces</span><strong>{data.roof.mainAspect}</strong></div>
            <div><span>Roof shape</span><strong>{data.roof.roofShape}</strong></div>
            {data.roof.usableAreaM2 > 0 ? <div><span>Usable roof area</span><strong>{data.roof.usableAreaM2} m²</strong></div> : null}
            <div><span>Existing solar</span><strong>None detected</strong></div>
            <div><span>Suitability</span><strong className="t4-pill">Suitable</strong></div>
          </div>
        </div>
      </div>

      <div className="t4-tiles">
        <div><div className="pv-label">Panels</div><b>{e.panelCount}</b></div>
        <div><div className="pv-label">System size</div><b>{kwp(e.kwp)}<small> kWp</small></b></div>
        <div><div className="pv-label">Battery</div><b>{e.batteryKwh}<small> kWh</small></b></div>
        <div><div className="pv-label">Per year</div><b>{compactKwh(e.annualKwh)}<small> kWh</small></b></div>
      </div>
      <div className="t4-tiles-note pv-indicative">{indicativeNote(data)}</div>

      <div className="t4-rec">
        <Rich text={copy('recommendation')} as="div" />
      </div>

      <div className="t4-cta pv-xh">
        <QrCode url={data.qrUrl} size={80} />
        <div>
          <strong>{copy('ctaTitle')}</strong>
          <br />
          Scan, visit {data.qrUrl.replace(/^https?:\/\//, '')} or call {data.company.phone}.
        </div>
      </div>

      <FrontFooter copy={copy} />
    </section>
  );
}

export function T4Back({ data, copy, preview }: TemplateProps) {
  const p = data.package;
  return (
    <section className="pv-page t4 t4-back">
      <div className="t4-bar">
        <h2>Recommended system: {p.name}</h2>
        <div className="t4-ref">REPORT {data.letterCode} · 2/2</div>
      </div>

      <div className="t4-equip">
        <div>
          <span className="pv-label">Equipment</span>
          <table>
            <thead>
              <tr><th>Component</th><th>Specification</th><th className="num">Qty</th></tr>
            </thead>
            <tbody>
              <tr><td>Solar panels</td><td>{p.panelModel}, {p.panelWatts} W</td><td className="num">{data.estimate.panelCount}</td></tr>
              <tr><td>Inverter + battery</td><td>GoodWe ESA {p.esaModel}</td><td className="num">1</td></tr>
              <tr>
                <td>Battery modules</td>
                <td>{p.batteryModuleModel ? `${p.batteryModuleModel}, ` : ''}{data.estimate.batteryKwh} kWh usable</td>
                <td className="num">{p.batteryModuleCount ?? '–'}</td>
              </tr>
              {p.mounting ? <tr><td>Mounting</td><td>{p.mounting}</td><td className="num">1</td></tr> : null}
              <tr><td>Monitoring</td><td>{p.monitoringApp}</td><td className="num">1</td></tr>
            </tbody>
          </table>
        </div>
        <ImageSlot url={data.images.esaUnit} label="GoodWe ESA unit" preview={preview} />
      </div>

      <div className="t4-feat">
        <span className="pv-label">{copy('benefitsTitle')}</span>
        <div className="t4-feat-grid">
          {benefitsFor(data).map((b, i) => (
            <div key={b.key}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              <span><strong>{b.title}.</strong> {b.short}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="t4-pricing">
        <div className="t4-pricebox pv-xh pv-xh--dark">
          <div className="pv-label">Fully installed price</div>
          <div className="pv-price-num">£{money(p.priceIncVat)}</div>
          <small>{copy('priceNote')}</small>
        </div>
        <div className="t4-finbox">
          <h3>{data.finance.enabled ? copy('financeTitle') : copy('noFinanceTitle')}</h3>
          {data.finance.enabled ? copy('financeBody') : copy('noFinanceBody')}
          <FinanceExample data={data} />
        </div>
      </div>

      <div className="t4-steps">
        <span className="pv-label">Next steps</span>
        <div className="t4-steps-grid">
          {[1, 2, 3, 4].map((n) => (
            <div key={n}>
              <strong>{copy(`step${n}`)}</strong>
              <br />
              {copy(`step${n}Desc`)}
            </div>
          ))}
        </div>
      </div>

      <BackFooter data={data} />
    </section>
  );
}
