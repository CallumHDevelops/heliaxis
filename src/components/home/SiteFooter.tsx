export function SiteFooter() {
  return (
    <footer>
      <div className="wrap">
        <div className="cols">
          <div>
            <p style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: '1.3rem', color: 'var(--paper)', marginBottom: 14 }}>Heliaxis</p>
            <p style={{ maxWidth: '32ch' }}>
              MCS-certified solar, battery, heat pump, EV &amp; LED installation for homes and businesses across South Wales.
            </p>
          </div>
          <div>
            <h4>Services</h4>
            <a href="#services">Solar panels</a>
            <a href="#services">Battery storage</a>
            <a href="#services">Heat pumps</a>
            <a href="#services">EV chargers</a>
          </div>
          <div>
            <h4>Areas</h4>
            <a href="#">Solar Panels Cardiff</a>
            <a href="#">Solar Panels Swansea</a>
            <a href="#">Solar Panels Newport</a>
            <a href="#">Bridgend &amp; the Vale</a>
          </div>
          <div>
            <h4>More</h4>
            <a href="/commercial-funding">Funding &amp; finance</a>
            <a href="/solar-estimator">Solar estimator</a>
            <a href="#faq">FAQs</a>
            <a href="#quote">Free quote</a>
          </div>
        </div>
        <div className="base">
          <span>© 2026 Heliaxis. MCS · RECC · NICEIC · Covering South Wales.</span>
          <span style={{ fontFamily: 'var(--mono)' }}>heliaxis.co.uk</span>
        </div>
      </div>
    </footer>
  );
}
