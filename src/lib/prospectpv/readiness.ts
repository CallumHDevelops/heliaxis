/**
 * What's still missing before letters can be printed, as a checklist the admin
 * shows with links to where each item is set. "Blocking" items stop a letter
 * being created; "advisory" items hide a feature (calculator, estimates).
 */
import { missingForActive, type PackageForm } from './packageForm';
import { calculatorReady, type AdminSettings } from './settings';

export type ReadinessItem = { label: string; href: string };
export type Readiness = { blocking: ReadinessItem[]; advisory: ReadinessItem[] };

const S = '/admin/sales/prospectpv/settings';

export function readiness(args: { settings: AdminSettings; hasAccreditations: boolean; pkg?: PackageForm | null }): Readiness {
  const { settings: s } = args;
  const blocking: ReadinessItem[] = [];
  const advisory: ReadinessItem[] = [];
  if (!s.company.phone) blocking.push({ label: 'Company phone number', href: `${S}#company` });
  if (!s.company.registered_details) blocking.push({ label: 'Registered company details (footer)', href: `${S}#company` });
  if (!s.company.opt_out_url) blocking.push({ label: 'Opt-out web address', href: `${S}#company` });
  if (!s.company.privacy_url) blocking.push({ label: 'Privacy notice web address', href: `${S}#company` });
  if (!s.sender.name) blocking.push({ label: 'Name of the person who signs the letters', href: `${S}#company` });
  if (!args.hasAccreditations) blocking.push({ label: 'Accreditation logos image (MCS, RECC, NAPIT)', href: `${S}#images` });
  if (args.pkg) for (const m of missingForActive(args.pkg)) blocking.push({ label: `${args.pkg.name}: ${m}`, href: '/admin/sales/prospectpv/packages' });

  if (!calculatorReady(s.assumptions)) advisory.push({ label: 'Savings assumptions (export rate, off-peak saving, standing charge). The landing page calculator stays hidden until set', href: `${S}#savings` });
  if (s.scaffolding.rate_per_m2_gbp === null) advisory.push({ label: 'Scaffolding rate per m². Scaffolding figures stay blank until set', href: `${S}#scaffolding` });
  if (s.generation.yield_kwh_per_kwp === null) advisory.push({ label: 'Yearly yield per kWp, to pre-fill the generation figure', href: `${S}#savings` });
  return { blocking, advisory };
}
