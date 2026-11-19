import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCmsRendered } from '@/lib/cms-rendered';
import { generatePage, normalizeBlocks } from '@/lib/cms/ai-page';
import { generateBlogPost } from '@/lib/blog/ai';
import { getSetting } from '@/lib/search/server';
import { clearAction, raiseAction } from '@/lib/search/inbox';
import { weekOf } from '@/lib/search/schedule';
import { assertAiBudget } from '@/lib/search/ai-budget';
import { draftWaitSeconds } from '@/lib/search/ai-cap';
import { buildBrief, defaultKind, guessPageType, type BriefTarget, type FactsRow, type SerpRow, type TeardownRow } from './brief';
import { canSubmit, runChecks } from './checks';
import { normaliseProof, packageProof, proofStatus, requiredProof, type PackageRow } from './proof';
import { htmlToText, normPath } from './text';
import { buildSchema, publicPath, writerBrief, type WriterFacts } from './writer';
import type { Brief, Checks, ContentKind, ContentMode, ContentStatus, Draft, DraftBlock, Intent, PageType, Proof } from './types';

/**
 * Content studio, server side (spec §5 M4): build the brief from stored rows, keep the proof pack, write the draft
 * through the existing CMS and blog writers, and run the checks. Publishing is in publish.ts, measuring in measure-job.ts.
 */

export type Db = ReturnType<typeof createAdminClient>;

export type ContentRow = {
  id: number;
  cluster_id: number | null;
  kind: ContentKind;
  mode: ContentMode;
  title: string | null;
  slug: string | null;
  brief: Brief | Record<string, never>;
  proof: Proof | Record<string, never>;
  draft: Draft | Record<string, never>;
  checks: (Checks & { published?: PublishInfo; error?: string; drafting?: { at: string; by: string } }) | Record<string, never>;
  status: ContentStatus;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  published_ref: string | null;
  published_at: string | null;
  cost_usd: number;
  created_at: string;
  updated_at: string;
};

export type PublishInfo = { path: string; url: string; at: string; by: string; inSitemap: boolean; indexNow: string };

export const site = () => process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://heliaxis.co.uk';

/** Pages outside the website editor that the sitemap lists (src/app/sitemap.ts), for internal links. */
const CODE_PAGES = [
  { path: '/', title: 'Home' },
  { path: '/commercial-funding', title: 'Commercial funding' },
  { path: '/free-solar-quote', title: 'Free solar quote' },
  { path: '/solar-estimator', title: 'Solar estimator' },
  { path: '/book-a-survey', title: 'Book a survey' },
  { path: '/blog', title: 'Blog' },
  { path: '/newport-net-zero-grant', title: 'Newport net zero grant' },
  { path: '/warehousing', title: 'Warehousing' },
];

export type OurLivePage = { path: string; title: string; description: string; html: string; text: string; schemaTypes: string[] };

/** Our published pages: the website editor's live snapshot (what the sitemap lists), plus the pages built in code. */
export async function ourPages(): Promise<OurLivePage[]> {
  const rendered = await getCmsRendered().catch(() => null);
  const out = new Map<string, OurLivePage>();
  for (const p of rendered?.pages ?? []) {
    if (p.seo?.noindex || !(p.html || '').trim()) continue;
    const path = normPath(p.slug || '/') || '/';
    const seo = (p.seo ?? {}) as { title?: string; desc?: string; jsonLd?: string };
    out.set(path, { path, title: seo.title || p.name || path, description: seo.desc || '', html: p.html, text: htmlToText(p.html), schemaTypes: schemaTypes(seo.jsonLd) });
  }
  for (const c of CODE_PAGES) if (!out.has(c.path)) out.set(c.path, { path: c.path, title: c.title, description: '', html: '', text: '', schemaTypes: [] });
  return [...out.values()];
}

function schemaTypes(jsonLd: unknown): string[] {
  try {
    const o = typeof jsonLd === 'string' ? JSON.parse(jsonLd) : jsonLd;
    const nodes = Array.isArray(o) ? o : o?.['@graph'] ?? (o ? [o] : []);
    return nodes.flatMap((n: { '@type'?: string | string[] }) => (Array.isArray(n?.['@type']) ? n['@type'] : n?.['@type'] ? [n['@type']] : []));
  } catch {
    return [];
  }
}

export async function townNames(db: Db = createAdminClient()): Promise<string[]> {
  const areas = await getSetting('areas', db);
  return [...new Set(areas.list.flatMap((a) => [...a.towns, ...a.name.split(/,| and /).map((x) => x.trim())]).filter((t) => t.length > 2))];
}

/** Settings › Content rules, plus fields the schema may not list yet (required proof items, approvers). */
export async function contentRules(db: Db = createAdminClient()) {
  const [rules, raw] = await Promise.all([getSetting('content', db), db.from('seo_setting').select('value').eq('key', 'content').maybeSingle()]);
  const v = (raw.data?.value ?? {}) as { requiredProof?: unknown };
  return { ...rules, requiredProof: Array.isArray(v.requiredProof) ? (v.requiredProof as string[]) : null };
}

export async function writerFacts(db: Db = createAdminClient()): Promise<WriterFacts> {
  const [b, a, rules] = await Promise.all([getSetting('business', db), getSetting('author', db), getSetting('content', db)]);
  return { business: { name: b.name, phone: b.phone, area: b.area, credentials: b.credentials, website: b.website, address: b.address }, author: a, bannedClaims: rules.bannedClaims };
}

/* ── The target: a planner cluster, or one tracked search ───────────────────────────────────────────────────────── */

type ClusterRow = { id: number; name: string; primary_keyword_id: number | null; keywords: { phrase?: string; keyword_id?: number }[] | null; page_type: string | null; action: 'improve' | 'create' | 'hold'; target_page: string | null; town: string | null; service: string | null };
type KeywordRow = { id: number; phrase: string; service: string | null; town: string | null; intent: Intent; target_page: string | null; cluster_id: number | null };

const PAGE_TYPES: PageType[] = ['pillar', 'town', 'case_study', 'cost_guide', 'comparison', 'sector', 'article'];

export async function loadTarget(db: Db, from: { clusterId?: number | null; keywordId?: number | null; page?: string | null }): Promise<{ target: BriefTarget; clusterId: number | null }> {
  if (from.clusterId) {
    const { data: c } = await db.from('seo_cluster').select('id, name, primary_keyword_id, keywords, page_type, action, target_page, town, service').eq('id', from.clusterId).maybeSingle();
    if (!c) throw new Error('That planner group no longer exists.');
    const cl = c as ClusterRow;
    const ids = [...new Set([cl.primary_keyword_id, ...(cl.keywords ?? []).map((k) => k.keyword_id)].filter((x): x is number => typeof x === 'number'))];
    const { data: kws } = ids.length ? await db.from('seo_keyword').select('id, phrase, service, town, intent, target_page, cluster_id').in('id', ids) : { data: [] };
    const list = (kws ?? []) as KeywordRow[];
    const primary = list.find((k) => k.id === cl.primary_keyword_id) ?? list[0];
    const phrases = [...new Set([primary?.phrase, ...(cl.keywords ?? []).map((k) => k.phrase), ...list.map((k) => k.phrase)].filter((x): x is string => !!x))];
    const intent = (primary?.intent ?? 'local_commercial') as Intent;
    const town = cl.town ?? primary?.town ?? null;
    const p = primary?.phrase ?? cl.name;
    const pageType = PAGE_TYPES.includes(cl.page_type as PageType) ? (cl.page_type as PageType) : guessPageType({ town, intent, primary: p });
    return {
      clusterId: cl.id,
      target: { name: cl.name, primary: p, phrases, keywordIds: ids, service: cl.service ?? primary?.service ?? null, town, intent, pageType, action: cl.action, targetPage: from.page ?? cl.target_page ?? primary?.target_page ?? null },
    };
  }
  if (from.keywordId) {
    const { data: k } = await db.from('seo_keyword').select('id, phrase, service, town, intent, target_page, cluster_id').eq('id', from.keywordId).maybeSingle();
    if (!k) throw new Error('That search is not tracked.');
    const kw = k as KeywordRow;
    return {
      clusterId: kw.cluster_id ?? null,
      target: { name: kw.phrase, primary: kw.phrase, phrases: [kw.phrase], keywordIds: [kw.id], service: kw.service, town: kw.town, intent: kw.intent, pageType: guessPageType({ town: kw.town, intent: kw.intent, primary: kw.phrase }), action: kw.target_page || from.page ? 'improve' : 'create', targetPage: from.page ?? kw.target_page },
    };
  }
  if (from.page) {
    // Refresh of a page no search points at yet: use its title as the search.
    const path = normPath(from.page);
    const { data: kws } = await db.from('seo_keyword').select('id, phrase, service, town, intent, target_page, cluster_id').eq('target_page', path).eq('active', true).limit(20);
    if ((kws ?? []).length) {
      const t = await loadTarget(db, { keywordId: (kws as KeywordRow[])[0].id, page: path });
      t.target.keywordIds = (kws as KeywordRow[]).map((x) => x.id);
      t.target.phrases = (kws as KeywordRow[]).map((x) => x.phrase);
      return t;
    }
    const page = (await ourPages()).find((p) => p.path === path);
    const title = page?.title ?? path;
    return { clusterId: null, target: { name: title, primary: title.replace(/\s*[|–—-]\s*Heliaxis.*$/i, ''), phrases: [title], keywordIds: [], service: null, town: null, intent: 'commercial', pageType: 'pillar', action: 'improve', targetPage: path } };
  }
  throw new Error('Start from a planner group, a tracked search or a page.');
}

/** Everything the brief is built from, read from stored rows (no paid calls). */
export async function briefFor(db: Db, target: BriefTarget): Promise<Brief> {
  const kwId = target.keywordIds[0];
  let serpDate: string | null = null;
  let top10: SerpRow[] = [];
  let paa: string[] = [];
  let teardown: TeardownRow = null;
  if (kwId) {
    const { data: d } = await db.from('seo_serp_item').select('date, device').eq('keyword_id', kwId).eq('type', 'organic').order('date', { ascending: false }).limit(20);
    const rows = (d ?? []) as { date: string; device: string }[];
    const pick = rows.find((r) => r.device === 'mobile') ?? rows[0];
    if (pick) {
      serpDate = pick.date;
      const [{ data: items }, { data: q }] = await Promise.all([
        db.from('seo_serp_item').select('pos, domain, url, title').eq('keyword_id', kwId).eq('date', pick.date).eq('device', pick.device).eq('type', 'organic').lte('pos', 10).order('pos'),
        db.from('seo_serp_item').select('title').eq('keyword_id', kwId).eq('date', pick.date).eq('device', pick.device).eq('type', 'people_also_ask').limit(12),
      ]);
      top10 = (items ?? []) as SerpRow[];
      paa = ((q ?? []) as { title: string | null }[]).map((x) => x.title ?? '').filter(Boolean);
    }
    const { data: td } = await db.from('seo_teardown').select('date, summary, facts').eq('keyword_id', kwId).order('date', { ascending: false }).limit(1).maybeSingle();
    teardown = (td as TeardownRow) ?? null;
    const tdPaa = (teardown?.facts as { paa?: unknown } | undefined)?.paa;
    if (Array.isArray(tdPaa)) paa = [...paa, ...tdPaa.map(String)];
  }
  const urls = top10.map((r) => r.url).filter((u): u is string => !!u);
  const { data: facts } = urls.length ? await db.from('seo_page_facts').select('url, words, headings, questions, schema, page_type, prices_shown').in('url', urls) : { data: [] };
  const [ours, towns] = await Promise.all([ourPages(), townNames(db)]);
  return buildBrief({ target, serpDate, top10, facts: (facts ?? []) as FactsRow[], teardown, paa, ours: ours.map((o) => ({ path: o.path, title: o.title })), towns });
}

async function setClusterStatus(db: Db, clusterId: number | null, status: 'briefed' | 'drafting' | 'in_review' | 'published' | 'measuring', extra: Record<string, unknown> = {}) {
  if (!clusterId) return;
  await db.from('seo_cluster').update({ status, updated_at: new Date().toISOString(), ...extra }).eq('id', clusterId);
}

export async function getContent(id: number, db: Db = createAdminClient()): Promise<ContentRow> {
  const { data, error } = await db.from('seo_content').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('That page is not in the studio.');
  return data as ContentRow;
}

async function patch(db: Db, id: number, p: Record<string, unknown>) {
  const { error } = await db.from('seo_content').update({ ...p, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** A new page (or a refresh of a live one) with its brief built. */
export async function createContent(opts: { clusterId?: number | null; keywordId?: number | null; page?: string | null; kind?: ContentKind | null; by: string }, db: Db = createAdminClient()): Promise<number> {
  const mode: ContentMode = opts.page ? 'refresh' : 'new';
  const { target, clusterId } = await loadTarget(db, opts);
  if (target.action === 'hold' && mode === 'new') throw new Error('The planner has this group on Hold: it needs proof we do not have yet.');
  const brief = await briefFor(db, target);
  const kind: ContentKind = opts.kind ?? (opts.page?.startsWith('/blog/') ? 'blog' : defaultKind(target.pageType));
  const author = await getSetting('author', db);
  const proof: Proof = { ...normaliseProof({}), author: { name: author.name, role: author.role, bio: author.bio, photo: author.photo } };
  const { data, error } = await db
    .from('seo_content')
    .insert({ cluster_id: clusterId, kind, mode, title: target.name, slug: opts.page ? normPath(opts.page) : null, brief, proof, status: mode === 'refresh' ? 'draft' : 'brief', created_by: opts.by })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  await setClusterStatus(db, clusterId, 'briefed');
  return (data as { id: number }).id;
}

export async function rebuildBrief(id: number, db: Db = createAdminClient()) {
  const c = await getContent(id, db);
  const b = c.brief as Brief;
  if (!b?.target) throw new Error('This page has no brief to rebuild.');
  const fresh = await briefFor(db, b.target);
  await patch(db, id, { brief: fresh });
}

/** People can reword the outline, the word range and the kind of page before the proof pack. */
export async function editBrief(id: number, edit: { outline?: string[]; min?: number; max?: number; kind?: ContentKind; pageType?: PageType }, db: Db = createAdminClient()) {
  const c = await getContent(id, db);
  const b = { ...(c.brief as Brief) };
  if (!b.target) throw new Error('No brief yet.');
  if (edit.outline) {
    const old = new Map(b.outline.map((o) => [o.h2, o]));
    b.outline = edit.outline.map((h) => h.trim()).filter(Boolean).slice(0, 12).map((h2) => old.get(h2) ?? { h2, why: 'Added by a person', source: 'default' as const });
  }
  if (edit.min && edit.max && edit.min > 0 && edit.max >= edit.min) b.words = { ...b.words, min: Math.round(edit.min), max: Math.round(edit.max) };
  if (edit.pageType && PAGE_TYPES.includes(edit.pageType)) b.target = { ...b.target, pageType: edit.pageType };
  await patch(db, id, { brief: b, ...(edit.kind ? { kind: edit.kind } : {}) });
}

export async function acceptBrief(id: number, db: Db = createAdminClient()) {
  const c = await getContent(id, db);
  if (c.status !== 'brief') return;
  await patch(db, id, { status: 'proof' });
}

export async function saveProof(id: number, raw: unknown, by: string, db: Db = createAdminClient()) {
  const c = await getContent(id, db);
  if (['in_review', 'approved', 'published'].includes(c.status)) throw new Error('The proof pack is locked once the page is in review.');
  // The author is always Settings › Author, never typed here.
  const author = await getSetting('author', db);
  const proof = { ...normaliseProof(raw), author: { name: author.name, role: author.role, bio: author.bio, photo: author.photo }, updatedAt: new Date().toISOString(), updatedBy: by };
  // Prices are picked from pv_packages, never typed: re-read each picked package so the stored price is the real one.
  if (proof.packages.length) {
    const { data } = await db.from('pv_packages').select('id, name, min_panels, max_panels, panel_watts, usable_kwh, price_inc_vat, active, warranty_panel_yrs, warranty_battery_yrs, warranty_workmanship_yrs').in('id', proof.packages.map((p) => p.id));
    const today = new Date().toISOString().slice(0, 10);
    proof.packages = ((data ?? []) as PackageRow[]).map((r) => packageProof(r, today));
  }
  await patch(db, id, { proof, ...(c.status === 'brief' ? { status: 'proof' } : {}) });
}

/** The proof items still missing, with the content rules applied. */
export async function proofGate(c: ContentRow, db: Db = createAdminClient()) {
  const [rules, author] = await Promise.all([contentRules(db), getSetting('author', db)]);
  const brief = (c.brief as Brief)?.target ? (c.brief as Brief) : null;
  const proof = { ...normaliseProof(c.proof), author: { name: author.name, role: author.role, bio: author.bio, photo: author.photo } };
  return proofStatus(proof, requiredProof(brief, rules.requiredProof));
}

/* ── Draft ──────────────────────────────────────────────────────────────────────────────────────────────────────── */

const withIds = (blocks: DraftBlock[]) => blocks.map((b, i) => ({ id: b.id ?? `s${Date.now().toString(36)}${i}`, t: b.t, p: b.p }));

/** This draft run's own cost: the writers save each model call to ai_usage with the ref they were given. */
async function aiCostOfRun(db: Db, ref: string): Promise<number> {
  const { data } = await db.from('ai_usage').select('cost_usd').eq('ref', ref).limit(200);
  return Math.round(((data ?? []) as { cost_usd: number }[]).reduce((a, r) => a + Number(r.cost_usd ?? 0), 0) * 100000) / 100000;
}

/**
 * Writes the draft through the existing writers (pages: generatePage, articles: generateBlogPost), then runs the checks.
 * Locked until the proof pack's required items are in. Pass the failed checks to redraft with them fixed.
 */
export async function writeDraft(id: number, by: string, opts: { fixes?: boolean } = {}, db: Db = createAdminClient()): Promise<Checks> {
  const c = await getContent(id, db);
  if (c.mode === 'refresh') throw new Error('Refresh mode suggests edits to the live page; it does not write a new draft.');
  if (!['proof', 'draft', 'drafting'].includes(c.status)) throw new Error('Drafting opens once the brief is accepted and the proof pack is in.');
  const gate = await proofGate(c, db);
  if (!gate.ready) throw new Error(`Drafting is locked until the proof pack has: ${gate.missing.join(', ')}.`);
  const brief = c.brief as Brief;
  const proof = normaliseProof(c.proof);
  const facts = await writerFacts(db);
  const today = new Date().toISOString().slice(0, 10);
  const prev = (c.checks as Checks)?.results ?? [];
  const fixes = opts.fixes ? prev.filter((r) => r.blocking && !r.ok && r.key !== 'limit') : undefined;
  // One draft per page every 2 minutes (each is a paid model call), and none once the month's AI cap is reached.
  const last = (c.checks as { drafting?: { at?: string } })?.drafting?.at;
  const wait = draftWaitSeconds(last, Date.now());
  if (wait > 0) throw new Error(`A draft of this page was started less than 2 minutes ago. Try again in ${wait} seconds.`);
  await assertAiBudget('writing the draft', db);
  const started = new Date().toISOString();
  // Claim the row: if someone else started a draft (or changed the page) since we read it, stop here.
  const { data: claimed, error: claimErr } = await db
    .from('seo_content')
    .update({ status: 'drafting', checks: { ...(c.checks ?? {}), drafting: { at: started, by } }, updated_at: started })
    .eq('id', id)
    .eq('updated_at', c.updated_at)
    .select('id');
  if (claimErr) throw new Error(claimErr.message);
  if (!claimed?.length) throw new Error('This page changed while the draft was being started (perhaps someone else started one). Reload and try again.');
  await setClusterStatus(db, c.cluster_id, 'drafting');
  const usageRef = `seo_content:${id}:${started}`;

  let draft: Draft;
  try {
    const prompt = writerBrief(brief, proof, facts, { kind: c.kind, today, fixes });
    if (c.kind === 'blog') {
      const a = await generateBlogPost(prompt, { keyword: brief.target.primary, audience: brief.audience, usageRef });
      draft = baseDraft(c.kind, a.seoTitle || a.title, a.seoDescription || '', a.slug, process.env.AI_BLOG_CLAUDE_MODEL || 'claude-sonnet-5-5', today);
      draft.article = a as unknown as Record<string, unknown>;
    } else {
      const r = await generatePage(prompt, undefined, { usageRef });
      if (!r.blocks.length) throw new Error('The writer returned no usable sections. Try again.');
      draft = baseDraft(c.kind, r.seo.title, r.seo.description, r.seo.slug, r.debug.model, today);
      draft.blocks = withIds(r.blocks);
    }
  } catch (e) {
    await patch(db, id, { status: c.status === 'drafting' ? 'proof' : c.status });
    throw e;
  }
  draft.schema = schemaFor(c.kind, brief, draft, facts, today);
  const cost = await aiCostOfRun(db, usageRef);
  draft.writtenBy = by;
  await patch(db, id, { draft, status: 'draft', title: draft.title, slug: publicPath(c.kind, draft.slug), cost_usd: Number(c.cost_usd ?? 0) + cost });
  return checkContent(id, db);
}

function baseDraft(kind: ContentKind, title: string, description: string, slug: string, model: string, today: string): Draft {
  return { kind, title: title.trim(), description: description.trim(), slug: slug.replace(/^\/+/, '').replace(/^blog\//, ''), schema: '', model, writtenAt: new Date().toISOString(), lastChecked: today };
}

export function schemaFor(kind: ContentKind, brief: Brief, draft: Pick<Draft, 'title' | 'description' | 'slug'>, facts: WriterFacts, date: string): string {
  const base = site();
  const path = publicPath(kind, draft.slug);
  const crumbs = [{ name: 'Home', url: `${base}/` }, ...(kind === 'blog' ? [{ name: 'Blog', url: `${base}/blog` }] : []), { name: draft.title.replace(/\s*[|–—]\s*Heliaxis.*$/i, ''), url: `${base}${path}` }];
  return buildSchema({ types: brief.schema, title: draft.title, description: draft.description, url: `${base}${path}`, site: base, business: facts.business, author: facts.author, service: brief.target.service, town: brief.target.town, date, crumbs });
}

/** People's edits to the draft: the meta, the slug, the schema and the sections (as JSON). The checks re-run after. */
export async function editDraft(id: number, edit: { title?: string; description?: string; slug?: string; schema?: string; body?: string }, by: string, db: Db = createAdminClient()): Promise<Checks> {
  const c = await getContent(id, db);
  if (c.status !== 'draft') throw new Error('Only a draft can be edited. Send it back from review first.');
  const d = { ...(c.draft as Draft) };
  if (!d.kind) throw new Error('There is no draft yet.');
  if (edit.title != null) d.title = edit.title.replace(/\s+/g, ' ').trim();
  if (edit.description != null) d.description = edit.description.replace(/\s+/g, ' ').trim();
  if (edit.slug != null) d.slug = edit.slug.trim().toLowerCase().replace(/^\/+/, '').replace(/^blog\//, '').replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (edit.schema != null) d.schema = edit.schema;
  if (edit.body != null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(edit.body);
    } catch {
      throw new Error('The sections are not valid JSON.');
    }
    if (d.kind === 'blog') {
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The article must be one JSON object.');
      d.article = parsed as Record<string, unknown>;
    } else {
      const blocks = normalizeBlocks(parsed);
      if (!blocks.length) throw new Error('No usable sections in that JSON.');
      d.blocks = withIds(blocks);
    }
  }
  d.editedBy = by;
  d.editedAt = new Date().toISOString();
  await patch(db, id, { draft: d, title: d.title, slug: publicPath(d.kind, d.slug) });
  return checkContent(id, db);
}

/* ── Checks ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

export async function newPagesThisWeek(db: Db, exceptId?: number): Promise<number> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const { start } = weekOf(today);
  let q = db.from('seo_content').select('id', { count: 'exact', head: true }).eq('mode', 'new').eq('status', 'published').gte('published_at', `${start}T00:00:00Z`);
  if (exceptId) q = q.neq('id', exceptId);
  const { count } = await q;
  return count ?? 0;
}

/** A live page as a draft, so the checks can read it (refresh mode). */
export function liveAsDraft(p: OurLivePage): Draft {
  return { kind: 'cms_page', title: p.title, description: p.description, slug: p.path, blocks: [{ t: 'rich', p: { html: p.html } }], schema: '', model: 'live page', writtenAt: '', lastChecked: '' };
}

export async function checkContent(id: number, db: Db = createAdminClient()): Promise<Checks> {
  const c = await getContent(id, db);
  const brief = (c.brief as Brief)?.target ? (c.brief as Brief) : null;
  const [business, rules, ours, towns, publishedThisWeek] = await Promise.all([getSetting('business', db), contentRules(db), ourPages(), townNames(db), newPagesThisWeek(db, id)]);
  let draft = c.draft as Draft;
  const self = c.mode === 'refresh' ? normPath(c.slug ?? '') : publicPath(c.kind, (draft?.slug as string) ?? '');
  if (c.mode === 'refresh') {
    const live = ours.find((o) => o.path === self);
    if (!live) throw new Error('That page is not in the live site snapshot.');
    draft = liveAsDraft(live);
  }
  if (!draft?.kind) throw new Error('There is no draft to check yet.');
  const urls = (brief?.top10 ?? []).map((t) => t.url).filter((u): u is string => !!u);
  const { data: samples } = urls.length ? await db.from('seo_page_facts').select('url, text_sample').in('url', urls) : { data: [] };
  const checks = runChecks({
    draft,
    proof: normaliseProof(c.proof),
    brief,
    mode: c.mode,
    business: { name: business.name, phone: business.phone, credentials: business.credentials },
    rules,
    ours: ours.filter((o) => o.path !== self && o.text).map((o) => ({ path: o.path, title: o.title, text: o.text })),
    rivals: ((samples ?? []) as { url: string; text_sample: string | null }[]).filter((s) => s.text_sample).map((s) => ({ url: s.url, text: s.text_sample as string })),
    towns,
    site: site(),
    publishedThisWeek,
  });
  const prev = c.checks as { published?: PublishInfo; drafting?: { at: string; by: string } };
  await patch(db, id, { checks: { ...checks, ...(prev?.published ? { published: prev.published } : {}), ...(prev?.drafting ? { drafting: prev.drafting } : {}) } });
  return checks;
}

/* ── Review ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

export async function submitForReview(id: number, by: string, db: Db = createAdminClient()) {
  const checks = await checkContent(id, db);
  const c = await getContent(id, db);
  const gate = canSubmit(c.status, checks);
  if (!gate.ok) throw new Error(gate.why);
  await patch(db, id, { status: 'in_review' });
  await setClusterStatus(db, c.cluster_id, 'in_review');
  await raiseAction({ kind: 'approval', ref: `content:${id}`, title: `Approve the page "${c.title ?? 'Untitled'}"`, why: `${by} sent it for approval. Every blocking check passed.`, fixHref: `/admin/search/content/${id}` }, db);
}

export async function sendBack(id: number, note: string, by: string, db: Db = createAdminClient()) {
  const c = await getContent(id, db);
  if (c.status !== 'in_review' && c.status !== 'approved') throw new Error('Only a page in review can be sent back.');
  const d = { ...(c.draft as Draft), editedBy: by, editedAt: new Date().toISOString() };
  const checks = { ...(c.checks as Checks), error: note ? `Sent back by ${by}: ${note}` : `Sent back by ${by}.` };
  await patch(db, id, { status: 'draft', draft: d, checks, approved_by: null, approved_at: null });
  await setClusterStatus(db, c.cluster_id, 'drafting');
  await clearAction('approval', `content:${id}`, db);
}

export async function rejectContent(id: number, by: string, db: Db = createAdminClient()) {
  const c = await getContent(id, db);
  if (c.status === 'published') throw new Error('A published page cannot be rejected here.');
  await patch(db, id, { status: 'rejected', checks: { ...(c.checks as Checks), error: `Rejected by ${by}.` } });
  await clearAction('approval', `content:${id}`, db);
}

export { proofStatus, requiredProof };
export type { Brief, Checks, Draft, Proof };
