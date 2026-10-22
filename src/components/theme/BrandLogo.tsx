import Image from 'next/image';

/**
 * The Heliaxis® wordmark for the current theme: the ink one on light, the cream one with the gold
 * spark on dark (src/app/theme.css shows one of the two by html[data-theme], so it's right on the
 * first paint). Both carry the ® and are the same shape. Unoptimised, so the
 * service workers can keep the same two files for offline use.
 */
export function BrandLogo({
  width,
  priority,
  className,
  alt = 'Heliaxis',
}: {
  width: number | string;
  priority?: boolean;
  className?: string;
  alt?: string;
}) {
  return (
    <span className={className ? `hx-logo ${className}` : 'hx-logo'} style={{ width }}>
      {/* Both load straight away (not lazily), so switching theme never shows an empty header. */}
      <Image className="hx-logo--ink" src="/assets/heliaxis-logo-doc.png" alt={alt} width={995} height={211} unoptimized priority={priority} loading={priority ? undefined : 'eager'} />
      <Image className="hx-logo--light" src="/assets/heliaxis-logo-light.png" alt={alt} width={995} height={211} unoptimized priority={priority} loading={priority ? undefined : 'eager'} />
    </span>
  );
}
