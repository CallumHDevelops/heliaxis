import { Eyebrow } from './Eyebrow';

export function ServicesGrid() {
  return (
    <section className="sec" id="services" style={{ paddingTop: 0, paddingBottom: 56 }}>
      <div className="wrap">
        <div className="sec-head reveal">
          <Eyebrow>What we install</Eyebrow>
          <h2>One team for your whole energy setup</h2>
        </div>
        <div className="svc-grid reveal">
          <div className="svc">
            <span className="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path className="f" d="M4 16l2-9h12l2 9z" fill="var(--solar)" stroke="none" />
                <path d="M4 16l2-9h12l2 9z" />
                <path d="M3 16h18M9 7L8 16M15 7l1 9M6 11.5h12" />
              </svg>
            </span>
            <h3>Solar PV panels</h3>
            <p>Tier-one panels sized to your roof and how you actually use energy.</p>
          </div>
          <div className="svc">
            <span className="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <rect className="f" x="6" y="5" width="12" height="16" rx="1.5" fill="var(--solar)" stroke="none" />
                <rect x="6" y="5" width="12" height="16" rx="1.5" />
                <path d="M10 5V3h4v2" />
                <path d="M13 9l-3 5h4l-3 4" />
              </svg>
            </span>
            <h3>Battery storage</h3>
            <p>Store the sunshine you make and use it after dark — with backup power.</p>
          </div>
          <div className="svc">
            <span className="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <rect className="f" x="3" y="7" width="18" height="11" rx="1.5" fill="var(--solar)" stroke="none" />
                <rect x="3" y="7" width="18" height="11" rx="1.5" />
                <circle cx="12" cy="12.5" r="3.5" />
                <path d="M12 10.5v4M10 12.5h4" />
              </svg>
            </span>
            <h3>Heat pumps</h3>
            <p>Efficient air-source heating that cuts fossil-fuel use all year round.</p>
          </div>
          <div className="svc">
            <span className="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path className="f" d="M6 20V9a2.5 2.5 0 0 1 2.5-2.5h5A2.5 2.5 0 0 1 16 9v11z" fill="var(--solar)" stroke="none" />
                <path d="M6 20V9a2.5 2.5 0 0 1 2.5-2.5h5A2.5 2.5 0 0 1 16 9v11" />
                <path d="M4 20h14" />
                <path d="M16 11h2.5l2 2v5a1.75 1.75 0 0 1-3.5 0v-3" />
              </svg>
            </span>
            <h3>EV chargers</h3>
            <p>Home and workplace charging that tops up from your own solar.</p>
          </div>
          <div className="svc">
            <span className="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path className="f" d="M12 3a7 7 0 0 1 4 12.8c-.6.4-1 1-1 1.7V18H9v-.5c0-.7-.4-1.3-1-1.7A7 7 0 0 1 12 3Z" fill="var(--solar)" stroke="none" />
                <path d="M12 3a7 7 0 0 1 4 12.8c-.6.4-1 1-1 1.7V18H9v-.5c0-.7-.4-1.3-1-1.7A7 7 0 0 1 12 3Z" />
                <path d="M9.5 21h5M10 18v3M14 18v3" />
              </svg>
            </span>
            <h3>LED lighting</h3>
            <p>Commercial LED upgrades that slash lighting costs, often paying back in months.</p>
          </div>
          <div className="svc">
            <span className="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <rect className="f" x="7" y="3" width="10" height="18" rx="1.5" fill="var(--solar)" stroke="none" />
                <rect x="7" y="3" width="10" height="18" rx="1.5" />
                <path d="M10 18h4" />
                <path d="M9.5 11l2 2.5 1.5-2 2 3" />
              </svg>
            </span>
            <h3>Monitoring</h3>
            <p>See your generation, savings and export from anywhere, on your phone.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
