const brands = [
  'GivEnergy', 'SolarEdge', 'Tesla Powerwall', 'JA Solar',
  'myenergi', 'Aira', 'Fox ESS', 'Duracell', 'Sunsynk', 'Growatt',
];

export function BrandStrip() {
  return (
    <div className="brandstrip">
      <div className="bstrip-head">Trusted technology we install</div>
      <div className="marquee">
        <div className="track">
          {/* Doubled for seamless infinite scroll */}
          {[...brands, ...brands].map((b, i) => (
            <span className="brand" key={i}>{b}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
