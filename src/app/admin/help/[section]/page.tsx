import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { findSection } from '@/lib/help/library';
import { renderHelp } from '@/lib/help/render';
import { getHelp } from '@/lib/help/server';
import { articleCount, Crumbs, HelpHead, sectionIcon } from '../parts';
import { HelpBody } from '../HelpBody';
import { helpViewer } from '../viewer';
import '../help.css';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ section: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { section } = await params;
  const s = findSection(getHelp(), section);
  return { title: `${s ? s.title : 'Not found'} · Help · Heliaxis`, robots: { index: false, follow: false } };
}

/** A section: its intro and its articles, in order. Only sections that are in the content (else 404). */
export default async function HelpSectionPage({ params }: Params) {
  const { section: key } = await params;
  const section = findSection(getHelp(), key);
  if (!section) notFound();
  await helpViewer(section.url);
  const intro = section.intro ? renderHelp(section.intro).html : '';

  return (
    <AdminShell active="help">
      <div className="hp hp--section">
        <Crumbs trail={[{ href: '/admin/help', label: 'Help' }, { label: section.title }]} />
        <HelpHead title={section.title} lead={section.summary} icon={sectionIcon(section.icon)} />
        {intro && <HelpBody html={intro} className="hp-intro" />}
        <h2 className="hp-h2">{articleCount(section.articles.length)}</h2>
        {section.articles.length ? (
          <ol className="hp-rows hp-rows--numbered">
            {section.articles.map((a) => (
              <li key={a.slug}>
                <Link href={a.url} className="hp-row">
                  <span className="hp-row__text">
                    <span className="hp-row__title">{a.title}</span>
                    <span className="hp-row__sum">{a.summary}</span>
                  </span>
                  {a.where && <span className="hp-row__sec">{a.where}</span>}
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="hp-note">Nothing in this section yet.</p>
        )}
        <p className="hp-back">
          <Link href="/admin/help">← All of Help</Link>
        </p>
      </div>
    </AdminShell>
  );
}
