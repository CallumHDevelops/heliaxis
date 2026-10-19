import type { Metadata } from 'next';
import Image from 'next/image';
import { schemaReady } from '@/lib/schema-ready';
import { OFFICE_PHONE, tokenView, type TokenView } from '@/lib/booking/book';
import { getBookingSettings } from '@/lib/booking/settings-server';
import { BookingFlow } from '@/components/booking/BookingFlow';
import '@/components/booking/booking.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Book your free survey',
  robots: { index: false, follow: false },
};

const WHATSAPP = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '441633965439').replace(/\D/g, '');
const YEAR = new Date().getFullYear();

/**
 * A customer's own booking link (sent by staff from the job): pick a survey time, or change or
 * cancel the one they have. Private: no-store, noindex and no-referrer (next.config.ts), no trackers.
 */
export default async function BookWithLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let view: TokenView | null = null;
  if (/^[A-Za-z0-9_-]{16,64}$/.test(token) && (await schemaReady()).booking) {
    view = await tokenView(token).catch(() => null);
  }
  const s = view ? await getBookingSettings() : null;

  return (
    <div className="bk-page">
      <header className="bk-head">
        <Image src="/assets/heliaxis-logo.png" alt="Heliaxis" width={128} height={29} style={{ width: 128, height: 'auto' }} priority />
        <span className="bk-head-tag">Your survey</span>
      </header>
      <main className="bk-main">
        {!view || !s ? (
          <div className="bk">
            <section className="bk-card">
              <h1 className="bk-h">This link has expired</h1>
              <p>Message us on WhatsApp or give us a call and we’ll book your survey.</p>
              <div className="bk-row">
                <a
                  className="bk-btn bk-btn--wa"
                  href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Hi, my survey booking link has expired.')}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp us
                </a>
                <a className="bk-btn" href={`tel:${OFFICE_PHONE.replace(/\s/g, '')}`}>
                  Call {OFFICE_PHONE}
                </a>
              </div>
            </section>
          </div>
        ) : (
          <>
            <h1 className="bk-title">
              {view.booking
                ? view.firstName
                  ? `Hi ${view.firstName}`
                  : 'Your survey'
                : view.firstName
                  ? `Hi ${view.firstName}, book your free survey`
                  : 'Book your free survey'}
            </h1>
            <p className="bk-lead">
              {view.booking
                ? view.canChange
                  ? 'Here’s your survey. You can change or cancel it here.'
                  : 'Here’s your survey.'
                : 'Pick a time that suits you. We’ll come to you, and it’s free.'}
            </p>
            <BookingFlow
              token={token}
              enabled={view.enabled}
              firstName={view.firstName}
              person={{ name: view.name, email: view.email, phone: view.phone }}
              initialType={view.type}
              initialPostcode={view.postcode}
              initialAddress={view.address}
              booking={view.booking}
              canChange={view.canChange}
              durations={s.durations}
              intro={s.advanced.intro}
              whatsapp={WHATSAPP}
              phone={OFFICE_PHONE}
              year={YEAR}
            />
          </>
        )}
      </main>
    </div>
  );
}
