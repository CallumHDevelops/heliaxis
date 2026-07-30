const brands = [
  'GivEnergy', 'SolarEdge', 'Tesla Powerwall', 'JA Solar',
  'myenergi', 'Aira', 'Fox ESS', 'Duracell', 'Sunsynk', 'Growatt',
];

function BrandSet({ hidden }: { hidden?: boolean }) {
  return (
    <div className="bset" aria-hidden={hidden || undefined}>
      {brands.map((b) => (
        <span className="brand" key={b}>{b}</span>
      ))}
    </div>
  );
}

export function BrandStrip() {
  return (
    <div className="brandstrip">
      <div className="bstrip-head">Trusted technology we install</div>
      <div className="marquee">
        <div className="track">
          <BrandSet />
          <BrandSet hidden />
        </div>
      </div>
    </div>
  );
}
