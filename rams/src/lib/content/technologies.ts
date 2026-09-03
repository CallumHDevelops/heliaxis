import type { Sector, TechnologyId } from '@/lib/types';

export type TechnologyDef = {
  id: TechnologyId;
  name: string;
  shortName: string;
  /** Default document title, with {sector} substituted. */
  titleTemplate: string;
  blurb: string;
};

export const TECHNOLOGIES: TechnologyDef[] = [
  {
    id: 'solar_pv',
    name: 'Solar PV',
    shortName: 'Solar PV',
    titleTemplate: 'Solar PV Installation — {sector}',
    blurb: 'Roof- and ground-mounted photovoltaic arrays, inverters and AC/DC works.',
  },
  {
    id: 'battery_storage',
    name: 'Battery Energy Storage',
    shortName: 'Battery',
    titleTemplate: 'Battery Energy Storage Installation — {sector}',
    blurb: 'Lithium-ion storage systems, hybrid inverters and associated protection.',
  },
  {
    id: 'ashp',
    name: 'Air Source Heat Pump',
    shortName: 'ASHP',
    titleTemplate: 'Air Source Heat Pump Installation — {sector}',
    blurb: 'Monobloc and split ASHP units, hydronic pipework, cylinders and controls.',
  },
  {
    id: 'led_lighting',
    name: 'LED Lighting',
    shortName: 'LED',
    titleTemplate: 'LED Lighting Upgrade — {sector}',
    blurb: 'Luminaire replacement and lighting control upgrades in occupied premises.',
  },
  {
    id: 'small_wind',
    name: 'Small-scale Wind',
    shortName: 'Wind',
    titleTemplate: 'Small-scale Wind Turbine Installation — {sector}',
    blurb: 'Sub-50kW mast- and tower-mounted turbines, foundations and grid connection.',
  },
];

export function technology(id: TechnologyId): TechnologyDef {
  return TECHNOLOGIES.find((t) => t.id === id) ?? TECHNOLOGIES[0];
}

export function technologyName(id: TechnologyId): string {
  return technology(id).name;
}

export function sectorName(sector: Sector): string {
  return sector === 'commercial' ? 'Commercial' : 'Residential';
}

export function defaultTitle(id: TechnologyId, sector: Sector): string {
  return technology(id).titleTemplate.replace('{sector}', sectorName(sector));
}
