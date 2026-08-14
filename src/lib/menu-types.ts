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

export type SiteTopbar = {
  /** Show/hide the whole top bar. */
  show: boolean;
  /** Left-hand accreditations line. */
  accreditationText: string;
  /** Rating value shown after the stars, e.g. "4.9". */
  ratingValue: string;
  /** Opening hours, e.g. "Mon–Sat 8am–6pm". */
  hoursText: string;
  /** Phone number as displayed, e.g. "01633 965205". */
  phone: string;
  /** Phone link, e.g. "tel:01633965205". */
  phoneHref: string;
};
