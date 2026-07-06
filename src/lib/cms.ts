import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MenuCol, MenuFeatured, MenuTop } from '@/lib/menu-types';

// The CMS publishes its whole document (incl. site.menu) under this key.
const PUBLISHED_KEY = 'heliaxis-cms-published';

function href(slug?: string): string {
  const s = (slug || '').trim();
  return s || '#';
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

/**
 * Load the published mega-menu from Supabase, mapped to the Header's shape.
 * Returns null on any problem (no env, no published doc, parse error) so the
 * Header falls back to its built-in default menu.
 */
export async function getPublishedMenu(): Promise<MenuTop[] | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('cms_kv')
      .select('value')
      .eq('key', PUBLISHED_KEY)
      .maybeSingle();
    if (!data?.value) return null;

    const state = JSON.parse(data.value as string);
    const menu = state?.site?.menu;
    if (!Array.isArray(menu) || menu.length === 0) return null;

    return menu.map(mapTop);
  } catch {
    return null;
  }
}
