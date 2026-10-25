import Link from 'next/link';
import './cta-band.css';

/**
 * A call-to-action band for the middle or end of a page: one main button, an optional second one, and
 * a row of other ways to get in touch. Self-contained (its own button styles), so it works on any
 * website page, including the blog. Links go to the quote form, the booking form and the phone.
 */

export type CtaAction = { label: string; href: string };

const PHONE = '01633 965205';
const whatsapp = () => `https://wa.me/${(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '441633965439').replace(/\D/g, '')}`;

/** The usual "talk to us" links, for a band's `links`. */
export const TALK_LINKS: CtaAction[] = [
  { label: `Call ${PHONE}`, href: 'tel:01633965205' },
  { label: 'Video call', href: '/book-a-survey?mode=video' },
  { label: 'WhatsApp', href: '' },
];

function A({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const external = /^(tel:|mailto:|https?:)/.test(href);
  return external ? (
    <a className={className} href={href} {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {children}
    </a>
  ) : (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}

export function CtaBand({
  variant = 'dark',
  eyebrow,
  title,
  text,
  primary,
  secondary,
  links,
}: {
  variant?: 'dark' | 'paper' | 'solar';
  eyebrow?: string;
  title: string;
  text?: string;
  primary: CtaAction;
  secondary?: CtaAction;
  links?: CtaAction[];
}) {
  const talk = links?.map((l) => (l.label === 'WhatsApp' && !l.href ? { ...l, href: whatsapp() } : l));
  return (
    <section className={`ctab ctab--${variant}`} aria-label={title}>
      <div className="ctab-in">
        <div className="ctab-copy">
          {eyebrow && <span className="ctab-eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
          {text && <p>{text}</p>}
        </div>
        <div className="ctab-actions">
          <A className="ctab-btn ctab-btn--primary" href={primary.href}>
            {primary.label}
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </A>
          {secondary && (
            <A className="ctab-btn ctab-btn--ghost" href={secondary.href}>
              {secondary.label}
            </A>
          )}
        </div>
        {talk && talk.length > 0 && (
          <ul className="ctab-links">
            {talk.map((l) => (
              <li key={l.label}>
                <A href={l.href}>{l.label}</A>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
