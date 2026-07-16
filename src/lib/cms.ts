import 'server-only';
import { unstable_noStore as noStore } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MenuCol, MenuFeatured, MenuTop } from '@/lib/menu-types';

// Published snapshot is preferred; draft is a fallback so a fresh install still
// shows the menu after Save (before the first Publish).
const PUBLISHED_KEY = 'heliaxis-cms-published';
const DRAFT_KEY = 'heliaxis-cms-v1';

function href(slug?: string): string {
  const s = (slug || '').trim();
  if (!s) return '#';
  if (
    s.startsWith('#') ||
    s.startsWith('/') ||
    s.startsWith('http://') ||
    s.startsWith('https://')
  ) {
    return s;
  }
  return '/' + s;
}

/* Map one raw CMS menu top-item → the shape the Header renders. */
function mapTop(m: Record<string, unknown>): MenuTop {
  const label = String((m.label as string) ?? '');
  const cols = m.cols as Array<Record<string, unknown>> | undefined;
  const megaEnabled = m.megaEnabled !== false && Array.isArray(cols) && cols.length > 0;

  // Direct-link item (mega menu disabled).
  if (!megaEnabled) {
    return { label, href: href((m.page as string) || (m.href as string)) };
  }

  const mappedCols: MenuCol[] = (cols || []).map((c) => ({
    title: String((c.ey as string) ?? (c.title as string) ?? ''),
    items: ((c.items as Array<Record<string, unknown>>) || []).map((it) => ({
      icon: String((it.icon as string) || 'solar'),
      label: String((it.label as string) ?? ''),
      href: href((it.page as string) || (it.href as string)),
      desc: it.desc ? String(it.desc) : undefined,
    })),
  }));

  let featured: MenuFeatured | undefined;
  const f = m.featured as Record<string, unknown> | undefined;
  if (f && (f.title || f.text || f.cta)) {
    featured = {
      title: String((f.title as string) ?? ''),
      text: String((f.text as string) ?? ''),
      cta: String((f.cta as string) ?? ''),
      href: href((f.ctaPage as string) || (f.href as string)),
      bg: f.bg === 'light' ? 'light' : 'dark',
      img: f.img ? String(f.img) : undefined,
    };
  }

  return { label, cols: mappedCols, featured };
}

function menuFromKvValue(raw: unknown): MenuTop[] | null {
  if (raw == null) return null;
  try {
    const state = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const menu = (state as { site?: { menu?: unknown } })?.site?.menu;
    if (!Array.isArray(menu) || menu.length === 0) return null;
    return menu.map((m) => mapTop(m as Record<string, unknown>));
  } catch {
    return null;
  }
}

/**
 * Load the mega-menu for the public Header from Supabase.
 * Prefers the published CMS doc; falls back to the draft if nothing is published yet.
 */
export async function getPublishedMenu(): Promise<MenuTop[] | null> {
  noStore();
  try {
    const admin = createAdminClient();
    for (const key of [PUBLISHED_KEY, DRAFT_KEY]) {
      const { data } = await admin.from('cms_kv').select('value').eq('key', key).maybeSingle();
      const mapped = menuFromKvValue(data?.value);
      if (mapped?.length) return mapped;
    }
    return null;
  } catch {
    return null;
  }
}
