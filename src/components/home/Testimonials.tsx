import { Eyebrow } from './Eyebrow';

export function Testimonials() {
  return (
    <section className="sec" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div className="sec-head center reveal">
          <Eyebrow>Real customers</Eyebrow>
          <h2>Trusted across South Wales</h2>
        </div>
        <div className="tgrid">
          <div className="tcard reveal">
            <div className="stars">★★★★★</div>
            <blockquote>&ldquo;Neat, tidy and genuinely no pressure. Our bills have dropped massively and the app makes it easy to see.&rdquo;</blockquote>
            <div className="who"><b>Sarah M.</b> <span>· Cardiff · Solar + battery</span></div>
          </div>
          <div className="tcard reveal d1">
            <div className="stars">★★★★★</div>
            <blockquote>&ldquo;From survey to switch-on they were spot on. The team clearly knew what they were doing and cleaned up after.&rdquo;</blockquote>
            <div className="who"><b>David R.</b> <span>· Swansea · Solar PV</span></div>
          </div>
          <div className="tcard reveal d2">
            <div className="stars">★★★★★</div>
            <blockquote>&ldquo;We use them for our commercial units. Straight answers, proper ROI figures, and a payback we&rsquo;re already hitting.&rdquo;</blockquote>
            <div className="who"><b>Gareth L.</b> <span>· Newport · Commercial</span></div>
          </div>
        </div>
        <p style={{ textAlign: 'center', marginTop: 20, fontSize: '.86rem', color: 'var(--muted)' }}>
          Illustrative testimonials — replace with your real Google &amp; Trustpilot reviews.
        </p>
      </div>
    </section>
  );
}
