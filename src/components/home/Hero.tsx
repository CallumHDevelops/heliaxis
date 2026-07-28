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
            <div className="rating">
              <div className="r">
                <span className="big">4.9</span>
                <span className="stars">★★★★★</span>
                <span>Google &amp; Trustpilot</span>
              </div>
              <div className="r">
                <span className="big"><span data-count="1200">0</span>+</span>
                <span>installs across South Wales</span>
              </div>
            </div>
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
            <span className="stars">★★★★★</span> Rated excellent by South Wales homeowners &amp; businesses
          </div>
        </div>
      </div>

      <div className="stats">
        <div className="wrap">
          <div className="stat reveal">
            <div className="n"><span data-count="1200">0</span>+</div>
            <div className="k">Installs completed</div>
          </div>
          <div className="stat reveal d1">
            <div className="n">£<span data-count="1200">0</span></div>
            <div className="k">Avg. yearly saving*</div>
          </div>
          <div className="stat reveal d2">
            <div className="n"><span data-count="4" data-dp="1" data-target="4.9">0</span>★</div>
            <div className="k">Customer rating</div>
          </div>
          <div className="stat reveal d3">
            <div className="n"><span data-count="25">0</span> yr</div>
            <div className="k">Workmanship guarantee</div>
          </div>
        </div>
      </div>
    </>
  );
}
