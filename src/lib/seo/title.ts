/**
 * Page titles. The root layout's template adds " | Heliaxis" to every title, so a title typed with the brand already
 * in it ("Home Page — Heliaxis") showed it twice in Google. These keep the brand once.
 */

/** The home page's title (59 characters with the brand). */
export const HOME_TITLE = 'Solar Installers: South Wales and the South West | Heliaxis';

/** The title without a trailing brand ("… | Heliaxis", "… — Heliaxis", "… - Heliaxis Ltd"), however many times it repeats. */
export function withoutBrand(title: string): string {
  let t = title.trim();
  for (let i = 0; i < 3; i++) {
    const next = t.replace(/\s*[|—–\-:·]\s*Heliaxis(\s+(Ltd|Limited))?\s*$/i, '').trim();
    if (next === t) break;
    t = next;
  }
  return t;
}
