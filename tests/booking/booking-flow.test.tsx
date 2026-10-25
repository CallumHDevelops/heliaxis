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

describe('the booking form: how would you like to speak to us?', () => {
  it('offers Phone call, In-person consultation and Video call', () => {
    const out = html();
    expect(out).toContain('How would you like to speak to us?');
    expect(out).toContain('In-person consultation');
    expect(out).toContain('Phone call');
    expect(out).toContain('Video call');
  });

  it('starts on the in-person survey form, as before', () => {
    const out = html();
    expect(out).toContain('What’s the survey for?');
    expect(out).toContain('Find times');
    expect(out).not.toContain('Request a phone call');
  });

  it('opens the phone call request when asked to (?mode=phone)', () => {
    const out = html({ initialMode: 'phone' });
    expect(out).toContain('Tell us about your phone call');
    expect(out).toContain('Request a phone call');
    expect(out).toContain('Best time to ring you');
    expect(out).not.toContain('Find times');
  });

  it('opens the video call request (?mode=video) and asks for an email', () => {
    const out = html({ initialMode: 'video' });
    expect(out).toContain('Tell us about your video call');
    expect(out).toContain('Request a video call');
    expect(out).toContain('we’ll send the video link here');
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
