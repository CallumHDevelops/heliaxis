import { CtaBand, QuoteForm, ScrollReveal, TALK_LINKS } from '@/components/home';
import { freshenLogo, splitCmsPage } from '@/lib/cms-ctas';

/**
 * A published CMS page on the live website. Shows the page as published, with the current logo, and (without
 * republishing from the CMS) swaps the old quote form for the current step-by-step one, and on the homepage adds
 * the two call-to-action bands. `display: contents` keeps the pieces laying out as one page.
 */
export function CmsBody({ html, className, ctas = false }: { html: string; className?: string; ctas?: boolean }) {
  const parts = splitCmsPage(freshenLogo(html), { ctas, quote: true });
  const hasQuote = parts.some((p) => typeof p !== 'string' && 'quote' in p);
  return (
    <div className={className}>
      {parts.map((part, i) => {
        if (typeof part === 'string') return <div key={i} style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: part }} />;
        if ('quote' in part) return <QuoteForm key={i} />;
        if (part.cta === 'survey')
          return (
            <CtaBand
              key={i}
              variant="solar"
              eyebrow="Step one is free"
              title="Book your free home survey"
              text="Pick a time that suits you. We come to you, look at your home and give honest figures. No obligation."
              primary={{ label: 'Book a free survey', href: '/book-a-survey' }}
              secondary={{ label: 'Get a quote in a minute', href: '/get-a-quote' }}
            />
          );
        return (
          <CtaBand
            key={i}
            variant="paper"
            eyebrow="Still got a question?"
            title="Talk to a real person"
            text="Ring us, book a call or a video chat, or message us on WhatsApp. No pressure, no sales scripts."
            primary={{ label: 'Book a call', href: '/book-a-call' }}
            secondary={{ label: 'Get my free quote', href: '/get-a-quote' }}
            links={TALK_LINKS}
          />
        );
      })}
      {hasQuote && <ScrollReveal />}
    </div>
  );
}
