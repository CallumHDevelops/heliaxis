import 'server-only';
import { unstable_noStore as noStore } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MenuCol, MenuFeatured, MenuTop, SiteTopbar } from '@/lib/menu-types';

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
function mapTop(m: Record<string, unknown>, images: Array<{ id?: string; data?: string }> = []): MenuTop {
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
    let img = f.img ? String(f.img) : '';
    const libId = f.imgLibId ? String(f.imgLibId) : '';
    if (!img && libId) {
      const hit = images.find((im) => im.id === libId);
      if (hit?.data) img = String(hit.data);
    }
    featured = {
      title: String((f.title as string) ?? ''),
      text: String((f.text as string) ?? ''),
      cta: String((f.cta as string) ?? ''),
      href: href((f.ctaPage as string) || (f.href as string)),
      bg: f.bg === 'light' ? 'light' : 'dark',
      img: img || undefined,
    };
  }

  return { label, cols: mappedCols, featured };
}

function menuFromKvValue(raw: unknown): MenuTop[] | null {
  if (raw == null) return null;
  try {
    const state = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const site = (state as { site?: { menu?: unknown; images?: unknown } })?.site;
    const menu = site?.menu;
    const images = Array.isArray(site?.images)
      ? (site!.images as Array<{ id?: string; data?: string }>)
      : [];
    if (!Array.isArray(menu) || menu.length === 0) return null;
    return menu.map((m) => mapTop(m as Record<string, unknown>, images));
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

function topbarFromKvValue(raw: unknown): SiteTopbar | null {
  if (raw == null) return null;
  try {
    const state = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const tb = (state as { site?: { topbar?: unknown } })?.site?.topbar as
      | Partial<SiteTopbar>
      | undefined;
    if (!tb || typeof tb !== 'object') return null;
    return {
      show: tb.show !== false,
      accreditationText: String(tb.accreditationText ?? ''),
      ratingValue: String(tb.ratingValue ?? ''),
      hoursText: String(tb.hoursText ?? ''),
      phone: String(tb.phone ?? ''),
      phoneHref: String(tb.phoneHref ?? ''),
    };
  } catch {
    return null;
  }
}

/**
 * Load the header top-bar settings for the public Header from Supabase.
 * Prefers the published CMS doc; falls back to the draft if nothing is published
 * yet. Returns null when no topbar has been authored (Header then uses its
 * built-in defaults).
 */
export async function getPublishedTopbar(): Promise<SiteTopbar | null> {
  noStore();
  try {
    const admin = createAdminClient();
    for (const key of [PUBLISHED_KEY, DRAFT_KEY]) {
      const { data } = await admin.from('cms_kv').select('value').eq('key', key).maybeSingle();
      const tb = topbarFromKvValue(data?.value);
      if (tb) return tb;
    }
    return null;
  } catch {
    return null;
  }
}
