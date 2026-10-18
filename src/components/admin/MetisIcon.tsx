/* eslint-disable @next/next/no-img-element -- a tiny static icon; next/image adds nothing here */
/**
 * Metis, the assistant: a Greek goddess in profile with a laurel crown (Metis was the goddess of
 * wisdom and counsel, wife of Zeus and mother of Athena).
 */
export function MetisIcon({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/assets/metis.webp"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: Math.round(size * 0.24), display: 'block', flex: 'none' }}
    />
  );
}
