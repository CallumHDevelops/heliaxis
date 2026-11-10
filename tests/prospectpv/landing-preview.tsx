/** Browser preview of the landing page with SAMPLE data and a mocked booking endpoint. */
import { createRoot } from 'react-dom/client';
import { LANDING_CSS } from '@/components/prospectpv/landing/landingCss';
import { LandingView } from '@/components/prospectpv/landing/LandingView';
import { SAMPLE_EXTRAS, SAMPLE_LANDING_SETTINGS, SAMPLE_LETTER } from '@/lib/prospectpv/fixtures/sample';
import type { LandingModel } from '@/lib/prospectpv/landing';

const withAccred = { ...SAMPLE_LETTER, images: { ...SAMPLE_LETTER.images, accreditations: (window as unknown as { __accred?: string }).__accred ?? '' } };
const model: LandingModel = {
  letterCode: SAMPLE_LETTER.letterCode,
  letter: withAccred,
  settings: SAMPLE_LANDING_SETTINGS,
  calculatorOn: true,
  financeOn: false,
  quoteContext: {
    packagePrice: SAMPLE_LETTER.package.priceIncVat,
    baseBatteryKwh: SAMPLE_LETTER.estimate.batteryKwh,
    moduleKwh: 5,
    modulePrice: 2000,
    maxKwh: 30,
    extras: SAMPLE_EXTRAS,
    claims: SAMPLE_LETTER.package.claims,
  },
};

(window as unknown as { __bookings: unknown[] }).__bookings = [];
const realFetch = window.fetch;
window.fetch = async (input, init) => {
  if (String(input).includes('/api/prospectpv/book')) {
    const body = JSON.parse(String(init?.body));
    (window as unknown as { __bookings: unknown[] }).__bookings.push(body);
    if (!body.consent) return new Response(JSON.stringify({ errors: { consent: 'Tick the box to confirm you own the property and are happy for us to contact you.' } }), { status: 422 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  return realFetch(input, init);
};

const style = document.createElement('style');
style.textContent = LANDING_CSS;
document.head.appendChild(style);
createRoot(document.getElementById('root')!).render(<LandingView model={model} optOutHref="#optout" />);
