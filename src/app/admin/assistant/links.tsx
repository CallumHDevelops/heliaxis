import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Hestia's words with the app's pages it names (/admin/…, e.g. a Help article) as links: a bare path, or
 * [words](/admin/…). Anything else stays text.
 */
export function withLinks(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]\n]{1,120})\]\((\/admin(?:\/[^\s)]*)?)\)|(\/admin(?![\w-])(?:\/[^\s)\]]*)?)/g;
  let at = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    let href = m[2] ?? m[3];
    let label = m[1] ?? href;
    let end = start + m[0].length;
    // A bare path inside a longer address (https://…/admin/…) or a word is left as it is.
    if (!m[2] && start > 0 && !/[\s(["'“‘]/.test(text[start - 1])) continue;
    if (!m[2]) {
      // A bare path: full stops, commas and closing quotes after it aren't part of it.
      const tail = /[.,;:!?'"’”)]+$/.exec(href)?.[0] ?? '';
      href = href.slice(0, href.length - tail.length);
      label = href;
      end -= tail.length;
    }
    if (start > at) out.push(text.slice(at, start));
    out.push(
      <Link key={start} href={href} className="as-link">
        {label}
      </Link>,
    );
    at = end;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}
