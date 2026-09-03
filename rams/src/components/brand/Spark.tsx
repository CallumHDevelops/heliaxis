/** The Heliaxis mark: four tapered monopitch rays around an open centre. */
export function Spark({
  size = 14,
  fill = '#F8BC1E',
  className,
  style,
}: {
  size?: number;
  fill?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ray = 'M11 9.6 L13 9.6 L13 0.8 L11 3 Z';
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={fill}
      className={className}
      // Tailwind's preflight makes every svg display:block, which would break
      // the mark out of the wordmark and out of inline eyebrow text.
      style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
      aria-hidden="true"
    >
      {[0, 90, 180, 270].map((a) => (
        <g key={a} transform={`rotate(${a} 12 12)`}>
          <path d={ray} />
        </g>
      ))}
    </svg>
  );
}

/** Wordmark with the spark replacing the "I". */
export function Wordmark({
  tone = 'dark',
  className,
}: {
  tone?: 'dark' | 'light';
  className?: string;
}) {
  const colour = tone === 'light' ? '#F7F2E7' : '#211F18';
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.12em',
        whiteSpace: 'nowrap',
        fontFamily: 'var(--font-display)',
        fontWeight: 900,
        letterSpacing: '0.06em',
        color: colour,
        lineHeight: 1,
      }}
    >
      HEL
      <Spark size={'0.82em' as unknown as number} />
      AXIS
    </span>
  );
}
