/** The manufacturer logos the CMS keeps (site.logos), as the website shows them. Pure: the page and the tests share it. */
export type BrandLogo = { name: string; img: string };

const isGoodWe = (n: string) => /^\s*goodwe\b/i.test(n);

/**
 * The logos ticked "In banner", each with a name for its alt text, with GoodWe first. GoodWe is the make Heliaxis fits, so it is added (as a
 * name until its logo is uploaded in the CMS Logos tab) when the CMS doesn't have it, and moved to the front when it does.
 */
export function orderBrandLogos(raw: unknown): BrandLogo[] {
  const list: BrandLogo[] = [];
  for (const l of Array.isArray(raw) ? raw : []) {
    const o = (l && typeof l === 'object' ? l : {}) as { name?: unknown; img?: unknown; bnr?: unknown };
    const name = String(o.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!name || !o.bnr) continue;
    list.push({ name, img: typeof o.img === 'string' ? o.img : '' });
  }
  const i = list.findIndex((l) => isGoodWe(l.name));
  const goodwe = i >= 0 ? list.splice(i, 1)[0] : { name: 'GoodWe', img: '' };
  return [goodwe, ...list];
}

/** The alt text for a brand's logo: the name, saying what it is, never empty. */
export const brandAlt = (b: BrandLogo) => `${b.name} logo`;
