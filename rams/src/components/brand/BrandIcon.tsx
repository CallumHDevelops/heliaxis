import type { Sector, TechnologyId } from '@/lib/types';

/**
 * Duotone icons from the Heliaxis brand sprite (public/brand/icons.svg).
 * Gold fill at 30% behind a charcoal outline, per the brand spec — the sprite
 * already carries that treatment, so this just references a symbol.
 */
export type IconName =
  | 'solar' | 'panel' | 'battery' | 'led' | 'bulb' | 'heatpump' | 'wind'
  | 'house' | 'building' | 'factory' | 'warehouse' | 'bolt' | 'meter'
  | 'document' | 'clipboard' | 'check' | 'calendar' | 'clock' | 'mappin'
  | 'phone' | 'mail' | 'download' | 'truck' | 'gauge' | 'thermometer';

export function BrandIcon({
  name,
  size = 20,
  className,
  title,
}: {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      {title && <title>{title}</title>}
      <use href={`/brand/icons.svg#ic-${name}`} />
    </svg>
  );
}

const TECH_ICONS: Record<TechnologyId, IconName> = {
  solar_pv: 'solar',
  battery_storage: 'battery',
  ashp: 'heatpump',
  led_lighting: 'led',
  small_wind: 'wind',
};

export function technologyIcon(id: TechnologyId): IconName {
  return TECH_ICONS[id];
}

export function sectorIcon(sector: Sector): IconName {
  return sector === 'commercial' ? 'building' : 'house';
}

/** Icon in a hairline tile, per the brand spec's icon-tile pattern. */
export function IconTile({
  name,
  size = 20,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-[2px] border border-[color:var(--line)] bg-paper-2 p-1.5 transition-colors ${className ?? ''}`}
    >
      <BrandIcon name={name} size={size} />
    </span>
  );
}
