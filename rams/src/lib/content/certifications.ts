// Catalogue of the certificates Heliaxis holds and expects its operatives to
// hold. Used to populate the "add certification" picker — anything not listed
// can still be typed in free-hand.

export type CertCatalogueEntry = {
  title: string;
  category: string;
  issuingBody?: string;
  /** Typical validity in months, used to suggest an expiry date. */
  validityMonths?: number;
};

export const USER_CERT_CATEGORIES = [
  'Health & safety',
  'Electrical',
  'Work at height',
  'Renewables',
  'Gas & refrigerant',
  'First aid',
  'Plant & machinery',
  'Site access',
  'Other',
] as const;

export const COMPANY_CERT_CATEGORIES = [
  'Accreditation',
  'Scheme membership',
  'Insurance',
  'Policy',
  'Other',
] as const;

export const USER_CERT_CATALOGUE: CertCatalogueEntry[] = [
  // Health & safety
  { title: 'IOSH Working Safely', category: 'Health & safety', issuingBody: 'IOSH', validityMonths: 36 },
  { title: 'IOSH Managing Safely', category: 'Health & safety', issuingBody: 'IOSH', validityMonths: 36 },
  { title: 'IODH — IOSH Directing Safely', category: 'Health & safety', issuingBody: 'IOSH', validityMonths: 36 },
  { title: 'NEBOSH General Certificate', category: 'Health & safety', issuingBody: 'NEBOSH' },
  { title: 'SMSTS — Site Management Safety Training Scheme', category: 'Health & safety', issuingBody: 'CITB', validityMonths: 60 },
  { title: 'SSSTS — Site Supervision Safety Training Scheme', category: 'Health & safety', issuingBody: 'CITB', validityMonths: 60 },
  { title: 'Asbestos Awareness', category: 'Health & safety', issuingBody: 'UKATA', validityMonths: 12 },
  { title: 'Manual Handling', category: 'Health & safety', validityMonths: 36 },
  { title: 'Fire Marshal / Fire Warden', category: 'Health & safety', validityMonths: 36 },
  { title: 'COSHH Awareness', category: 'Health & safety', validityMonths: 36 },
  { title: 'Abrasive Wheels', category: 'Health & safety', validityMonths: 36 },

  // Electrical
  { title: 'City & Guilds 2382 — 18th Edition Wiring Regulations', category: 'Electrical', issuingBody: 'City & Guilds' },
  { title: 'City & Guilds 2391 — Inspection & Testing', category: 'Electrical', issuingBody: 'City & Guilds' },
  { title: 'City & Guilds 2365 / 5357 — Electrical Installation', category: 'Electrical', issuingBody: 'City & Guilds' },
  { title: 'ECS Gold Card — Installation Electrician', category: 'Electrical', issuingBody: 'JIB / ECS', validityMonths: 36 },
  { title: 'ECS Card — Electrical Improver / Labourer', category: 'Electrical', issuingBody: 'JIB / ECS', validityMonths: 36 },
  { title: 'Part P — Domestic Electrical Installer', category: 'Electrical' },
  { title: 'EV Charging Installation (C&G 2919)', category: 'Electrical', issuingBody: 'City & Guilds' },

  // Work at height
  { title: 'Working at Height & Harness Awareness', category: 'Work at height', validityMonths: 36 },
  { title: 'PASMA — Towers for Users', category: 'Work at height', issuingBody: 'PASMA', validityMonths: 60 },
  { title: 'IPAF 3a/3b — MEWP Operator', category: 'Work at height', issuingBody: 'IPAF', validityMonths: 60 },
  { title: 'IPAF 1b — Static Boom', category: 'Work at height', issuingBody: 'IPAF', validityMonths: 60 },
  { title: 'GWO Working at Height (incl. rescue)', category: 'Work at height', issuingBody: 'GWO', validityMonths: 24 },
  { title: 'Roof Work / Fragile Surfaces Awareness', category: 'Work at height', validityMonths: 36 },
  { title: 'Ladder & Stepladder User', category: 'Work at height', validityMonths: 36 },

  // Renewables
  { title: 'C&G 2399 — Solar PV Installation', category: 'Renewables', issuingBody: 'City & Guilds' },
  { title: 'BPEC Solar PV Installation', category: 'Renewables', issuingBody: 'BPEC' },
  { title: 'BPEC Battery Energy Storage Systems', category: 'Renewables', issuingBody: 'BPEC' },
  { title: 'BPEC / LCL Heat Pump Systems (MIS 3005)', category: 'Renewables', issuingBody: 'BPEC' },
  { title: 'Small Wind Turbine Installation (MIS 3003)', category: 'Renewables' },
  { title: 'Water Regulations / WRAS Approved Contractor', category: 'Renewables', issuingBody: 'WRAS', validityMonths: 60 },
  { title: 'Unvented Hot Water Systems (G3)', category: 'Renewables', validityMonths: 60 },

  // Gas & refrigerant
  { title: 'F-Gas Category I — Refrigerant Handling', category: 'Gas & refrigerant', issuingBody: 'City & Guilds / LCL', validityMonths: 60 },
  { title: 'Gas Safe Registered', category: 'Gas & refrigerant', issuingBody: 'Gas Safe Register', validityMonths: 60 },

  // First aid
  { title: 'Emergency First Aid at Work (EFAW)', category: 'First aid', validityMonths: 36 },
  { title: 'First Aid at Work (FAW)', category: 'First aid', validityMonths: 36 },

  // Plant & machinery
  { title: 'CPCS — Telehandler', category: 'Plant & machinery', issuingBody: 'CPCS', validityMonths: 60 },
  { title: 'CPCS A61 — Appointed Person (Lifting Operations)', category: 'Plant & machinery', issuingBody: 'CPCS', validityMonths: 60 },
  { title: 'CPCS A40 — Slinger / Signaller', category: 'Plant & machinery', issuingBody: 'CPCS', validityMonths: 60 },
  { title: 'Forklift / Counterbalance Operator', category: 'Plant & machinery', validityMonths: 36 },

  // Site access
  { title: 'CSCS Card', category: 'Site access', issuingBody: 'CSCS', validityMonths: 60 },
  { title: 'ECS Health, Safety & Environmental Assessment', category: 'Site access', issuingBody: 'ECS', validityMonths: 24 },
  { title: 'DBS Check', category: 'Site access', validityMonths: 36 },
  { title: 'Driving Licence', category: 'Site access', validityMonths: 120 },
];

export const COMPANY_CERT_CATALOGUE: CertCatalogueEntry[] = [
  { title: 'MCS Certification', category: 'Accreditation', issuingBody: 'MCS', validityMonths: 12 },
  { title: 'NICEIC Approved Contractor', category: 'Accreditation', issuingBody: 'NICEIC', validityMonths: 12 },
  { title: 'NAPIT Registration', category: 'Accreditation', issuingBody: 'NAPIT', validityMonths: 12 },
  { title: 'CHAS Accreditation', category: 'Accreditation', issuingBody: 'CHAS', validityMonths: 12 },
  { title: 'SafeContractor', category: 'Accreditation', issuingBody: 'SafeContractor', validityMonths: 12 },
  { title: 'Constructionline', category: 'Accreditation', issuingBody: 'Constructionline', validityMonths: 12 },
  { title: 'ISO 9001 — Quality Management', category: 'Accreditation', validityMonths: 36 },
  { title: 'ISO 14001 — Environmental Management', category: 'Accreditation', validityMonths: 36 },
  { title: 'ISO 45001 — Occupational Health & Safety', category: 'Accreditation', validityMonths: 36 },
  { title: 'RECC Membership', category: 'Scheme membership', issuingBody: 'RECC', validityMonths: 12 },
  { title: 'HIES Membership', category: 'Scheme membership', issuingBody: 'HIES', validityMonths: 12 },
  { title: 'TrustMark Registration', category: 'Scheme membership', issuingBody: 'TrustMark', validityMonths: 12 },
  { title: 'Employers Liability Insurance', category: 'Insurance', validityMonths: 12 },
  { title: 'Public Liability Insurance', category: 'Insurance', validityMonths: 12 },
  { title: 'Professional Indemnity Insurance', category: 'Insurance', validityMonths: 12 },
  { title: 'Products Liability Insurance', category: 'Insurance', validityMonths: 12 },
  { title: 'Contractors All Risks Insurance', category: 'Insurance', validityMonths: 12 },
  { title: 'Health & Safety Policy Statement', category: 'Policy', validityMonths: 12 },
  { title: 'Environmental Policy', category: 'Policy', validityMonths: 12 },
  { title: 'Quality Policy', category: 'Policy', validityMonths: 12 },
  { title: 'Waste Carrier Licence', category: 'Policy', issuingBody: 'Environment Agency / NRW', validityMonths: 36 },
];

export type ExpiryState = 'none' | 'valid' | 'expiring' | 'expired';

/** How close an expiry date is, for badge colouring and dashboard alerts. */
export function expiryState(expiry: string | null, warnDays = 60): ExpiryState {
  if (!expiry) return 'none';
  const days = daysUntil(expiry);
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days <= warnDays) return 'expiring';
  return 'valid';
}

export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return null;
  const today = new Date();
  const utcToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - utcToday) / 86_400_000);
}

export function expiryLabel(expiry: string | null): string {
  const state = expiryState(expiry);
  if (state === 'none') return 'No expiry';
  const days = daysUntil(expiry) ?? 0;
  if (state === 'expired') return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
  if (state === 'expiring') return `Expires in ${days} day${days === 1 ? '' : 's'}`;
  return 'In date';
}
