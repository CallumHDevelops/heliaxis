import { Eyebrow } from './Eyebrow';

export function ProcessSteps() {
  return (
    <section className="sec">
      <div className="wrap">
        <div className="sec-head reveal">
          <Eyebrow>How it works</Eyebrow>
          <h2>Four simple steps to switching on</h2>
        </div>
        <div className="steps">
          <div className="pstep reveal">
            <span className="n">01</span>
            <h4>Free survey</h4>
            <p>We visit, assess your roof and usage, and answer every question.</p>
          </div>
          <div className="pstep reveal d1">
            <span className="n">02</span>
            <h4>Clear design &amp; quote</h4>
            <p>Honest savings, payback and costs — no jargon, no pressure.</p>
          </div>
          <div className="pstep reveal d2">
            <span className="n">03</span>
            <h4>Expert install</h4>
            <p>Our own MCS engineers fit it tidily, at a time that suits you.</p>
          </div>
          <div className="pstep reveal d3">
            <span className="n">04</span>
            <h4>Aftercare</h4>
            <p>App monitoring and support that lasts for years.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
