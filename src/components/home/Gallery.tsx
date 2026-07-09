import { Eyebrow } from './Eyebrow';

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <circle cx="12" cy="13" r="3.5" />
      <path d="M8 6l1.5-2h5L16 6" />
    </svg>
  );
}

export function Gallery() {
  return (
    <section className="sec" style={{ paddingTop: 0 }} id="work">
      <div className="wrap">
        <div className="sec-head center reveal">
          <Eyebrow>Recent work</Eyebrow>
          <h2>Installs across South Wales</h2>
          <p>A few of the homes and businesses we&rsquo;ve powered up. Real drone &amp; install photos drop straight into these frames.</p>
        </div>
        <div className="gallery reveal">
          <div className="gcard big">
            <span className="ph"><CameraIcon /><span className="t">Featured install</span></span>
            <span className="loc">Cardiff · 6.4 kWp + 10kWh battery</span>
          </div>
          <div className="gcard">
            <span className="ph"><CameraIcon /></span>
            <span className="loc">Swansea · 4.0 kWp</span>
          </div>
          <div className="gcard">
            <span className="ph"><CameraIcon /></span>
            <span className="loc">Newport · Commercial 55 kWp</span>
          </div>
          <div className="gcard">
            <span className="ph"><CameraIcon /></span>
            <span className="loc">Bridgend · 5.3 kWp + EV</span>
          </div>
          <div className="gcard">
            <span className="ph"><CameraIcon /></span>
            <span className="loc">Vale of Glamorgan · Heat pump</span>
          </div>
        </div>
        <p className="galnote">Placeholder frames — swap in your real drone &amp; install photography.</p>
      </div>
    </section>
  );
}
