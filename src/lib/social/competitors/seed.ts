/**
 * Starting lists for the competitor portal (docs/social-monitoring/09). The tracked six come from the brief; the
 * suggestions need an admin's approval before anything is tracked; keywords and AI-answer questions are editable.
 * Everything seeded from research is unverified until someone checks it.
 */

export type SeedCompetitor = { name: string; base_location: string; website?: string; scope?: 'local' | 'national_with_local_pages'; notes?: string };

export const SEED_TRACKED: SeedCompetitor[] = [
  { name: 'Green Energy Solar', base_location: 'Cardiff (St Mellons)' },
  { name: 'SolarSense', base_location: 'Bristol' },
  { name: 'GetZero', base_location: 'Newport (Caerleon)' },
  { name: 'InspireGreen', base_location: 'Cardiff' },
  { name: 'ICE Solar', base_location: 'Risca', notes: 'Official website unconfirmed: add it once checked.' },
  { name: 'Silverstone Green Energy', base_location: 'Pembrokeshire' },
];

export const SEED_SUGGESTED: SeedCompetitor[] = [
  { name: 'The Solar House', base_location: 'Wales' },
  { name: 'Limitless Energy', base_location: 'Wales' },
  { name: 'JM Renewable Solutions', base_location: 'Wales' },
  { name: 'Celtic Green Energy', base_location: 'Wales' },
  { name: 'Cymru Solar', base_location: 'Wales' },
  { name: 'ECOnomy Energy Group', base_location: 'Wales' },
  { name: 'Glow Green', base_location: 'National', scope: 'national_with_local_pages' },
  { name: 'Sunsave', base_location: 'National', scope: 'national_with_local_pages' },
  { name: 'Urban Solar', base_location: 'Wales' },
  { name: 'Lectogic', base_location: 'Wales' },
  { name: 'Heatforce (Wales)', base_location: 'Wales' },
  { name: 'Greenlands Heating', base_location: 'Wales' },
  { name: 'Wye Energy Group', base_location: 'Wales' },
];

const TOWNS4 = ['Cardiff', 'Swansea', 'Newport', 'Bridgend'];
const PER_TOWN = ['solar panel installers {town}', 'solar panels {town}', 'battery storage {town}', 'home battery installer {town}', 'heat pump installer {town}', 'air source heat pump {town}', 'solar and battery {town}', 'EV charger installer {town}', 'MCS solar installer {town}'];

/** The 40 starting search terms: 9 services in 4 towns, solar panel cost in two, and two for the Vale of Glamorgan. */
export function seedKeywords(): { keyword: string; town: string }[] {
  const out: { keyword: string; town: string }[] = [];
  for (const t of TOWNS4) for (const p of PER_TOWN) out.push({ keyword: p.replace('{town}', t), town: t });
  for (const t of ['Cardiff', 'Swansea']) out.push({ keyword: `solar panel cost ${t}`, town: t });
  out.push({ keyword: 'solar panels Vale of Glamorgan', town: 'Vale of Glamorgan' }, { keyword: 'heat pump Vale of Glamorgan', town: 'Vale of Glamorgan' });
  return out;
}

/** The ten local questions asked of an AI assistant each month. */
export const SEED_GEO_PROMPTS: { prompt: string; town: string; service: string }[] = [
  { prompt: 'Who are the best solar panel installers in Cardiff?', town: 'Cardiff', service: 'solar' },
  { prompt: 'Who are the best solar panel installers in Newport, South Wales?', town: 'Newport', service: 'solar' },
  { prompt: 'Which companies install home batteries in Swansea?', town: 'Swansea', service: 'battery' },
  { prompt: 'Which companies install home batteries in Cardiff?', town: 'Cardiff', service: 'battery' },
  { prompt: 'Who installs air source heat pumps in South Wales?', town: 'South Wales', service: 'heat pump' },
  { prompt: 'Who can install an air source heat pump in Newport?', town: 'Newport', service: 'heat pump' },
  { prompt: 'Which MCS certified solar installers cover Bridgend?', town: 'Bridgend', service: 'solar' },
  { prompt: 'Who installs EV chargers for homes in Cardiff?', town: 'Cardiff', service: 'ev charger' },
  { prompt: 'Which solar companies in South Wales offer commercial solar for businesses?', town: 'South Wales', service: 'commercial solar' },
  { prompt: 'What is a reputable solar and battery installer near Cwmbran?', town: 'Cwmbran', service: 'solar' },
];
