import type { ReactNode } from 'react';
import { Eyebrow } from '@/components/home/Eyebrow';
import { SiteFooter } from '@/components/home/SiteFooter';
import './legal.css';

/** Who we are — shown on every legal page. Kept in one place so the pages never disagree. */
export const COMPANY = {
  name: 'Heliaxis Limited',
  number: '16734783',
  vat: 'GB507431316',
  address: 'Current Electrical, Turner Street, Newport, NP19 7AZ',
  email: 'hello@heliaxis.co.uk',
  phone: '01633 965205',
  phoneHref: 'tel:01633965205',
};

export type LegalSection = { id: string; title: string; body: ReactNode };

/** A plain, readable legal page in the site's style: dark hero, contents, numbered sections. */
export function LegalPage({
  eyebrow,
  title,
  intro,
  updated,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  /** e.g. "18 October 2026" */
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <>
      <section className="lg-hero">
        <div className="wrap">
          <div className="lg-crumb">
            <a href="/">Home</a> / {title}
          </div>
          <Eyebrow onDark>{eyebrow}</Eyebrow>
          <h1>{title}</h1>
          <div className="lg-lead">{intro}</div>
          <p className="lg-updated">Last updated {updated}</p>
        </div>
      </section>
      <section className="lg-body">
        <div className="wrap lg-grid">
          <nav className="lg-toc" aria-label="Contents">
            <p>Contents</p>
            <ol>
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.title}</a>
                </li>
              ))}
            </ol>
          </nav>
          <article className="lg-article">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="lg-sec">
                <h2>
                  <span className="lg-num">{String(i + 1).padStart(2, '0')}</span>
                  {s.title}
                </h2>
                {s.body}
              </section>
            ))}
            <p className="lg-company">
              {COMPANY.name} · Company No. {COMPANY.number} · Registered in England &amp; Wales · VAT {COMPANY.vat}
              <br />
              {COMPANY.address} · <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> ·{' '}
              <a href={COMPANY.phoneHref}>{COMPANY.phone}</a>
            </p>
          </article>
        </div>
      </section>
      <SiteFooter />
    </>
  );
}
