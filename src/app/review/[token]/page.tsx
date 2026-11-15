import type { Metadata } from 'next';
import { BrandLogo } from '@/components/theme/BrandLogo';
import { createAdminClient } from '@/lib/supabase/admin';
import { firstNameOf, readRequestByToken, readReviewSettings } from '@/lib/reviews/server';
import { PrivateFeedback } from './PrivateFeedback';
import './review.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Share your feedback | Heliaxis', robots: { index: false, follow: false } };

/**
 * A customer's personal review link. Everyone gets the same page and the same choices: review on Google, review on Trustpilot, or tell us privately.
 * There is no rating question first and no reward, so nobody is steered to a public site (or away from one) by how they feel.
 */
export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createAdminClient();
  const row = await readRequestByToken(db, token).catch(() => null);
  if (!row) {
    return (
      <main className="rv">
        <header className="rv-head">
          <BrandLogo width={128} priority />
        </header>
        <section className="rv-card">
          <h1>This link isn’t working</h1>
          <p>It may have been mistyped. Please contact Heliaxis on 01633 965205.</p>
        </section>
      </main>
    );
  }
  if (!row.opened_at) await db.from('review_requests').update({ opened_at: new Date().toISOString() }).eq('id', row.id);
  const [{ data: e }, s] = await Promise.all([db.from('enquiries').select('name').eq('id', row.enquiry_id).maybeSingle(), readReviewSettings(db)]);
  const first = firstNameOf(String((e as { name?: string } | null)?.name ?? ''));
  return (
    <main className="rv">
      <header className="rv-head">
        <BrandLogo width={128} priority />
      </header>
      <section className="rv-card">
        <h1>{first ? `Thank you, ${first}` : 'Thank you'}</h1>
        <p>Thank you for choosing Heliaxis. If you have two minutes, a review helps other people deciding who to trust, and it tells us what we got right and what we can do better.</p>
        <p>Choose whichever suits you. We ask every customer in the same way, and we would like to hear it whatever you think.</p>
        <div className="rv-actions">
          {s.googleUrl && (
            <a className="rv-btn" href={`/review/${token}/go/google`} rel="noopener">
              Review us on Google
            </a>
          )}
          {s.trustpilotUrl && (
            <a className="rv-btn" href={`/review/${token}/go/trustpilot`} rel="noopener">
              Review us on Trustpilot
            </a>
          )}
        </div>
        <PrivateFeedback token={token} done={!!row.feedback} />
      </section>
      <p className="rv-foot">Heliaxis · 01633 965205</p>
    </main>
  );
}
