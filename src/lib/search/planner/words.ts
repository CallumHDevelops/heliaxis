import type { Intent } from './config';

/**
 * Words: reading a search phrase for its service, town, intent and the kind of page it wants. Pure, no database.
 */

export type Service = 'solar' | 'battery' | 'heat_pump' | 'ev' | 'infrared' | 'general';
export const PAGE_TYPES = ['pillar', 'town', 'case_study', 'cost_guide', 'comparison', 'sector', 'article'] as const;
export type PageType = (typeof PAGE_TYPES)[number];

export const PAGE_TYPE_LABEL: Record<PageType, string> = {
  pillar: 'Service pillar',
  town: 'Service in a town',
  case_study: 'Case study',
  cost_guide: 'Cost guide',
  comparison: 'Comparison',
  sector: 'Commercial sector page',
  article: 'Supporting article',
};

export const SERVICE_LABEL: Record<Service, string> = {
  solar: 'Solar PV',
  battery: 'Battery storage',
  heat_pump: 'Heat pumps',
  ev: 'EV chargers',
  infrared: 'Infrared heating',
  general: 'General',
};

/** Lower case, punctuation out, single spaces. */
export function normalisePhrase(p: string): string {
  return String(p ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9£&+ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Crude singular for grouping by words ("solar panels" and "solar panel" are one phrase). */
const singular = (w: string) => (w.length > 3 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

export function detectService(phrase: string): Service {
  const p = normalisePhrase(phrase);
  if (/\bheat pumps?\b|\bashp\b|\bair source\b|\bground source\b/.test(p)) return 'heat_pump';
  if (/\bev\b|\bcar charg|\bcharging point|\bcharge point|\bwallbox\b|\bev charg/.test(p)) return 'ev';
  if (/\binfrared\b/.test(p)) return 'infrared';
  if (/\bsolar and battery\b/.test(p)) return 'solar';
  if (/\bbatter(y|ies)\b|\bstorage\b|\bpowerwall\b/.test(p)) return 'battery';
  if (/\bsolar\b|\bpv\b|\bphotovoltaic\b/.test(p)) return 'solar';
  return 'general';
}

/** Words that put a search on a page about a place, even without a town ("installers near me"). */
const LOCAL_WORDS = /\bnear me\b|\blocal\b|\binstallers?\b|\binstallations? companies\b|\bcompan(y|ies)\b|\bfitters?\b/;
const COST_WORDS = /\bcosts?\b|\bprices?\b|\bpricing\b|\bhow much\b|\bcheap(est)?\b|\bworth it\b|\bworth\b|\bgrants?\b|\bfinance\b|\bsavings?\b|\bpayback\b|\bfree\b|\bfunding\b|\bvat\b/;
const COMPARE_WORDS = /\bvs\b|\bversus\b|\bcompare\b|\bcomparison\b|\bdifference\b|\bor\b|\bbest\b|\bwhich\b|\balternatives?\b|\breviews?\b/;
const SECTOR_WORDS = /\bcommercial\b|\bbusiness(es)?\b|\bfarms?\b|\bagricultur|\bcare homes?\b|\bschools?\b|\bwarehouses?\b|\bindustrial\b|\boffices?\b|\blandlords?\b|\bppa\b|\bworkplace\b|\bchurch(es)?\b|\bhotels?\b|\bsme\b/;
const CASE_WORDS = /\bcase stud(y|ies)\b|\bour work\b|\bexample installs?\b|\bprojects?\b/;
const QUESTION_WORDS = /^(how|what|why|when|where|can|do|does|is|are|will|should|which)\b|\bguide\b|\bplanning permission\b|\bmaintenance\b|\bcleaning\b|\bin winter\b|\bwarrant(y|ies)\b|\bexplained\b|\bmeaning\b|\blifespan\b|\bhow long\b/;
const QUESTION_START = /^(how|what|why|when|where|can|do|does|is|are|will|should)\b/;

/** Place names well outside our area: national keyword ideas mentioning them are dropped from the pool. */
const OFF_AREA = /\b(london|manchester|birmingham|leeds|liverpool|sheffield|nottingham|leicester|glasgow|edinburgh|scotland|northern ireland|ireland|belfast|dublin|kent|essex|surrey|sussex|norfolk|suffolk|yorkshire|lancashire|cornwall|devon|plymouth|exeter|southampton|portsmouth|brighton|oxford|cambridge|milton keynes|reading|newcastle upon tyne|sunderland|hull|derby|coventry|wolverhampton|stoke|north wales|wrexham|bangor|usa|australia|india|canada|south africa)\b/;
const RETAIL_WORDS = /\bfor sale\b|\bamazon\b|\bebay\b|\bscrewfix\b|\btoolstation\b|\bb ?& ?q\b|\bkits?\b|\bdiy\b|\bcaravans?\b|\bmotorhomes?\b|\bcamping\b|\bportable\b|\bgarden lights?\b|\blights?\b|\bfountain\b|\bshed\b|\bphone charger\b|\bpower bank\b|\bstocks?\b|\bshares?\b|\bjobs?\b|\bcareers?\b|\bcourse\b|\btraining\b|\bwholesale\b/;

export const isLocalWords = (phrase: string) => LOCAL_WORDS.test(normalisePhrase(phrase));

/** Is a keyword idea worth a place in the pool: one of our services, not elsewhere in the country, not shopping for kit. */
export function isRelevantIdea(phrase: string): boolean {
  const p = normalisePhrase(phrase);
  if (!p || p.split(' ').length > 9) return false;
  if (detectService(p) === 'general') return false;
  return !OFF_AREA.test(p) && !RETAIL_WORDS.test(p);
}

/** Town names (from Settings › Target areas) to match against, longest first, with the Pembrokeshire Newport kept apart. */
export function townMatchers(towns: string[]): { town: string; re: RegExp }[] {
  const out: { town: string; re: RegExp }[] = [];
  for (const town of [...new Set(towns.filter(Boolean))]) {
    const base = normalisePhrase(town.replace(/\(([^)]*)\)/g, ' $1 '));
    const forms = new Set([base]);
    if (/\bpembs\b/.test(base)) forms.add(base.replace(/\bpembs\b/, 'pembrokeshire'));
    if (base === 'merthyr tydfil') forms.add('merthyr');
    if (base === 'weston super mare') forms.add('weston');
    for (const f of forms) if (f) out.push({ town, re: new RegExp(`\\b${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`) });
  }
  return out.sort((a, b) => b.re.source.length - a.re.source.length);
}

export function detectTown(phrase: string, matchers: { town: string; re: RegExp }[]): string | null {
  const p = normalisePhrase(phrase);
  return matchers.find((m) => m.re.test(p))?.town ?? null;
}

/**
 * Our three intents from DataForSEO's label (or our own stored one) and the words. Local commercial is the money search:
 * a town or "near me"/"installers" with a buying intent.
 */
export function intentClass(raw: string | null | undefined, phrase: string, town: string | null, ours = false): Intent {
  // Our own label (a tracked search, set in Settings › Keywords) stands as it is.
  if (ours && (raw === 'local_commercial' || raw === 'commercial' || raw === 'informational')) return raw;
  if (raw === 'local_commercial') return raw;
  const p = normalisePhrase(phrase);
  const local = !!town || LOCAL_WORDS.test(p);
  if (raw === 'informational' || raw === 'navigational') return 'informational';
  if (raw === 'commercial' || raw === 'transactional') return local ? 'local_commercial' : 'commercial';
  // No label: read the words.
  if (QUESTION_START.test(p) && !COST_WORDS.test(p)) return 'informational';
  if (local) return 'local_commercial';
  return 'commercial';
}

/** The kind of page a search wants, from its words. */
export function pageTypeOf(phrase: string, town: string | null, intent: Intent): PageType {
  const p = normalisePhrase(phrase);
  if (CASE_WORDS.test(p)) return 'case_study';
  if (SECTOR_WORDS.test(p)) return 'sector';
  if ((QUESTION_START.test(p) || intent === 'informational') && !COST_WORDS.test(p)) return 'article';
  if (town) return 'town';
  if (COST_WORDS.test(p)) return 'cost_guide';
  if (COMPARE_WORDS.test(p) && !LOCAL_WORDS.test(p)) return 'comparison';
  if (intent === 'informational' || QUESTION_WORDS.test(p)) return 'article';
  return 'pillar';
}

/** The "facet" used when grouping by words: the same service, town and kind of page go together. */
export function wordsKey(phrase: string, service: Service, town: string | null, intent: Intent): string {
  return `${service}|${town ? normalisePhrase(town) : ''}|${pageTypeOf(phrase, town, intent)}`;
}

/** The phrase with plurals folded, for "is this the same search". */
export const foldPhrase = (p: string) => normalisePhrase(p).split(' ').map(singular).join(' ');

/** host + path, without www, query, hash or trailing slash: how top-10 URLs are compared. */
export function normaliseUrl(u: string | null | undefined): string {
  const s = String(u ?? '').trim();
  if (!s) return '';
  try {
    const url = new URL(s.includes('://') ? s : `https://${s}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
    const path = url.pathname.replace(/\/+$/, '');
    return `${host}${path}`.toLowerCase();
  } catch {
    return s.toLowerCase().replace(/\/+$/, '');
  }
}

/** The outward code of a UK postcode ("NP20 1AB" → "NP20"), or null when it isn't one. */
export function outcode(pc: string | null | undefined): string | null {
  const s = String(pc ?? '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim();
  if (!s) return null;
  const sp = s.split(/\s+/);
  const out = sp.length > 1 ? sp[0] : s.length >= 5 && s.length <= 7 ? s.slice(0, -3) : s;
  return /^[A-Z]{1,2}\d[A-Z\d]?$/.test(out) ? out : null;
}

/**
 * Postcode districts for each target area (spec §9, "Enquiries in HAP" column, plus the districts named alongside), keyed
 * by area name as in Settings › Target areas. Used to check proof against the CRM.
 */
export const AREA_DISTRICTS: Record<string, string[]> = {
  Newport: ['NP10', 'NP18', 'NP19', 'NP20'],
  Cardiff: ['CF3', 'CF5', 'CF10', 'CF11', 'CF14', 'CF15', 'CF23', 'CF24'],
  'Chepstow and Caldicot': ['NP16', 'NP26'],
  'Usk, Monmouth, Abergavenny': ['NP15', 'NP7', 'NP25'],
  'Penarth and the Vale': ['CF62', 'CF63', 'CF64', 'CF71'],
  'Bridgend and Porthcawl': ['CF31', 'CF32', 'CF33', 'CF35', 'CF36'],
  'Swansea, Mumbles and Gower': ['SA1', 'SA2', 'SA3', 'SA4', 'SA5', 'SA6', 'SA7', 'SA8'],
  'Carmarthen and the Tywi valley': ['SA31', 'SA32', 'SA33'],
  'Bristol north-west': ['BS8', 'BS9', 'BS10', 'BS13', 'BS14'],
  'Chippenham and Corsham': ['SN13', 'SN14', 'SN15'],
  'Cwmbran and Torfaen': ['NP4', 'NP44'],
  Caerphilly: ['CF83'],
  'Pontypridd and Llantrisant': ['CF37', 'CF38', 'CF39', 'CF72'],
  'Aberdare and Merthyr': ['CF44', 'CF47', 'CF48'],
  'Llandeilo, Ammanford, Llanelli': ['SA14', 'SA15', 'SA18', 'SA19'],
  'Llandysul, Newcastle Emlyn, Cardigan': ['SA38', 'SA39', 'SA43', 'SA44'],
  'Pembrokeshire, including Newport (Pembs)': ['SA34', 'SA42', 'SA61', 'SA62', 'SA67'],
  Brecon: ['LD2', 'LD3'],
  'Portishead and Clevedon': ['BS20', 'BS21'],
  Thornbury: ['BS35'],
  'Weston-super-Mare, Cheddar, Chew Valley': ['BS22', 'BS23', 'BS24', 'BS26', 'BS27', 'BS40'],
  'Bath, Bradford-on-Avon, Trowbridge, Frome': ['BA1', 'BA2', 'BA11', 'BA13', 'BA14', 'BA15'],
  'Blackwood, Tredegar, Ebbw Vale': ['NP12', 'NP13', 'NP22', 'NP23'],
  'Neath Port Talbot': ['SA10', 'SA11', 'SA12', 'SA13'],
  Aberystwyth: ['SY23'],
  'Gloucestershire and Somerset towns': ['GL2', 'GL6', 'GL15', 'GL18', 'GL53', 'BA4', 'BA16', 'TA5', 'TA24'],
};

/** The service pillar each service links up to (strategy §4). */
export const PILLAR_PATH: Record<Service, string> = {
  solar: '/solar-panels',
  battery: '/battery-storage',
  heat_pump: '/air-source-heat-pumps',
  ev: '/ev-chargers',
  infrared: '/infrared-heating',
  general: '/',
};

/** Strategy §4 linking rules, as a hint for this kind of page. */
export function linkingHint(type: PageType, service: Service, town: string | null): string {
  const pillar = PILLAR_PATH[service];
  switch (type) {
    case 'pillar':
      return `Link to every supporting article on ${SERVICE_LABEL[service].toLowerCase()}, and to the quote page.`;
    case 'town':
      return `Link to the ${pillar} pillar (and any other service pillar it mentions) and to nearby town pages${town ? ` around ${town}` : ''}. Descriptive link text, not "click here".`;
    case 'case_study':
      return `Link to the ${pillar} pillar${town ? `, the ${town} town page` : ''} and the quote page.`;
    case 'sector':
      return `Link to the ${pillar} pillar, two related commercial articles and the quote page.`;
    default:
      return `Link up to the ${pillar} pillar, across to two related articles, and to the quote page. The pillar links back.`;
  }
}
