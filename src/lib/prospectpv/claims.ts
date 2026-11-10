/**
 * GoodWe ESA benefit claims (spec 6.3). A claim shows only if the package's
 * `claims` list includes it AND the hardware supports it:
 * heating needs heated_module, backup needs backup_included.
 */
import type { ClaimKey, PackageRow } from './types';

export const CLAIM_ORDER: ClaimKey[] = ['ai_tariff', 'safety', 'heating', 'expandable', 'backup', 'all_in_one'];

export function resolveClaims(pkg: Pick<PackageRow, 'claims' | 'heated_module' | 'backup_included'>): ClaimKey[] {
  const wanted = new Set(pkg.claims);
  return CLAIM_ORDER.filter((k) => {
    if (!wanted.has(k)) return false;
    if (k === 'heating') return pkg.heated_module;
    if (k === 'backup') return pkg.backup_included;
    return true;
  });
}

export type Benefit = { key: ClaimKey; title: string; short: string; long: string };

export const BENEFITS: Record<ClaimKey, Benefit> = {
  ai_tariff: {
    key: 'ai_tariff',
    title: 'AI tariff optimisation',
    short: 'Charges cheap, uses stored power at peak.',
    long: 'Charges on cheap overnight rates and uses stored power at peak times.',
  },
  safety: {
    key: 'safety',
    title: 'Built-in safety',
    short: 'LFP cells, fire suppression, IP66.',
    long: 'LFP battery cells, integrated fire suppression and IP66 weatherproofing.',
  },
  heating: {
    key: 'heating',
    title: 'Winter-ready',
    short: 'Battery heating for cold-weather charging.',
    long: 'Battery heating keeps it charging efficiently when temperatures drop.',
  },
  expandable: {
    key: 'expandable',
    title: 'Expandable',
    short: 'Add modules later for an EV or heat pump.',
    long: 'Add battery modules later for an EV or heat pump.',
  },
  backup: {
    key: 'backup',
    title: 'Backup power',
    short: 'Switches over in under 4 ms.',
    long: 'Switches to backup in under 4 milliseconds if the grid goes down.',
  },
  all_in_one: {
    key: 'all_in_one',
    title: 'All-in-one',
    short: 'One neat, quiet unit.',
    long: 'Inverter and battery together in one neat, quiet unit.',
  },
};
