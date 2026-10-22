import Link from 'next/link';
import { Eyebrow } from './Eyebrow';
import { SparkIcon } from './Spark';

export function Hero() {
  return (
    <>
      <section className="hero" id="top">
        <div className="glow" />
        <div className="sun" />
        <div className="wrap">
          <div>
            <Eyebrow onDark>MCS-certified · South Wales</Eyebrow>
            <h1>
              Cut your energy bills with <span className="y">Welsh sunshine.</span>
            </h1>
            <p className="lead">
              Solar panels, battery storage, heat pumps &amp; EV charging — designed,
              installed and looked after by one local, accredited team. No pushy sales, ever.
            </p>
            <div className="cbtns">
              <a className="btn btn-solar" href="#quote">
                Get my free quote
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </a>
              <a className="btn btn-light" href="/solar-estimator">Estimate my savings</a>
            </div>
            <p className="microtrust">
              <b>Free survey</b> · <b>No obligation</b> · <b>No salespeople</b> · Insurance-backed guarantees
            </p>
          </div>
          <div className="hero-mark reveal d1">
            <SparkIcon className="bigspark" />
          </div>
        </div>
      </section>

      <div className="trustbar">
        <div className="wrap">
          <div className="acc">
            <span className="ac">MCS</span>
            <span className="ac">RECC</span>
            <span className="ac">NICEIC</span>
            <span className="ac">TrustMark</span>
            <span className="ac">HIES</span>
            <span className="ac">ECA</span>
          </div>
          <div className="rev">
            <Link href="/case-studies">See our case studies →</Link>
          </div>
        </div>
      </div>

      <div className="stats">
        <div className="wrap">
          <div className="stat reveal">
            <div className="n">Free</div>
            <div className="k">Home survey</div>
          </div>
          <div className="stat reveal d1">
            <div className="n">1 team</div>
            <div className="k">Solar, battery, heat pump &amp; EV</div>
          </div>
          <div className="stat reveal d2">
            <div className="n">Itemised</div>
            <div className="k">Quotes with stated assumptions</div>
          </div>
          <div className="stat reveal d3">
            <div className="n">Local</div>
            <div className="k">South Wales installers</div>
          </div>
        </div>
      </div>
    </>
  );
}
