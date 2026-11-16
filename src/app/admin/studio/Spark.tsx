export function Spark({ size = 13 }: { size?: number }) {
  const ray = 'M11 9.6 L13 9.6 L13 0.8 L11 3 Z';
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
      {[0, 90, 180, 270].map((a) => (
        <g key={a} transform={`rotate(${a} 12 12)`}>
          <path d={ray} />
        </g>
      ))}
    </svg>
  );
}
