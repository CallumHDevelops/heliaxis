import type { Metadata } from 'next';
import '../home.css';
import '@/components/booking/booking.css';
import { SiteFooter } from '@/components/home/SiteFooter';
import { BookingFlow } from '@/components/booking/BookingFlow';
import { isSurveyType } from '@/lib/crm/stages';
import { schemaReady } from '@/lib/schema-ready';
import { OFFICE_PHONE } from '@/lib/booking/book';
import { getBookingSettings } from '@/lib/booking/settings-server';
import { turnstileOn } from '@/lib/booking/rate-limit';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Book your free survey',
  description: 'Book a free solar, battery or heat pump survey with Heliaxis online. Pick a time that suits you and we’ll come to you.',
  alternates: { canonical: '/book-a-survey' },
};

const WHATSAPP = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '441633965439').replace(/\D/g, '');
const YEAR = new Date().getFullYear();

/** The public booking form. ?type=solar|ashp|solar_ashp and ?postcode= pre-fill it (from website buttons and ads); ?mode=phone|video starts on a phone or video call request; ?reason=quote marks it a quote consultation. */
export default async function BookASurvey({ searchParams }: { searchParams: Promise<{ type?: string; postcode?: string; mode?: string; reason?: string }> }) {
  const q = await searchParams;
  const [ready, s] = await Promise.all([schemaReady(), getBookingSettings()]);
  const enabled = ready.booking && s.enabled && s.surveyors.length > 0;
  const postcode = typeof q.postcode === 'string' ? q.postcode.replace(/[^A-Za-z0-9 ]/g, '').slice(0, 10) : '';

  return (
    <>
      <main className="bk-page bk-page--site">
        <div className="bk-main">
          <h1 className="bk-title">Book your free survey</h1>
          <p className="bk-lead">
            Tell us what it’s for and your postcode, and pick a time that suits you. We’ll come to you, look at your home and talk it all through. No
            obligation.
          </p>
          <BookingFlow
            enabled={enabled}
            initialType={isSurveyType(q.type) ? q.type : null}
            initialMode={q.mode === 'phone' || q.mode === 'video' ? q.mode : null}
            initialReason={q.reason === 'quote' ? 'quote' : null}
            initialPostcode={postcode}
            durations={s.durations}
            intro={s.advanced.intro}
            turnstileSiteKey={turnstileOn() ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null : null}
            whatsapp={WHATSAPP}
            phone={OFFICE_PHONE}
            year={YEAR}
          />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
