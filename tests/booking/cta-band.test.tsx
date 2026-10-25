import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CtaBand, TALK_LINKS } from '@/components/home/CtaBand';
import { StepQuoteForm } from '@/components/quote/StepQuoteForm';

const band = () =>
  renderToStaticMarkup(
    <CtaBand title="Talk to a real person" primary={{ label: 'Book a call', href: '/book-a-call' }} secondary={{ label: 'Get my free quote', href: '/get-a-quote' }} links={TALK_LINKS} />
  );

describe('CTA band', () => {
  it('shows the main and second button with the right links', () => {
    const out = band();
    expect(out).toContain('href="/book-a-call"');
    expect(out).toContain('href="/get-a-quote"');
    expect(out).toContain('Book a call');
  });
  it('offers phone, video and WhatsApp', () => {
    const out = band();
    expect(out).toContain('href="tel:01633965205"');
    expect(out).toContain('href="/book-a-survey?mode=video"');
    expect(out).toMatch(/href="https:\/\/wa\.me\/\d+"/);
  });
  it('opens WhatsApp in a new tab safely', () => {
    expect(band()).toContain('rel="noopener noreferrer"');
  });
});

describe('/get-a-quote?for=business', () => {
  it('skips the first question', () => {
    const out = renderToStaticMarkup(<StepQuoteForm variant="page" initialWho="business" />);
    expect(out).toContain('What sort of site is it?');
    expect(out).toContain('02 / 06');
    expect(out).not.toContain('Who’s the quote for?');
  });
});
