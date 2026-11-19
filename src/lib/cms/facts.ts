/**
 * The facts sheet: everything the page builder and the validator are allowed to state about Heliaxis. One record (cms_kv key
 * "heliaxis-facts"), edited by a person under CMS › Facts sheet, and read on every builder run and every page check. Anything a page
 * claims that is not here is either left out or marked [[CONFIRM: …]]. Pure code (no database), so it can be tested; storage is in
 * facts-server.ts.
 */

export type Accreditation = { name: string; what: string };
/** A warranty or guarantee and whose it is. "25 yr warranty" must always say whose. */
export type Warranty = { label: string; years: number; yearsMax: number; by: string };
export type FundingFact = {
  id: string;
  name: string;
  /** The sentence pages may use. */
  text: string;
  audience: 'homes' | 'business' | 'both';
  /** YYYY-MM-DD the route ends, or '' when it has no end date. */
  until: string;
  /** YYYY-MM-DD a person last checked it, or '' if not yet. */
  checkedOn: string;
  /** Figures that may appear in copy because of this fact, for example "0% VAT". */
  figures: string[];
};
export type Testimonial = { id: string; name: string; town: string; product: string; quote: string; date: string; source: string };
export type CaseStudyFact = { id: string; title: string; town: string; systemSize: string; summary: string; imageIds: string[]; permission: boolean };
/** What a region has to show before an area page may be built for it. */
export type AreaProof = { slug: string; name: string; installs: number; reviews: number };

export type Facts = {
  businessName: string;
  legalName: string;
  /** The wording for where Heliaxis works, used on pages. */
  serviceArea: string;
  towns: string[];
  phone: string;
  /** A wa.me link (or number); blank until set. */
  whatsapp: string;
  hours: string;
  responsePromise: string;
  accreditations: Accreditation[];
  warranties: Warranty[];
  /** Wording for experience until there is an exact count. */
  experience: string;
  /** An exact verified install count, or '' (then only the wording above is used). */
  installCount: string;
  /** Hidden on every page until `verified` is ticked and value and platform are filled in. */
  rating: { value: string; count: string; platform: string; verified: boolean };
  funding: FundingFact[];
  testimonials: Testimonial[];
  caseStudies: CaseStudyFact[];
  areaProof: AreaProof[];
  /** Other figures pages may print (anything with a £ sign or a percentage that is not in a funding fact). */
  allowedFigures: string[];
  /** People who approve AI images (email addresses). */
  imageApprovers: string[];
  updatedAt: string;
  updatedBy: string;
};

/**
 * What is seeded: only facts someone confirmed, with where each came from.
 * - Service area, the six edge towns, phone and hours: Cal, 16 November 2026 (the spec's examples say "Wales & the South West": to confirm).
 * - Credentials: Cal, 16 November (MCS, RECC, NAPIT, TrustMark, SSIP, ISO 9001, ISO 14001) plus the EUPD award he can prove (19 November).
 * - Warranties and experience wording: Cal, 19 November.
 * - Response promise: the wording on the live quote form ("within one working day"). The spec's "same-day response" differs: to confirm.
 * - 0% VAT to 31 March 2027: the spec's own example; not yet checked by a person, so it shows as unchecked.
 */
export const DEFAULT_FACTS: Facts = {
  businessName: 'Heliaxis',
  legalName: 'Heliaxis Limited',
  serviceArea: 'South Wales and the South West',
  towns: ['Swindon', 'Bath', 'Bristol', 'Weston-super-Mare', 'Gloucester', 'Cheltenham'],
  phone: '01633 965205',
  whatsapp: '',
  hours: 'Monday to Friday 8am to 6pm, weekends 10am to 3pm',
  responsePromise: 'We call within one working day',
  accreditations: [
    { name: 'MCS', what: 'The recognised standard for small-scale renewable installations. An MCS-certified system can be paid for the power it exports under the Smart Export Guarantee. Heliaxis is certified through NAPIT.' },
    { name: 'RECC', what: 'The Renewable Energy Consumer Code, a consumer protection code its members agree to follow.' },
    { name: 'NAPIT', what: 'An electrical competence and certification body, through which Heliaxis holds its MCS certification.' },
    { name: 'TrustMark', what: 'The government-endorsed quality scheme for work in and around the home.' },
    { name: 'SSIP', what: 'Safety Schemes in Procurement: a health and safety assessment of contractors.' },
    { name: 'ISO 9001', what: 'A certified quality management system. It does not certify the installation itself.' },
    { name: 'ISO 14001', what: 'A certified environmental management system. It does not certify the installation itself.' },
    { name: 'EUPD Awarded Installer 2026', what: 'Recognised as an Awarded Installer for the United Kingdom by EUPD Research in 2026.' },
  ],
  warranties: [
    { label: 'Workmanship warranty', years: 7, yearsMax: 7, by: 'Heliaxis' },
    { label: 'Insurance-backed guarantee', years: 6, yearsMax: 6, by: 'Heliaxis, backed by insurance' },
    { label: 'Panel warranty', years: 25, yearsMax: 30, by: 'The panel manufacturer (it varies by panel)' },
  ],
  experience: 'Hundreds of arrays installed and many more specified.',
  installCount: '',
  rating: { value: '', count: '', platform: '', verified: false },
  funding: [
    {
      id: 'vat-0',
      name: '0% VAT on home solar and batteries',
      text: 'Solar panels and batteries installed in homes carry 0% VAT until 31 March 2027.',
      audience: 'homes',
      until: '2027-03-31',
      checkedOn: '',
      figures: ['0% VAT'],
    },
  ],
  testimonials: [],
  caseStudies: [],
  areaProof: [],
  allowedFigures: [],
  imageApprovers: [],
  updatedAt: '',
  updatedBy: '',
};

const str = (v: unknown, max: number) => String(v ?? '').replace(/\s+$/g, '').slice(0, max);
const trimStr = (v: unknown, max: number) => str(v, max).trim();
const arr = <T>(v: unknown, max: number): T[] => (Array.isArray(v) ? (v.slice(0, max) as T[]) : []);
const isDay = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));
const num = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
};
const unique = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

/** A facts record as saved: every field present and within bounds, whatever was sent. Missing fields fall back to the seed. */
export function cleanFacts(raw: unknown, base: Facts = DEFAULT_FACTS): Facts {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(v, k);
  const list = <T>(k: keyof Facts, map: (x: Record<string, unknown>) => T | null, max: number): T[] =>
    has(k as string)
      ? arr<Record<string, unknown>>(v[k as string], max)
          .map((x) => (x && typeof x === 'object' ? map(x) : null))
          .filter((x): x is T => x !== null)
      : (base[k] as unknown as T[]);
  const rating = (v.rating && typeof v.rating === 'object' ? v.rating : {}) as Record<string, unknown>;
  const out: Facts = {
    businessName: has('businessName') ? trimStr(v.businessName, 80) || base.businessName : base.businessName,
    legalName: has('legalName') ? trimStr(v.legalName, 120) || base.legalName : base.legalName,
    serviceArea: has('serviceArea') ? trimStr(v.serviceArea, 120) || base.serviceArea : base.serviceArea,
    towns: has('towns') ? unique(arr<unknown>(v.towns, 80).map((t) => trimStr(t, 60))) : base.towns,
    phone: has('phone') ? trimStr(v.phone, 40) || base.phone : base.phone,
    whatsapp: has('whatsapp') ? trimStr(v.whatsapp, 200) : base.whatsapp,
    hours: has('hours') ? trimStr(v.hours, 200) : base.hours,
    responsePromise: has('responsePromise') ? trimStr(v.responsePromise, 200) : base.responsePromise,
    accreditations: list<Accreditation>('accreditations', (x) => (trimStr(x.name, 80) ? { name: trimStr(x.name, 80), what: trimStr(x.what, 400) } : null), 30),
    warranties: list<Warranty>(
      'warranties',
      (x) => {
        if (!trimStr(x.label, 80)) return null;
        const years = num(x.years, 0, 60, 0);
        return { label: trimStr(x.label, 80), years, yearsMax: Math.max(years, num(x.yearsMax, 0, 60, years)), by: trimStr(x.by, 120) };
      },
      12,
    ),
    experience: has('experience') ? trimStr(v.experience, 300) : base.experience,
    installCount: has('installCount') ? trimStr(v.installCount, 40) : base.installCount,
    rating: has('rating')
      ? { value: trimStr(rating.value, 20), count: trimStr(rating.count, 20), platform: trimStr(rating.platform, 60), verified: rating.verified === true }
      : base.rating,
    funding: list<FundingFact>(
      'funding',
      (x) =>
        trimStr(x.name, 120)
          ? {
              id: trimStr(x.id, 64) || trimStr(x.name, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
              name: trimStr(x.name, 120),
              text: trimStr(x.text, 400),
              audience: x.audience === 'business' || x.audience === 'both' ? x.audience : 'homes',
              until: isDay(x.until) ? String(x.until) : '',
              checkedOn: isDay(x.checkedOn) ? String(x.checkedOn) : '',
              figures: unique(arr<unknown>(x.figures, 12).map((f) => trimStr(f, 40))),
            }
          : null,
      20,
    ),
    testimonials: list<Testimonial>(
      'testimonials',
      (x) =>
        trimStr(x.quote, 600) && trimStr(x.name, 80)
          ? { id: trimStr(x.id, 64) || `t-${trimStr(x.name, 20).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name: trimStr(x.name, 80), town: trimStr(x.town, 60), product: trimStr(x.product, 60), quote: trimStr(x.quote, 600), date: trimStr(x.date, 20), source: trimStr(x.source, 300) }
          : null,
      40,
    ),
    caseStudies: list<CaseStudyFact>(
      'caseStudies',
      (x) =>
        trimStr(x.title, 140)
          ? {
              id: trimStr(x.id, 64) || `c-${trimStr(x.title, 20).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
              title: trimStr(x.title, 140),
              town: trimStr(x.town, 60),
              systemSize: trimStr(x.systemSize, 40),
              summary: trimStr(x.summary, 800),
              imageIds: unique(arr<unknown>(x.imageIds, 30).map((i) => trimStr(i, 40))),
              permission: x.permission === true,
            }
          : null,
      40,
    ),
    areaProof: list<AreaProof>('areaProof', (x) => (trimStr(x.slug, 80) ? { slug: trimStr(x.slug, 80), name: trimStr(x.name, 80), installs: num(x.installs, 0, 1000, 0), reviews: num(x.reviews, 0, 1000, 0) } : null), 40),
    allowedFigures: has('allowedFigures') ? unique(arr<unknown>(v.allowedFigures, 60).map((f) => trimStr(f, 60))) : base.allowedFigures,
    imageApprovers: has('imageApprovers') ? unique(arr<unknown>(v.imageApprovers, 20).map((e) => trimStr(e, 120).toLowerCase())) : base.imageApprovers,
    updatedAt: trimStr(v.updatedAt, 40),
    updatedBy: trimStr(v.updatedBy, 120),
  };
  return out;
}

/** Whether a rating may be shown on a page: verified, with its value and where it comes from. */
export function ratingShown(f: Facts): boolean {
  return f.rating.verified && !!f.rating.value && !!f.rating.platform;
}

/** Every number of years the facts sheet allows a page to attach to a warranty or guarantee. */
export function allowedWarrantyYears(f: Facts): Set<number> {
  const s = new Set<number>();
  for (const w of f.warranties) {
    s.add(w.years);
    s.add(w.yearsMax);
  }
  return s;
}

/** Names of every credential the facts sheet says Heliaxis holds, lower-cased, for matching. */
export function heldCredentials(f: Facts): string[] {
  return f.accreditations.map((a) => a.name.toLowerCase());
}

/** What is still unconfirmed on the sheet, shown at the top of the editor so it is clear what pages can and cannot say yet. */
export function factsGaps(f: Facts): string[] {
  const gaps: string[] = [];
  if (!ratingShown(f)) gaps.push('No verified review rating: the rating row stays hidden on every page.');
  if (!f.installCount) gaps.push(`No exact install count: pages say “${f.experience || 'nothing about experience'}”.`);
  if (!f.testimonials.length) gaps.push('No approved testimonials: Testimonials sections stay hidden on the live site.');
  if (!f.caseStudies.length) gaps.push('No approved case studies: case-study blocks will not pass the page checks.');
  if (!f.whatsapp) gaps.push('No WhatsApp link set.');
  if (f.funding.some((x) => !x.checkedOn)) gaps.push('Some funding facts have not been checked by a person yet.');
  if (!f.imageApprovers.length) gaps.push('No image approvers named (needed before AI images).');
  return gaps;
}

/** True once a funding fact's end date has passed (so pages must stop saying it). */
export function fundingExpired(x: FundingFact, today: string): boolean {
  return !!x.until && x.until < today;
}
