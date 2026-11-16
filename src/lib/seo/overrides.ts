import 'server-only';
import { cache } from 'react';
import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseKv, toKv } from '@/lib/kv-json';
import { withoutBrand } from './title';

/**
 * Titles and descriptions approved in the SEO report for pages built in code (the estimator, the quote pages, blog articles and
 * so on). Approving one writes it here and the page reads it on the next request, so a change needs no code edit or deploy.
 * Pages made in the website editor are changed in the editor's own data instead (applyProposal).
 */
const KEY = 'seo-meta-overrides';

export type MetaOverride = { title?: string; description?: string; at: string; by: string };

type Db = ReturnType<typeof createAdminClient>;

/** Every override, by path ("/solar-estimator"). Read once per request. */
export const readOverrides = cache(async (): Promise<Record<string, MetaOverride>> => {
  try {
    const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', KEY).maybeSingle();
    const v = parseKv<{ pages?: Record<string, MetaOverride> }>(data?.value);
    return v.pages && typeof v.pages === 'object' ? v.pages : {};
  } catch {
    return {};
  }
});

export async function writeOverride(path: string, o: MetaOverride, db: Db = createAdminClient()) {
  const { data } = await db.from('cms_kv').select('value').eq('key', KEY).maybeSingle();
  const v = parseKv<{ pages?: Record<string, MetaOverride> }>(data?.value);
  const pages = { ...(v.pages ?? {}), [path]: o };
  const { error } = await db.from('cms_kv').upsert({ key: KEY, value: toKv({ pages }), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/** The page's own metadata with any approved title and description on top (the brand is added by the layout, so it is stripped here). */
export function applyOverride(base: Metadata, o: MetaOverride | undefined): Metadata {
  if (!o) return base;
  const title = o.title ? withoutBrand(o.title) : undefined;
  const description = o.description || undefined;
  return {
    ...base,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(base.openGraph ? { openGraph: { ...base.openGraph, ...(title ? { title } : {}), ...(description ? { description } : {}) } } : {}),
  };
}

/** For a code page: `export async function generateMetadata() { return withSeoOverride('/path', META); }`. */
export async function withSeoOverride(path: string, base: Metadata): Promise<Metadata> {
  return applyOverride(base, (await readOverrides())[path]);
}
