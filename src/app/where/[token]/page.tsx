import type { Metadata } from 'next';
import { OFFICE_PHONE } from '@/lib/booking/book';
import { locationView } from '@/lib/booking/location-server';
import { tidyAddress } from '@/lib/greeting-name';
import { schemaReady } from '@/lib/schema-ready';
import { BrandLogo } from '@/components/theme/BrandLogo';
import '@/components/booking/booking.css';
import { PinMap } from './PinMap';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Check your location | Heliaxis', robots: { index: false, follow: false } };

const WHATSAPP = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '441633965439').replace(/\D/g, '');

/** The page behind "please check the pin": a map with a pin they can move, and a button to confirm. Private: noindex, no referrer. */
export default async function WherePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = /^[A-Za-z0-9_-]{16,64}$/.test(token) && (await schemaReady()).booking ? await locationView(token).catch(() => null) : null;
  return (
    <div className="bk-page">
      <header className="bk-head">
        <BrandLogo width={128} priority />
        <span className="bk-head-tag">Your visit</span>
      </header>
      <main className="bk-main">
        {!view ? (
          <div className="bk">
            <section className="bk-card">
              <h1 className="bk-h">This link has expired</h1>
              <p>Message us on WhatsApp or give us a call and we’ll sort out where to meet you.</p>
              <div className="bk-row">
                <a className="bk-btn bk-btn--wa" href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noreferrer">
                  WhatsApp us
                </a>
                <a className="bk-btn" href={`tel:${OFFICE_PHONE.replace(/\s/g, '')}`}>
                  Call {OFFICE_PHONE}
                </a>
              </div>
            </section>
          </div>
        ) : (
          <PinMap
            token={token}
            firstName={view.firstName}
            lat={view.lat}
            lng={view.lng}
            exact={view.exact}
            address={tidyAddress([view.address, view.postcode].filter(Boolean).join(', '))}
            surveyAt={view.surveyAt}
            confirmedAt={view.confirmedAt}
            phone={OFFICE_PHONE}
            googleKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || ''}
          />
        )}
      </main>
    </div>
  );
}
