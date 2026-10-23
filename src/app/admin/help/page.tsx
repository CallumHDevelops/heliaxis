import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { MetisIcon } from '@/components/admin/MetisIcon';
import { articlesForPath, cleanFrom, metisHref } from '@/lib/help/context';
import { allArticles } from '@/lib/help/library';
import { getHelp, getHelpIndexFile, searchHelpPage } from '@/lib/help/server';
import { HelpSearch } from './HelpSearch';
import { articleCount, HelpHead, sectionIcon } from './parts';
import { helpViewer } from './viewer';
import './help.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Help · Heliaxis', robots: { index: false, follow: false } };

type Search = { q?: string | string[]; from?: string | string[] };
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');

/**
 * Help's home: Help for the page you came from (?from=), the search box (?q=, so a search can be linked)
 * and a card per section; Ask Metis for CRM staff.
 */
export default async function HelpHome({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 200);
  const from = cleanFrom(one(sp.from));
  const viewer = await helpViewer(`/admin/help${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const lib = getHelp();
  const here = from ? articlesForPath(allArticles(lib), from) : [];
  const titleOf = new Map(lib.sections.map((s) => [s.key, s.title]));
  // The index itself comes separately (/api/help/search-index), when the box is first used.
  const index = getHelpIndexFile();
  const found = searchHelpPage(q);

  return (
    <AdminShell active="help">
      <div className="hp hp--home">
        <HelpHead kicker="Help" title="How to use Heliaxis" lead="Step-by-step guides to every part of the system, in plain words. Search, or pick a section." />

        {from && (
          <section className="hp-here" aria-labelledby="hp-here-title">
            <h2 id="hp-here-title" className="hp-h2">
              Help for this page
            </h2>
            {here.length ? (
              <ul className="hp-rows">
                {here.map((a) => (
                  <li key={a.url}>
                    <Link href={a.url} className="hp-row">
                      <span className="hp-row__text">
                        <span className="hp-row__title">{a.title}</span>
                        <span className="hp-row__sum">{a.summary}</span>
                      </span>
                      <span className="hp-row__sec">{titleOf.get(a.section)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hp-note">There isn’t an article about that page yet. Search below, or pick a section.</p>
            )}
          </section>
        )}

        <HelpSearch version={index.version} initial={q} initialHits={found.hits} initialClose={found.close} metis={viewer.metis}>
          {lib.sections.length ? (
            <section aria-labelledby="hp-sections-title">
              <h2 id="hp-sections-title" className="hp-h2">
                Sections
              </h2>
              <ul className="hp-grid">
                {lib.sections.map((s) => (
                  <li key={s.key}>
                    <Link href={s.url} className="hp-card">
                      <span className="hp-card__top">
                        <span className="hp-icon">{sectionIcon(s.icon)}</span>
                        <span className="hp-card__title">{s.title}</span>
                      </span>
                      {s.summary && <span className="hp-card__sum">{s.summary}</span>}
                      <span className="hp-card__count">{articleCount(s.articles.length)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="hp-note">Help is being written. Check back soon.</p>
          )}
          {viewer.metis && (
            <Link href={metisHref()} className="hp-metis">
              <MetisIcon size={40} />
              <span className="hp-metis__text">
                <span className="hp-metis__title">Ask Metis</span>
                <span className="hp-metis__sum">Ask in your own words. Metis answers from these guides and links the article it used.</span>
              </span>
              <span className="hp-metis__go" aria-hidden="true">
                →
              </span>
            </Link>
          )}
        </HelpSearch>
      </div>
    </AdminShell>
  );
}
