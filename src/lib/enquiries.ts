/** Shared enquiry CRM helpers (CMS + /admin/enquiries). */

export const ENQUIRY_STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost'] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

/** UI labels used by the CRM pipeline cards / dropdowns. */
export const ENQUIRY_STATUS_LABEL: Record<EnquiryStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Quoted',
  won: 'Won',
  lost: 'Lost',
};

export const INTEREST_KEYS: [string, string][] = [
  ['solar', 'Solar PV Installation'],
  ['battery', 'Battery Storage'],
  ['heatpump', 'Infrared Heating'],
  ['led', 'LED Lighting'],
  ['users', 'Consultation & Advisory'],
  ['coin', 'Funding & Grants'],
];

export type EnquiryRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  postcode: string | null;
  interest: string | null;
  property_type: string | null;
  source: string;
  status: string;
  created_at: string;
};

export type CrmLead = {
  id: string;
  name: string;
  org: string;
  email: string;
  phone: string;
  town: string;
  postcode: string;
  sector: string;
  interests: string[];
  msg: string;
  src: string;
  time: string;
  isnew: boolean;
  status: string; // UI label: New | Contacted | Quoted | Won | Lost
  created_at: string;
  lat?: number;
  lng?: number;
};

export function labelToDbStatus(label: string): EnquiryStatus | null {
  const n = label.trim().toLowerCase();
  if (n === 'quoted') return 'qualified';
  if ((ENQUIRY_STATUSES as readonly string[]).includes(n)) return n as EnquiryStatus;
  return null;
}

export function dbToUiStatus(status: string): string {
  const s = (status || 'new').toLowerCase() as EnquiryStatus;
  return ENQUIRY_STATUS_LABEL[s] || 'New';
}

export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const sec = Math.round((Date.now() - t) / 1000);
  if (sec < 60) return 'Just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 172800) return 'Yesterday';
  if (sec < 604800) return `${Math.floor(sec / 86400)} days ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function parseOrg(interest: string | null): string {
  if (!interest) return '';
  const m = interest.match(/(?:^|·)\s*Org:\s*([^·]+)/i);
  return m ? m[1].trim() : '';
}

export function parseMessage(interest: string | null): string {
  if (!interest) return '';
  const m = interest.match(/(?:^|·)\s*Message:\s*(.+)$/i);
  return m ? m[1].trim() : '';
}

/** Interest text only (strip Org / Message suffixes used for storage). */
export function interestCore(interest: string | null): string {
  if (!interest) return '';
  return interest
    .replace(/(?:^|·)\s*Org:\s*[^·]+/gi, '')
    .replace(/(?:^|·)\s*Message:\s*.+$/i, '')
    .replace(/^[\s·]+|[\s·]+$/g, '')
    .trim();
}

export function parseSector(interest: string | null, propertyType: string | null): string {
  if (interest) {
    const m = interest.match(/(?:^|·)\s*Sector:\s*([^·]+)/i);
    if (m) return m[1].trim();
  }
  const pt = (propertyType || '').trim();
  if (!pt) return '';
  if (pt === 'home') return 'Residential';
  if (pt === 'business') return 'Commercial';
  return pt;
}

/** Map free-text interest / labels to icon keys. */
export function interestIconKeys(interest: string | null): string[] {
  const s = interestCore(interest).toLowerCase();
  if (!s) return [];
  const keys: string[] = [];
  for (const [key, label] of INTEREST_KEYS) {
    if (s.includes(key) || s.includes(label.toLowerCase())) keys.push(key);
  }
  return keys;
}

export function rowToCrmLead(row: EnquiryRow): CrmLead {
  const ui = dbToUiStatus(row.status);
  const postcode = row.postcode || '';
  return {
    id: row.id,
    name: row.name,
    org: parseOrg(row.interest),
    email: row.email,
    phone: row.phone || '',
    town: postcode || '—',
    postcode,
    sector: parseSector(row.interest, row.property_type) || '—',
    interests: interestIconKeys(row.interest),
    msg: parseMessage(row.interest),
    src: row.source || 'website',
    time: relativeTime(row.created_at),
    isnew: ui === 'New',
    status: ui,
    created_at: row.created_at,
  };
}

/** Attach lat/lng + town from postcodes.io onto CRM leads. */
export async function enrichLeadsWithGeo(leads: CrmLead[]): Promise<CrmLead[]> {
  const { geocodePostcodes, geoKey } = await import('@/lib/geocode-postcode');
  const geos = await geocodePostcodes(leads.map((l) => l.postcode).filter(Boolean));
  return leads.map((l) => {
    if (!l.postcode) return l;
    const g = geos.get(geoKey(l.postcode));
    if (!g) return l;
    return {
      ...l,
      lat: g.lat,
      lng: g.lng,
      town: g.town || l.town,
      postcode: g.postcode || l.postcode,
    };
  });
}
