import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BookingFlow, type BookingFlowProps } from '@/components/booking/BookingFlow';

const base: BookingFlowProps = {
  enabled: true,
  initialType: null,
  initialPostcode: '',
  durations: { solar: 60, ashp: 60, solar_ashp: 90 },
  whatsapp: '441633965439',
  phone: '01633 965205',
  year: 2026,
};
const html = (over: Partial<BookingFlowProps> = {}) => renderToStaticMarkup(<BookingFlow {...base} {...over} />);

describe('the booking form: one question at a time', () => {
  it('opens on how would you like to speak to us, with all three choices', () => {
    const out = html();
    expect(out).toContain('How would you like to speak to us?');
    expect(out).toContain('In-person consultation');
    expect(out).toContain('Phone call');
    expect(out).toContain('Video call');
  });

  it('shows only the first question, with progress, not the whole form', () => {
    const out = html();
    expect(out).toContain('1 / 3');
    expect(out).not.toContain('What’s the survey for?');
    expect(out).not.toContain('Your postcode');
  });

  it('skips the first question when the link already chose phone (?mode=phone)', () => {
    const out = html({ initialMode: 'phone' });
    expect(out).toContain('What would you like to talk about?');
    expect(out).toContain('2 / 7');
    expect(out).not.toContain('How would you like to speak to us?');
  });

  it('skips it for a video call too, and counts the same seven questions', () => {
    const out = html({ initialMode: 'video' });
    expect(out).toContain('What would you like to talk about?');
    expect(out).toContain('2 / 7');
  });

  it('offers a way back from the second question', () => {
    expect(html({ initialMode: 'phone' })).toContain('Back');
    expect(html()).not.toContain('>Back<');
  });

  it('does not show the choice to a customer on their own booking link', () => {
    const out = html({ token: 'abc' });
    expect(out).not.toContain('How would you like to speak to us?');
  });

  it('shows the closed message, with no choice, when online booking is off', () => {
    const out = html({ enabled: false });
    expect(out).toContain('Online booking is coming soon');
    expect(out).not.toContain('How would you like to speak to us?');
  });
});
