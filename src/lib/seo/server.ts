import 'server-only';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseKv, toKv } from '@/lib/kv-json';
import { getCmsRendered } from '@/lib/cms-rendered';
import { aiConfig, aiHeaders } from '@/lib/studio/ai';
import { writeOverride } from './overrides';
import { withoutBrand } from './title';
import { blockedCrawlers, compareAudits, duplicates, findingsFor, parsePage, summarise, type Audit, type AuditChange, type PageAudit, type SiteFinding } from './shared';

type Db = ReturnType<typeof createAdminClient>;
const AUDIT_PREFIX = 'seo-audit:';
const PROPOSALS_KEY = 'seo-proposals';
const UA = 'Mozilla/5.0 (compatible; HeliaxisSiteCheck/1.0)';
const MAX_PAGES = 150;

export const siteBase = () => (process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://heliaxis.co.uk');
const ukDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

/* ── Fetching ─────────────────────────────────────────────────────────────────── */

async function get(url: string, timeout = 12_000): Promise<{ status: number; body: string; ms: number }> {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(timeout), cache: 'no-store' });
    return { status: r.status, body: await r.text(), ms: Date.now() - t0 };
  } catch {
    return { status: 0, body: '', ms: Date.now() - t0 };
  }
}

async function inBatches<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

async function sitemapPaths(base: string): Promise<string[]> {
  const r = await get(`${base}/sitemap.xml`);
  const host = new URL(base).host;
  const paths = [...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => {
      try {
        const u = new URL(m[1].trim());
        return u.host === host ? u.pathname.replace(/(.)\/$/, '$1') : null;
      } catch {
        return null;
      }
    })
    .filter((p): p is string => !!p);
  return [...new Set(paths)].slice(0, MAX_PAGES);
}

/* ── The check ────────────────────────────────────────────────────────────────── */

export async function runAudit(now = new Date()): Promise<Audit> {
  const base = siteBase();
  const paths = await sitemapPaths(base);
  const pages: PageAudit[] = await inBatches(paths, 6, async (path) => {
    const r = await get(`${base}${path}`);
    const p = parsePage(r.body, path, r.status, r.ms);
    return { ...p, findings: findingsFor(p) };
  });

  const site: SiteFinding[] = [];
  if (!paths.length) site.push({ code: 'sitemap', severity: 'high', message: 'The sitemap could not be read, so no pages were checked.' });

  // CMS pages that are published but not in the sitemap.
  const rendered = await getCmsRendered().catch(() => null);
  const inSitemap = new Set(paths);
  const missing = (rendered?.pages ?? [])
    .filter((p) => !p.seo?.noindex && (p.html || '').trim())
    .map((p) => ((p.slug || '/').startsWith('/') ? p.slug || '/' : `/${p.slug}`).replace(/(.)\/$/, '$1'))
    .filter((p) => !inSitemap.has(p));
  if (missing.length) site.push({ code: 'sitemap-missing', severity: 'medium', message: `${missing.length} published page${missing.length > 1 ? 's are' : ' is'} not in the sitemap.`, paths: missing });

  // Titles and descriptions shared by more than one page.
  for (const d of duplicates(pages.filter((p) => p.status === 200), 'title')) site.push({ code: 'title-dupe', severity: 'medium', message: `${d.paths.length} pages share the title “${d.text.slice(0, 70)}”.`, paths: d.paths });
  for (const d of duplicates(pages.filter((p) => p.status === 200), 'description')) site.push({ code: 'desc-dupe', severity: 'low', message: `${d.paths.length} pages share one description.`, paths: d.paths });

  // Broken internal links: every internal link target not already checked, once each.
  const known = new Map(pages.map((p) => [p.path, p.status]));
  const targets = [...new Set(pages.flatMap((p) => p.links))].filter((l) => !known.has(l) && !/\.(png|jpe?g|webp|svg|pdf|css|js|ico|xml|txt)$/i.test(l) && !l.startsWith('/_next') && !l.startsWith('/api')).slice(0, 80);
  const checked = await inBatches(targets, 8, async (l) => [l, (await get(`${base}${l}`, 8000)).status] as const);
  const broken = checked.filter(([, s]) => s >= 400 || s === 0);
  for (const [l, s] of broken) site.push({ code: 'broken-link', severity: 'high', message: `A link to ${l} goes nowhere (${s || 'no answer'}).`, paths: pages.filter((p) => p.links.includes(l)).map((p) => p.path).slice(0, 8) });
  for (const p of pages) for (const l of p.links) if (known.get(l) && known.get(l)! >= 400 && !site.some((x) => x.code === 'broken-link' && x.message.includes(` ${l} `))) site.push({ code: 'broken-link', severity: 'high', message: `A link to ${l} goes nowhere (${known.get(l)}).`, paths: [p.path] });

  // For AI assistants: can their crawlers read the site, and does the home page say who and where the business is?
  const robots = await get(`${base}/robots.txt`, 8000);
  if (robots.status !== 200) site.push({ code: 'robots', severity: 'medium', message: 'There is no robots.txt.' });
  else {
    const blocked = blockedCrawlers(robots.body);
    if (blocked.length) site.push({ code: 'ai-blocked', severity: 'high', message: `robots.txt blocks AI crawlers (${blocked.join(', ')}), so those assistants can't learn about Heliaxis.` });
    if (!/^\s*sitemap:/im.test(robots.body)) site.push({ code: 'robots-sitemap', severity: 'low', message: 'robots.txt does not point to the sitemap.' });
  }
  const home = pages.find((p) => p.path === '/');
  if (home && !home.jsonld.some((t) => /LocalBusiness|Organization|HomeAndConstructionBusiness|ProfessionalService/.test(t))) site.push({ code: 'schema-business', severity: 'medium', message: 'The home page has no business markup (LocalBusiness or Organization), which helps search engines and AI assistants name the business correctly.' });

  const id = ukDay(now);
  return { id, at: now.toISOString(), pages, site, summary: summarise(pages, site) };
}

/* ── Storage ──────────────────────────────────────────────────────────────────── */

export async function saveAudit(a: Audit, db: Db = createAdminClient()) {
  await db.from('cms_kv').upsert({ key: `${AUDIT_PREFIX}${a.id}`, value: toKv(a), updated_at: new Date().toISOString() });
}

/** The newest checks, newest first. */
export async function recentAudits(n = 8, db: Db = createAdminClient()): Promise<Audit[]> {
  const { data } = await db.from('cms_kv').select('key, value').like('key', `${AUDIT_PREFIX}%`).order('key', { ascending: false }).limit(n);
  return (data ?? []).map((r) => parseKv<Audit>(r.value) as Audit).filter((a) => a?.id && Array.isArray(a.pages));
}

/* ── Proposed fixes ───────────────────────────────────────────────────────────── */

export type Proposal = {
  id: string;
  path: string;
  status: 'proposed' | 'applied' | 'dismissed';
  at: string;
  reason: string;
  oldTitle: string;
  oldDescription: string;
  title: string;
  description: string;
  /** A page in the CMS, whose title and description can be changed from here. Others are changed by hand (the text is there to copy). */
  canApply: boolean;
  appliedAt?: string;
  appliedBy?: string;
};

export async function readProposals(db: Db = createAdminClient()): Promise<Proposal[]> {
  const { data } = await db.from('cms_kv').select('value').eq('key', PROPOSALS_KEY).maybeSingle();
  const v = parseKv<{ items: Proposal[] }>(data?.value);
  return Array.isArray(v.items) ? v.items : [];
}
async function writeProposals(items: Proposal[], db: Db = createAdminClient()) {
  await db.from('cms_kv').upsert({ key: PROPOSALS_KEY, value: toKv({ items: items.slice(0, 200) }), updated_at: new Date().toISOString() });
}

const META_CODES = new Set(['title-missing', 'title-short', 'title-long', 'desc-missing', 'desc-short', 'desc-long']);

function visibleText(html: string) {
  return html
    .replace(/<(script|style|noscript|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2500);
}

async function draftMeta(path: string, text: string, old: { title: string; description: string }): Promise<{ title: string; description: string } | null> {
  const { apiKey, baseUrl, model } = aiConfig();
  if (!apiKey) return null;
  const prompt = `You write the search-result title and meta description for one page of the website of Heliaxis, a South Wales and South West installer of solar panels, batteries, heat pumps and EV chargers (MCS-certified, RECC member).

Rules: British English, plain and calm, no hype, no emoji. Use ONLY facts that are in the page text below: never invent a price, saving, number, award, review score or claim. Title: 30 to 48 characters, the page's main topic first. Do NOT include the brand name: the website adds " | Heliaxis" itself. Description: 120 to 155 characters, says what the page offers and ends with a gentle reason to click (for example a free survey), no quotation marks.

Page path: ${path}
Current title: ${old.title || '(none)'}
Current description: ${old.description || '(none)'}

PAGE TEXT:
"""${text}"""

Return ONLY JSON: {"title":"","description":""}`;
  try {
    const r = await fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers: aiHeaders(apiKey), body: JSON.stringify({ model, temperature: 0.3, max_tokens: 300, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }), signal: AbortSignal.timeout(40_000) });
    if (!r.ok) return null;
    const d = await r.json();
    const j = JSON.parse(String(d?.choices?.[0]?.message?.content ?? '').replace(/```json|```/g, '').trim()) as { title?: string; description?: string };
    const title = String(j.title ?? '').trim().replace(/\s+/g, ' ');
    const description = String(j.description ?? '').trim().replace(/\s+/g, ' ').replace(/^["“]|["”]$/g, '');
    if (title.length < 20 || title.length > 62 || description.length < 90 || description.length > 170) return null;
    return { title, description };
  } catch {
    return null;
  }
}

const slugOf = (p: string) => (p === '' ? '/' : p.startsWith('/') ? p : `/${p}`).replace(/(.)\/$/, '$1');

/** Write a better title and description for pages whose are missing, short or long. At most `max` a week (each is one AI call). */
export async function draftProposals(audit: Audit, max = 8, db: Db = createAdminClient()): Promise<Proposal[]> {
  const existing = await readProposals(db);
  const waiting = new Set(existing.filter((p) => p.status === 'proposed').map((p) => p.path));
  const dismissed = new Set(existing.filter((p) => p.status === 'dismissed').map((p) => p.path));
  const rendered = await getCmsRendered().catch(() => null);
  const cms = new Set((rendered?.pages ?? []).map((p) => slugOf(p.slug || '/')));
  const want = audit.pages.filter((p) => p.status === 200 && p.findings.some((f) => META_CODES.has(f.code)) && !waiting.has(p.path) && !dismissed.has(p.path)).slice(0, max);
  const made: Proposal[] = [];
  for (const p of want) {
    const page = await get(`${siteBase()}${p.path}`);
    const meta = await draftMeta(p.path, visibleText(page.body), { title: p.title, description: p.description });
    if (!meta) continue;
    made.push({
      id: randomUUID(),
      path: p.path,
      status: 'proposed',
      at: new Date().toISOString(),
      reason: p.findings.filter((f) => META_CODES.has(f.code)).map((f) => f.message).join(' '),
      oldTitle: p.title,
      oldDescription: p.description,
      title: meta.title,
      description: meta.description,
      canApply: cms.has(p.path),
    });
  }
  if (made.length) await writeProposals([...made, ...existing], db);
  return made;
}

/** Change a CMS page's title and description: in the live snapshot (so it shows at once) and in the published and draft pages (so the next Publish keeps it). */
export async function applyProposal(
  id: string,
  by: string,
  edits: { title?: string; description?: string } = {},
  db: Db = createAdminClient(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  const items = await readProposals(db);
  const found = items.find((x) => x.id === id);
  if (!found) return { ok: false, error: 'That suggestion is gone.' };
  if (found.status !== 'proposed') return { ok: false, error: 'That one has already been dealt with.' };
  // The wording as approved (edited on the page or as suggested), with the brand left to the layout.
  const title = withoutBrand((edits.title ?? found.title).replace(/\s+/g, ' ').trim());
  const description = (edits.description ?? found.description).replace(/\s+/g, ' ').trim();
  if (title.length < 10 || title.length > 70) return { ok: false, error: 'The title should be 10 to 70 characters.' };
  if (description.length < 50 || description.length > 170) return { ok: false, error: 'The description should be 50 to 170 characters.' };
  const p = { ...found, title, description };
  const done = () => writeProposals(items.map((x) => (x.id === id ? { ...p, status: 'applied' as const, appliedAt: new Date().toISOString(), appliedBy: by } : x)), db);
  // A page built in code (not in the website editor): its title comes from the override store, read on every request.
  if (!found.canApply) {
    try {
      await writeOverride(p.path, { title, description, at: new Date().toISOString(), by }, db);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Couldn’t save it.' };
    }
    await done();
    revalidatePath(p.path);
    return { ok: true };
  }
  let changed = 0;
  for (const key of ['heliaxis-cms-rendered', 'heliaxis-cms-published', 'heliaxis-cms-v1']) {
    const { data } = await db.from('cms_kv').select('value').eq('key', key).maybeSingle();
    if (!data?.value) continue;
    let doc: { pages?: { slug?: string; seo?: { title?: string; desc?: string } }[] };
    try {
      doc = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    } catch {
      continue;
    }
    const page = (doc.pages ?? []).find((x) => slugOf(x.slug || '/') === p.path);
    if (!page) continue;
    page.seo = { ...(page.seo ?? {}), title: p.title, desc: p.description };
    const { error } = await db.from('cms_kv').update({ value: JSON.stringify(doc), updated_at: new Date().toISOString() }).eq('key', key);
    if (error) return { ok: false, error: error.message };
    changed++;
  }
  if (!changed) return { ok: false, error: 'Couldn’t find that page in the website editor.' };
  await done();
  revalidatePath(p.path);
  return { ok: true };
}

export async function dismissProposal(id: string, db: Db = createAdminClient()) {
  const items = await readProposals(db);
  await writeProposals(items.map((x) => (x.id === id && x.status === 'proposed' ? { ...x, status: 'dismissed' } : x)), db);
}

/* ── The weekly round ─────────────────────────────────────────────────────────── */

export type WeeklyResult = { audit: Audit; change: AuditChange; proposals: Proposal[]; appliedThisWeek: Proposal[] };

/** Check the site, compare with last time, draft fixes, save. The email and push are sent by the cron route. */
export async function runWeekly(now = new Date()): Promise<WeeklyResult> {
  const db = createAdminClient();
  const before = (await recentAudits(2, db)).find((a) => a.id !== ukDay(now)) ?? null;
  const audit = await runAudit(now);
  await saveAudit(audit, db);
  const proposals = await draftProposals(audit, 8, db);
  const since = Date.now() - 8 * 86_400_000;
  const appliedThisWeek = (await readProposals(db)).filter((p) => p.status === 'applied' && p.appliedAt && Date.parse(p.appliedAt) >= since);
  return { audit, change: compareAudits(before, audit), proposals, appliedThisWeek };
}
