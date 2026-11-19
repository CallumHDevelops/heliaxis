import { z } from 'zod';

/**
 * Search settings (spec §10.5): one row per key in seo_setting, each with a zod schema and a default, so a missing or
 * half-written row never breaks a screen. Pure (no database), so the defaults and parsing can be tested; reads and writes
 * are in settings-server.ts.
 */

/** The spec §9 draft (Cal to confirm in Settings › Target areas). "installs" is Cal's column: yes where he said so. */
const A = (name: string, region: string, tier: number, installs: 'yes' | 'unknown', towns: string[], extra: { locationName?: string; gridCentre?: string } = {}) => ({
  name,
  region,
  tier,
  installs,
  towns,
  photos: false,
  gridCentre: extra.gridCentre ?? '',
  locationName: extra.locationName ?? '',
});
export const DEFAULT_AREAS = [
  A('Newport', 'South East Wales', 1, 'yes', ['Newport'], { locationName: 'Newport,Wales,United Kingdom', gridCentre: 'Caerleon' }),
  A('Cardiff', 'South East Wales', 1, 'yes', ['Cardiff'], { gridCentre: 'Lisvane' }),
  A('Chepstow and Caldicot', 'Monmouthshire', 1, 'yes', ['Chepstow', 'Caldicot']),
  A('Usk, Monmouth, Abergavenny', 'Monmouthshire', 1, 'unknown', ['Usk', 'Monmouth', 'Abergavenny']),
  A('Penarth and the Vale', 'Vale of Glamorgan', 1, 'unknown', ['Penarth', 'Vale of Glamorgan', 'Barry', 'Cowbridge']),
  A('Bridgend and Porthcawl', 'Bridgend', 1, 'yes', ['Bridgend', 'Porthcawl']),
  A('Swansea, Mumbles and Gower', 'South West Wales', 1, 'unknown', ['Swansea', 'Mumbles']),
  A('Carmarthen and the Tywi valley', 'West Wales', 1, 'yes', ['Carmarthen']),
  A('Bristol north-west', 'South West England', 1, 'yes', ['Bristol']),
  A('Chippenham and Corsham', 'Wiltshire', 1, 'yes', ['Chippenham', 'Corsham']),
  A('Cwmbran and Torfaen', 'South East Wales', 2, 'unknown', ['Cwmbran', 'Pontypool']),
  A('Caerphilly', 'South East Wales', 2, 'unknown', ['Caerphilly']),
  A('Pontypridd and Llantrisant', 'The Valleys', 2, 'yes', ['Pontypridd', 'Llantrisant']),
  A('Aberdare and Merthyr', 'The Valleys', 2, 'yes', ['Aberdare', 'Merthyr Tydfil']),
  A('Llandeilo, Ammanford, Llanelli', 'West Wales', 2, 'yes', ['Llandeilo', 'Ammanford', 'Llanelli']),
  A('Llandysul, Newcastle Emlyn, Cardigan', 'West Wales', 2, 'yes', ['Llandysul', 'Newcastle Emlyn', 'Cardigan']),
  A('Pembrokeshire, including Newport (Pembs)', 'West Wales', 2, 'yes', ['Narberth', 'Newport (Pembs)', 'Haverfordwest']),
  A('Brecon', 'Powys', 2, 'unknown', ['Brecon']),
  A('Portishead and Clevedon', 'North Somerset', 2, 'unknown', ['Portishead', 'Clevedon']),
  A('Thornbury', 'South Gloucestershire', 2, 'unknown', ['Thornbury']),
  A('Weston-super-Mare, Cheddar, Chew Valley', 'North Somerset', 2, 'unknown', ['Weston', 'Weston-super-Mare', 'Cheddar']),
  A('Bath, Bradford-on-Avon, Trowbridge, Frome', 'Bath and Wiltshire', 2, 'unknown', ['Bath', 'Bradford-on-Avon', 'Trowbridge', 'Frome']),
  A('Blackwood, Tredegar, Ebbw Vale', 'The Valleys', 3, 'unknown', ['Blackwood', 'Tredegar', 'Ebbw Vale']),
  A('Neath Port Talbot', 'South West Wales', 3, 'unknown', ['Neath', 'Port Talbot']),
  A('Aberystwyth', 'Ceredigion', 3, 'unknown', ['Aberystwyth']),
  A('Gloucestershire and Somerset towns', 'South West England', 3, 'unknown', ['Gloucester', 'Cheltenham', 'Stroud', 'Swindon']),
];

/** The tier of a tracked town (3 when it belongs to no listed area). */
export function tierOf(town: string | null | undefined, areas: { towns: string[]; tier: number }[]): number {
  if (!town) return 3;
  const t = town.toLowerCase();
  return areas.find((a) => a.towns.some((x) => x.toLowerCase() === t))?.tier ?? 3;
}

export const SEARCH_ROLES =['owner', 'admin', 'editor', 'viewer'] as const;
export type SearchRole = (typeof SEARCH_ROLES)[number];

export const SETTINGS = {
  business: z.object({
    name: z.string().default('Heliaxis'),
    phone: z.string().default('01633 965205'),
    address: z.string().default(''),
    area: z.string().default('South Wales and the South West'),
    // Only these three: the claims check rejects anything else (strategy §11).
    credentials: z.array(z.enum(['MCS', 'RECC', 'NAPIT'])).default(['MCS', 'RECC', 'NAPIT']),
    services: z.array(z.string()).default(['Solar PV', 'Battery storage', 'Air source heat pumps', 'EV chargers', 'Infrared heating']),
    hours: z.string().default(''),
    website: z.string().default('https://heliaxis.co.uk'),
    socials: z.array(z.string()).default([]),
  }),
  author: z.object({
    name: z.string().default('Cal'),
    role: z.string().default(''),
    bio: z.string().default(''),
    photo: z.string().default(''),
    links: z.array(z.string()).default([]),
  }),
  budget: z.object({
    /** Monthly ceiling per vendor, US dollars. Only the owner can change it. */
    caps: z.record(z.string(), z.number().nonnegative()).default({ dataforseo: 40 }),
    lowBalanceUsd: z.number().default(10),
  }),
  access: z.object({
    /** Profile id → role in Search. Admins not listed are "admin"; members with the portal ticked are "viewer". */
    roles: z.record(z.string(), z.enum(SEARCH_ROLES)).default({}),
  }),
  content: z.object({
    weeklyNewPages: z.number().int().min(0).default(3),
    originalityMaxOverlap: z.number().min(0).max(1).default(0.3),
    /** Proof items a page must have before drafting (the studio adds its own defaults). */
    requiredProof: z.array(z.string()).default([]),
    /** Who may approve pages besides admins and the owner (profile ids). */
    approvers: z.array(z.string()).default([]),
    bannedClaims: z.array(z.string()).default(['NICEIC', 'TrustMark', 'Which? Trusted Trader', 'award-winning', 'number one', '#1']),
  }),
  alerts: z.object({
    recipients: z.array(z.string()).default([]),
    rankDropPlaces: z.number().int().default(5),
  }),
  areas: z.object({
    list: z
      .array(
        z.object({
          name: z.string(),
          region: z.string().default(''),
          /** The tracked town names that belong to this area (the keyword's "town"). */
          towns: z.array(z.string()).default([]),
          tier: z.number().int().min(1).max(3).default(2),
          installs: z.enum(['yes', 'no', 'unknown']).default('unknown'),
          photos: z.boolean().default(false),
          gridCentre: z.string().default(''),
          locationName: z.string().default(''),
        }),
      )
      .default(DEFAULT_AREAS),
  }),
  checklist: z.object({
    /** Items a person confirms by hand ("Can't check automatically"), with when. */
    confirmed: z.record(z.string(), z.string()).default({}),
  }),
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]>;

export function parseSetting<K extends SettingKey>(key: K, raw: unknown): SettingValue<K> {
  const schema = SETTINGS[key];
  const r = schema.safeParse(raw ?? {});
  return (r.success ? r.data : schema.parse({})) as SettingValue<K>;
}

/** Keys only the owner may change: business facts, budget and access (spec §10.5). */
export const OWNER_ONLY: SettingKey[] = ['business', 'budget', 'access'];

/** Someone's role in Search. With no owner set yet, every admin counts as owner, so the first one can claim it. */
export function searchRole(profile: { id: string; role?: string | null }, access: SettingValue<'access'>): SearchRole {
  const set = access.roles[profile.id];
  if (set) return set;
  const anyOwner = Object.values(access.roles).includes('owner');
  if (profile.role === 'admin') return anyOwner ? 'admin' : 'owner';
  return 'viewer';
}

const RANK: Record<SearchRole, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };
export const atLeast = (role: SearchRole, need: SearchRole) => RANK[role] >= RANK[need];

/** What each role may do (spec §2 constraints). */
export const can = {
  spend: (r: SearchRole) => atLeast(r, 'admin'),
  publish: (r: SearchRole) => atLeast(r, 'admin'),
  draft: (r: SearchRole) => atLeast(r, 'editor'),
  editSetting: (r: SearchRole, key: SettingKey) => (OWNER_ONLY.includes(key) ? r === 'owner' : atLeast(r, 'admin')),
  overrideCap: (r: SearchRole) => r === 'owner',
};
