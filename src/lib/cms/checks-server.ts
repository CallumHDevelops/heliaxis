import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseKv, toKv } from '@/lib/kv-json';
import { readFacts } from './facts-server';
import { checkSite, type CmsPageLike, type LibImageLite, type PageReport, type SiteReport } from './validate';

const DRAFT_KEY = 'heliaxis-cms-v1';
const PUBLISHED_KEY = 'heliaxis-cms-published';
const LOG_KEY = 'cms-publish-log';
type Db = ReturnType<typeof createAdminClient>;

type SiteDoc = { pages?: CmsPageLike[]; site?: { images?: LibImageLite[] } };

export const ukToday = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

function parseDoc(raw: unknown): SiteDoc {
  return parseKv<SiteDoc>(raw) as SiteDoc;
}

async function publishedPages(db: Db): Promise<CmsPageLike[]> {
  const { data } = await db.from('cms_kv').select('value').eq('key', PUBLISHED_KEY).maybeSingle();
  const pages = parseDoc(data?.value).pages;
  return Array.isArray(pages) ? pages : [];
}

/** Check a site document (the editor's live state at Publish, or the saved draft) against the facts sheet. */
export async function checkDoc(doc: SiteDoc, db: Db = createAdminClient()): Promise<SiteReport> {
  const [{ facts }, published] = await Promise.all([readFacts(db), publishedPages(db)]);
  const pages = Array.isArray(doc.pages) ? doc.pages : [];
  const images = Array.isArray(doc.site?.images) ? doc.site!.images! : [];
  return checkSite(pages, { facts, images, today: ukToday() }, published);
}

/** Check what is saved in the editor right now. */
export async function checkSaved(db: Db = createAdminClient()): Promise<SiteReport> {
  const { data } = await db.from('cms_kv').select('value').eq('key', DRAFT_KEY).maybeSingle();
  return checkDoc(parseDoc(data?.value), db);
}

/** A report cut down for a message: only the pages that block Publish, with their first errors. */
export function blockingSummary(r: SiteReport, perPage = 6) {
  return r.blocking.map((p: PageReport) => {
    const errors = p.issues.filter((i) => i.level === 'error');
    return { slug: p.slug, name: p.name, draft: p.draft, errors: errors.slice(0, perPage).map((i) => ({ code: i.code, message: i.message })), more: Math.max(0, errors.length - perPage) };
  });
}

/** An admin published past the checks: kept, with who and why, so it can be reviewed. */
export async function logOverride(entry: { by: string; reason: string; pages: string[]; errors: number }, db: Db = createAdminClient()) {
  const { data } = await db.from('cms_kv').select('value').eq('key', LOG_KEY).maybeSingle();
  const items = (parseKv<{ items: object[] }>(data?.value).items ?? []) as object[];
  const next = [{ at: new Date().toISOString(), ...entry }, ...items].slice(0, 50);
  await db.from('cms_kv').upsert({ key: LOG_KEY, value: toKv({ items: next }), updated_at: new Date().toISOString() });
}
