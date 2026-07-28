export function EstimatorBand() {
  return (
    <div className="estband">
      <div className="wrap">
        <div className="reveal">
          <h2>See your savings in 20 seconds.</h2>
          <p>No forms, no phone calls — just a quick estimate of system size, savings and payback.</p>
        </div>
        <a className="btn btn-dark reveal d1" href="/solar-estimator" style={{ flex: 'none' }}>
          Try the free estimator
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </a>
      </div>
    </div>
  );
}
