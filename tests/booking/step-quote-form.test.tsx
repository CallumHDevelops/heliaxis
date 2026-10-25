import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StepQuoteForm } from '@/components/quote/StepQuoteForm';

describe('the step-by-step quote form', () => {
  it('starts on the first question with a progress count', () => {
    const out = renderToStaticMarkup(<StepQuoteForm />);
    expect(out).toContain('Who’s the quote for?');
    expect(out).toContain('01 / 06');
    expect(out).toContain('For my home');
    expect(out).toContain('For my business');
  });

  it('shows one question only (no name, phone or email boxes yet)', () => {
    const out = renderToStaticMarkup(<StepQuoteForm variant="page" />);
    expect(out).not.toContain('placeholder="you@email.com"');
    expect(out).not.toContain('What should we call you?');
  });

  it('has a hidden spam-trap field that people never see', () => {
    expect(renderToStaticMarkup(<StepQuoteForm />)).toContain('aria-hidden="true"');
  });

  it('never pre-selects a WhatsApp choice or a tile', () => {
    expect(renderToStaticMarkup(<StepQuoteForm />)).not.toContain('aria-pressed="true"');
  });
});
