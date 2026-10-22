import 'server-only';
import {
  PUBLISHED_KEY,
  RENDERED_KEY,
  parseCmsState,
  type CmsLoosePage,
} from '@/lib/blog/cms-blog-shared';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Public case studies = published CMS pages of type "casestudy" (the CMS "Add case study"
 * templates create them under /case-studies/…). A page is listed only once it is live in the
 * rendered snapshot and its editor has unticked noindex — new case studies start noindexed so
 * an unfinished template is never shown as a real project.
 */

export type CaseStudyCard = {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  image: { src: string; alt: string } | null;
};

type LooseBlock = { t?: string; p?: Record<string, unknown> };
type LibImage = { id?: string; data?: string };

function normSlug(slug: unknown): string {
  const s = String(slug || '').trim().replace(/\/$/, '');
  if (!s) return '/';
  return s.startsWith('/') ? s : `/${s}`;
}

/** Hero headlines use **double asterisks** for the gold accent — drop the markers for plain text. */
function plain(s: unknown): string {
  return String(s ?? '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveImage(val: unknown, images: LibImage[]): { src: string; alt: string } | null {
  if (!val) return null;
  if (typeof val === 'string') return val ? { src: val, alt: '' } : null;
  if (typeof val !== 'object') return null;
  const m = val as { src?: string; data?: string; libId?: string; alt?: string; decorative?: boolean };
  let src = '';
  if (m.libId) src = String(images.find((im) => im.id === m.libId)?.data || '');
  if (!src) src = String(m.src || m.data || '');
  if (!src) return null;
  return { src, alt: m.decorative ? '' : String(m.alt || '') };
}

export function isCaseStudyPage(pg: CmsLoosePage): boolean {
  const type = String(pg.type || '').toLowerCase();
  return type === 'casestudy' || type === 'case';
}

function toCard(pg: CmsLoosePage, images: LibImage[]): CaseStudyCard {
  const blocks = (Array.isArray(pg.blocks) ? pg.blocks : []) as LooseBlock[];
  const hero = blocks.find((b) => b?.t === 'hero')?.p || {};
  const tags = String(hero.tags || '')
    .split(/[,|]/)
    .map((t) => plain(t))
    .filter(Boolean);

  let image = resolveImage(hero.bgImg, images);
  if (!image) {
    for (const b of blocks) {
      if (b?.t === 'media') image = resolveImage(b.p?.img, images);
      if (!image && b?.t === 'gallery' && Array.isArray(b.p?.items)) {
        for (const it of b.p.items as Array<{ img?: unknown }>) {
          image = resolveImage(it?.img, images);
          if (image) break;
        }
      }
      if (image) break;
    }
  }

  const seo = (pg.seo || {}) as { title?: string; desc?: string };
  return {
    slug: normSlug(pg.slug),
    title: plain(hero.headline) || plain(pg.name),
    summary: plain(hero.sub) || plain(seo.desc),
    tags,
    image,
  };
}

export async function getPublicCaseStudies(): Promise<CaseStudyCard[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('cms_kv')
      .select('key, value')
      .in('key', [PUBLISHED_KEY, RENDERED_KEY]);
    const byKey = new Map((data || []).map((r) => [String(r.key), r.value as string | null]));

    const state = parseCmsState(byKey.get(PUBLISHED_KEY));
    const images = Array.isArray((state.site as { images?: unknown } | undefined)?.images)
      ? ((state.site as { images: LibImage[] }).images)
      : [];

    let live = new Set<string>();
    try {
      const rendered = JSON.parse(byKey.get(RENDERED_KEY) || '{}') as {
        pages?: Array<{ slug?: string; html?: string }>;
      };
      live = new Set(
        (rendered.pages || []).filter((p) => (p.html || '').trim()).map((p) => normSlug(p.slug)),
      );
    } catch {
      /* no rendered snapshot yet */
    }

    return (state.pages || [])
      .filter((pg) => isCaseStudyPage(pg))
      .filter((pg) => !(pg.seo as { noindex?: boolean } | undefined)?.noindex)
      .filter((pg) => live.has(normSlug(pg.slug)))
      .map((pg) => toCard(pg, images));
  } catch {
    return [];
  }
}
