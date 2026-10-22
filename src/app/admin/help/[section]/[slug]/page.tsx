import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { metisHref } from '@/lib/help/context';
import { findArticle } from '@/lib/help/library';
import { renderHelp } from '@/lib/help/render';
import { getHelp } from '@/lib/help/server';
import { AccessChip, Crumbs, WhereChip } from '../../parts';
import { HelpBody } from '../../HelpBody';
import { helpViewer } from '../../viewer';
import '../../help.css';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ section: string; slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { section, slug } = await params;
  const found = findArticle(getHelp(), section, slug);
  return { title: `${found ? found.article.title : 'Not found'} · Help · Heliaxis`, robots: { index: false, follow: false } };
}

/** Long enough to list its parts ("On this page"). */
const LONG = 3;

/**
 * An article: where it is, who can use it, a button to the page it's about, the article, its parts on
 * the side when it's long, and the one before and after it in the section. Only articles that are in the
 * content (else 404): the URL's names are looked up, never used as a path.
 */
export default async function HelpArticlePage({ params }: Params) {
  const { section: key, slug } = await params;
  const found = findArticle(getHelp(), key, slug);
  if (!found) notFound();
  const { section, article, prev, next } = found;
  const viewer = await helpViewer(article.url);
  const { html, toc } = renderHelp(article.body);
  const parts = toc.filter((t) => t.depth === 2).length >= LONG ? toc : [];
  const has = viewer.has(article.access);
  const open = article.path && has && viewer.canOpen(article.path) ? article.path : null;
  // The CMS loads its own stylesheet (a full page load, as from the menu); /api/ links aren't pages.
  const hardLink = open && (/^\/api\//.test(open) || /^\/admin\/cms(\/|$|\?)/.test(open));

  return (
    <AdminShell active="help">
      <div className="hp hp--article">
        <Crumbs trail={[{ href: '/admin/help', label: 'Help' }, { href: section.url, label: section.title }, { label: article.title }]} />
        <div className={parts.length ? 'hp-art has-toc' : 'hp-art'}>
          <header className="hp-art__head">
            <h1>{article.title}</h1>
            {article.summary && <p className="hp-lead">{article.summary}</p>}
            <div className="hp-meta">
              {article.where && <WhereChip where={article.where} />}
              <AccessChip access={article.access} has={has} />
            </div>
            {open &&
              (hardLink ? (
                <a href={open} className="hp-btn hp-btn--primary hp-open">
                  Open this page <span aria-hidden="true">→</span>
                </a>
              ) : (
                <Link href={open} className="hp-btn hp-btn--primary hp-open">
                  Open this page <span aria-hidden="true">→</span>
                </Link>
              ))}
          </header>

          {parts.length > 0 && (
            <nav className="hp-toc" aria-labelledby="hp-toc-title">
              <p id="hp-toc-title" className="hp-toc__title">
                On this page
              </p>
              <ul>
                {parts.map((t) => (
                  <li key={t.id} className={t.depth === 3 ? 'is-sub' : undefined}>
                    <a href={`#${t.id}`}>{t.text}</a>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <HelpBody html={html} className="hp-doc" />

          <footer className="hp-art__foot">
            {(prev || next) && (
              <nav className="hp-pager" aria-label={`More in ${section.title}`}>
                {prev ? (
                  <Link href={prev.url} className="hp-pager__link is-prev" rel="prev">
                    <span className="hp-pager__dir">← Previous</span>
                    <span className="hp-pager__title">{prev.title}</span>
                  </Link>
                ) : (
                  <span />
                )}
                {next && (
                  <Link href={next.url} className="hp-pager__link is-next" rel="next">
                    <span className="hp-pager__dir">Next →</span>
                    <span className="hp-pager__title">{next.title}</span>
                  </Link>
                )}
              </nav>
            )}
            <p className="hp-after">
              <Link href={section.url}>All of {section.title}</Link>
              {viewer.metis && (
                <>
                  {' · '}Still stuck? <Link href={metisHref(`${article.title}: `)}>Ask Metis</Link>
                </>
              )}
            </p>
          </footer>
        </div>
      </div>
    </AdminShell>
  );
}
