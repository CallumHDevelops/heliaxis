// Shared mega-menu types — imported by both the server loader (src/lib/cms.ts)
// and the client Header. Kept free of any server-only imports so the client
// bundle can `import type` from here safely.

export type MenuItem = {
  icon: string;
  label: string;
  href: string;
  desc?: string;
};

export type MenuCol = {
  title: string;
  items: MenuItem[];
};

export type MenuFeatured = {
  title: string;
  text: string;
  cta: string;
  href: string;
  bg?: 'light' | 'dark';
  img?: string;
};

export type MenuTop = {
  label: string;
  /** Set when this item is a direct link (mega menu disabled). */
  href?: string;
  /** Set when this item opens a mega panel. */
  cols?: MenuCol[];
  featured?: MenuFeatured;
};
