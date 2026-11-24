/**
 * The weekly auto-draft's rules (pure, tested): which planned pages to start, and the proof items that can be filled in
 * from facts we know for certain. Everything personal to a page (a real project, a photo with permission, a review) is
 * left for a person: the proof pack exists so pages carry Heliaxis-only facts, never guesses.
 */

export type ClusterLite = { id: number; action: string; status: string; score: number | null; name: string; hold_reason?: string | null };

/** The top planned pages to start this week: new pages ("create") still at Idea, best score first, up to the free slots. */
export function pickClusters(clusters: ClusterLite[], started: Set<number>, slots: number): ClusterLite[] {
  if (slots <= 0) return [];
  return clusters
    .filter((c) => c.action === 'create' && c.status === 'idea' && !started.has(c.id) && (c.score ?? 0) > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, slots);
}

/**
 * The electricity network operator. Every area Heliaxis covers (South Wales and the South West of England) is National
 * Grid Electricity Distribution's South Wales or South West licence area.
 */
export function networkOperator(town: string | null | undefined, region?: string | null): string {
  const where = `${town ?? ''} ${region ?? ''}`.toLowerCase();
  if (/north wales|wrexham|bangor|rhyl|llandudno|mersey/.test(where)) return '';
  return 'National Grid Electricity Distribution';
}

/** The council for a tracked town; '' when not certain (a person fills it in). */
const COUNCILS: Record<string, string> = {
  newport: 'Newport City Council',
  cardiff: 'Cardiff Council',
  bridgend: 'Bridgend County Borough Council',
  porthcawl: 'Bridgend County Borough Council',
  swansea: 'Swansea Council',
  mumbles: 'Swansea Council',
  cwmbran: 'Torfaen County Borough Council',
  pontypool: 'Torfaen County Borough Council',
  caerphilly: 'Caerphilly County Borough Council',
  penarth: 'Vale of Glamorgan Council',
  barry: 'Vale of Glamorgan Council',
  'vale of glamorgan': 'Vale of Glamorgan Council',
  chepstow: 'Monmouthshire County Council',
  caldicot: 'Monmouthshire County Council',
  monmouth: 'Monmouthshire County Council',
  abergavenny: 'Monmouthshire County Council',
  usk: 'Monmouthshire County Council',
  pontypridd: 'Rhondda Cynon Taf County Borough Council',
  llantrisant: 'Rhondda Cynon Taf County Borough Council',
  aberdare: 'Rhondda Cynon Taf County Borough Council',
  'merthyr tydfil': 'Merthyr Tydfil County Borough Council',
  carmarthen: 'Carmarthenshire County Council',
  llanelli: 'Carmarthenshire County Council',
  bristol: 'Bristol City Council',
  bath: 'Bath and North East Somerset Council',
  swindon: 'Swindon Borough Council',
  gloucester: 'Gloucester City Council',
  cheltenham: 'Cheltenham Borough Council',
  chippenham: 'Wiltshire Council',
  corsham: 'Wiltshire Council',
};
export function councilFor(town: string | null | undefined): string {
  return COUNCILS[String(town ?? '').trim().toLowerCase()] ?? '';
}

/** Real reviews we hold (social monitoring): 4 or 5 stars, with words and a name. The newest first, at most two. */
export type MentionLite = { kind: string; platform: string; rating: number | null; text: string | null; author_display_name: string | null; created_at: string; is_synthetic?: boolean; author_is_own?: boolean };
export function reviewsFromMentions(rows: MentionLite[]): { quote: string; name: string; town: string; source: string; date: string; stars: number | null }[] {
  return rows
    .filter((r) => r.kind === 'review' && !r.is_synthetic && !r.author_is_own && (r.rating ?? 0) >= 4 && (r.text ?? '').trim().length >= 20 && (r.author_display_name ?? '').trim())
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 2)
    .map((r) => ({
      quote: String(r.text).trim().slice(0, 400),
      name: String(r.author_display_name).trim(),
      town: '',
      source: r.platform.charAt(0).toUpperCase() + r.platform.slice(1),
      date: r.created_at.slice(0, 10),
      stars: r.rating,
    }));
}
