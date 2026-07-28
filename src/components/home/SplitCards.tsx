export function SplitCards() {
  return (
    <section className="sec" id="business" style={{ paddingTop: 56 }}>
      <div className="wrap">
        <div className="split">
          <div className="splitcard reveal">
            <span className="sc-ic">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 10.5h14V19H5z" fill="var(--solar)" fillOpacity="0.3" stroke="none" />
                <path d="M3 11l9-7 9 7" />
                <path d="M5 10v9h14v-9" />
                <path d="M10 19v-5h4v5" />
              </svg>
            </span>
            <h3>For your home</h3>
            <p>Cut your bills, add battery backup and go greener — with a system designed around your household.</p>
            <ul>
              <li>Free, no-obligation home survey</li>
              <li>0% VAT on residential solar until 2027</li>
              <li>Finance options to spread the cost</li>
            </ul>
            <a className="btn btn-dark" href="#quote">Get my home quote</a>
          </div>
          <div className="splitcard dark reveal d1">
            <span className="sc-ic dark">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#F7F2E7" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5l7-2v18H4z" fill="var(--solar)" fillOpacity="0.3" stroke="none" />
                <path d="M4 21V5l7-2v18" />
                <path d="M11 21V9l7 2v10" />
                <path d="M3 21h18" />
                <path d="M7 8h.01M7 12h.01M7 16h.01M14 13h.01M14 17h.01" />
              </svg>
            </span>
            <h3>For your business</h3>
            <p>Turn your roof into lower running costs, with ROI, grants and finance modelled around your site.</p>
            <ul>
              <li>Free commercial energy assessment</li>
              <li>Grants, finance &amp; PPA / Solar-as-a-Service</li>
              <li>Typical 3–6 year payback</li>
            </ul>
            <a className="btn btn-solar" href="/commercial-funding">Explore business funding</a>
          </div>
        </div>
      </div>
    </section>
  );
}
