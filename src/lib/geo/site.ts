import 'server-only';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { DRAFT_KEY, PUBLISHED_KEY, RENDERED_KEY, parseCmsState, type CmsLoosePage } from '@/lib/blog/cms-blog-shared';
import { cmsAdminEditSlug } from '@/lib/blog/cms-ai-blogs';
import { generateBlogPost, isAiConfigured } from '@/lib/blog/ai';
import { addBlogDraft } from '@/lib/blog/cms-blog-draft';
import type { CmsRendered } from '@/lib/cms-rendered';
import { htmlText, normPath, plain, sameQuestion } from './shared';

/**
 * The GEO bot's view of the website and its three ways of changing it:
 *  - meta: a page's search title and description. Written to the draft, the published copy and the
 *    live snapshot together, so it is live at once with no re-render.
 *  - faq: questions and answers added to a page's FAQ section (or a new one before the footer). Body
 *    content is rendered by the CMS editor, so this goes into the draft: open the page and Publish.
 *  - article: a new blog article written by the blog generator and saved as an unpublished draft.
 * If someone has the CMS editor open while a change is applied, they should reload it before saving,
 * or their copy will put the old version back.
 */

type Block = { id?: string; t?: string; p?: Record<string, unknown> };
type Faq = { q: string; a: string };

export type SitePage = {
  slug: string;
  name: string;
  type: string;
  title: string;
  description: string;
  noindex: boolean;
  faqs: string[];
  text: string;
};

async function readKv(keys: string[]) {
  const { data, error } = await createAdminClient().from('cms_kv').select('key, value').in('key', keys);
  if (error) throw new Error(error.message);
  const out: Record<string, string | null> = {};
  for (const k of keys) out[k] = (data ?? []).find((r) => r.key === k)?.value ?? null;
  return out;
}

async function writeKv(key: string, value: string) {
  const { error } = await createAdminClient().from('cms_kv').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

function parseRendered(raw: string | null): CmsRendered | null {
  try {
    const r = raw ? (JSON.parse(raw) as CmsRendered) : null;
    return r && Array.isArray(r.pages) ? r : null;
  } catch {
    return null;
  }
}

const findPage = <T extends { slug?: string }>(pages: T[] | undefined, slug: string) =>
  (pages ?? []).find((p) => normPath(String(p.slug || '')) === normPath(slug));

const faqsOf = (pg: CmsLoosePage | undefined): Faq[] =>
  ((pg?.blocks ?? []) as Block[])
    .filter((b) => b?.t === 'faq' && Array.isArray(b.p?.items))
    .flatMap((b) => (b.p!.items as Faq[]).filter((i) => i && i.q));

/** The live CMS pages the bot may suggest changes to, with what is on them now. */
export async function sitePages(): Promise<SitePage[]> {
  const kv = await readKv([DRAFT_KEY, RENDERED_KEY]);
  const draft = parseCmsState(kv[DRAFT_KEY]);
  const rendered = parseRendered(kv[RENDERED_KEY]);
  const out: SitePage[] = [];
  for (const live of rendered?.pages ?? []) {
    const pg = findPage(draft.pages, live.slug);
    if (!pg || !live.html?.trim()) continue;
    out.push({
      slug: normPath(live.slug),
      name: String(live.name || pg.name || ''),
      type: String(pg.type || 'page'),
      title: String(live.seo?.title || ''),
      description: String(live.seo?.desc || ''),
      noindex: !!live.seo?.noindex,
      faqs: faqsOf(pg).map((f) => String(f.q)),
      text: htmlText(live.html, 1500),
    });
  }
  return out;
}

export type Applied = { result: string; link?: string };

const editLink = (pg: CmsLoosePage) => `/admin/cms/${encodeURIComponent(cmsAdminEditSlug(String(pg.name || ''), String(pg.slug || '')))}`;

export async function applyMeta(slug: string, payload: { title?: string | null; description?: string | null }): Promise<Applied> {
  const title = plain(payload.title, 70);
  const desc = plain(payload.description, 170);
  if (!title && !desc) throw new Error('Nothing to change');
  const kv = await readKv([DRAFT_KEY, PUBLISHED_KEY, RENDERED_KEY]);
  const draft = parseCmsState(kv[DRAFT_KEY]);
  const pg = findPage(draft.pages, slug);
  if (!pg) throw new Error(`There is no page at ${slug} any more`);
  const patch = (seo: Record<string, unknown> | undefined) => ({
    ...(seo ?? {}),
    ...(title ? { title } : {}),
    ...(desc ? { desc } : {}),
  });

  pg.seo = patch(pg.seo);
  await writeKv(DRAFT_KEY, JSON.stringify(draft));
  if (kv[PUBLISHED_KEY]) {
    const published = parseCmsState(kv[PUBLISHED_KEY]);
    const pub = findPage(published.pages, slug);
    if (pub) {
      pub.seo = patch(pub.seo);
      await writeKv(PUBLISHED_KEY, JSON.stringify(published));
    }
  }
  const rendered = parseRendered(kv[RENDERED_KEY]);
  const live = rendered && findPage(rendered.pages, slug);
  if (rendered && live) {
    live.seo = patch(live.seo);
    await writeKv(RENDERED_KEY, JSON.stringify(rendered));
    revalidatePath(normPath(slug));
    return { result: 'Live now.', link: normPath(slug) };
  }
  return { result: 'Saved to the draft: the page isn’t published yet.', link: editLink(pg) };
}

export async function applyFaq(slug: string, items: Faq[]): Promise<Applied> {
  const clean = items
    .map((i) => ({ q: plain(i?.q, 160), a: plain(i?.a, 900) }))
    .filter((i) => i.q.length > 5 && i.a.length > 10)
    .slice(0, 6);
  if (!clean.length) throw new Error('No questions to add');
  const kv = await readKv([DRAFT_KEY]);
  const draft = parseCmsState(kv[DRAFT_KEY]);
  const pg = findPage(draft.pages, slug);
  if (!pg) throw new Error(`There is no page at ${slug} any more`);
  const blocks = (Array.isArray(pg.blocks) ? pg.blocks : (pg.blocks = [])) as Block[];

  const have = faqsOf(pg);
  const fresh = clean.filter((c) => !have.some((h) => sameQuestion(String(h.q), c.q)));
  if (!fresh.length) return { result: 'The page already answers these.', link: editLink(pg) };

  const existing = [...blocks].reverse().find((b) => b?.t === 'faq' && b.p);
  if (existing) {
    const list = Array.isArray(existing.p!.items) ? (existing.p!.items as Faq[]) : [];
    existing.p!.items = [...list, ...fresh];
  } else {
    const block: Block = {
      id: Math.random().toString(36).slice(2, 8),
      t: 'faq',
      p: { eyebrow: 'Good to know', title: 'Your questions, answered', anchor: 'faq', items: fresh },
    };
    // Before the footer (and a quote form just above it), like the editor's own FAQ placement.
    let at = blocks.length;
    while (at > 0 && (blocks[at - 1]?.t === 'footer' || blocks[at - 1]?.t === 'form')) at--;
    blocks.splice(at, 0, block);
  }
  await writeKv(DRAFT_KEY, JSON.stringify(draft));
  const n = fresh.length;
  return {
    result: `${n} question${n === 1 ? '' : 's'} added to the draft. Open the page in the CMS and Publish to put ${n === 1 ? 'it' : 'them'} live.`,
    link: editLink(pg),
  };
}

export async function applyArticle(brief: string): Promise<Applied> {
  if (!isAiConfigured()) throw new Error('The blog writer needs OPENROUTER_API_KEY in Vercel.');
  const ai = await generateBlogPost(plain(brief, 3000));
  const page = await addBlogDraft(ai);
  return { result: `Draft article “${String(page.name)}” saved. Check it, then publish or schedule it from Blog.`, link: page.editPath };
}

/** FAQ items from the CMS state, keyed by page path: the publish route stores them for FAQ rich results. */
export function faqsForRendered(state: unknown, slug: string): Faq[] {
  const pages = (state && typeof state === 'object' ? (state as { pages?: CmsLoosePage[] }).pages : undefined) ?? [];
  return faqsOf(findPage(pages, slug))
    .map((f) => ({ q: plain(f.q, 300), a: plain(f.a, 2000) }))
    .filter((f) => f.q && f.a && !/^(a question|another)\?$/i.test(f.q));
}
