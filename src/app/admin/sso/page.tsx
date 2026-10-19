import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin/AdminShell';
import { getSessionProfile } from '@/lib/auth';
import { RAMS_ORIGIN, safeRamsPath } from '@/lib/sso';
import { sendSsoProof } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Open RAMS · Heliaxis', robots: { index: false, follow: false } };

/** One-off step before one-tap sign-in to RAMS: prove the email address is yours (src/lib/sso.ts). */
export default async function SsoPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; sent?: string; confirmed?: string; expired?: string; failed?: string }>;
}) {
  const q = await searchParams;
  const next = safeRamsPath(q.next ?? null);
  const { user, profile } = await getSessionProfile();
  const email = user?.email ?? '';

  return (
    <AdminShell active="dashboard" isAdmin={profile?.role === 'admin'}>
      <div className="sso-page">
        <h1>Open RAMS without signing in</h1>
        {q.confirmed ? (
          <>
            <p className="sso-ok">Your email is confirmed. RAMS now opens from the menu without signing in.</p>
            <a className="sso-btn" href={`/api/sso/rams?${new URLSearchParams({ next })}`}>
              Open RAMS
            </a>
          </>
        ) : q.sent ? (
          <p>
            We’ve emailed a link to <b>{email}</b>. Open it on any device. After that, come back and tap RAMS. The link works
            for an hour.
          </p>
        ) : (
          <>
            {q.expired && <p className="sso-err">That link has expired or was for a different account. Send a new one.</p>}
            {q.failed && <p className="sso-err">The email couldn’t be sent. Try again in a minute.</p>}
            <p>
              First, confirm that <b>{email}</b> is your email address. You only do this once. It stops anyone else using your
              address to open RAMS as you.
            </p>
            <form action={sendSsoProof}>
              <input type="hidden" name="next" value={next} />
              <button type="submit" className="sso-btn">
                Email me a link
              </button>
            </form>
          </>
        )}
        <p className="sso-alt">
          Or <a href={`${RAMS_ORIGIN}${next}`}>open RAMS and sign in as usual</a>.
        </p>
      </div>
      <style>{`
        .sso-page { max-width: 560px; color: #211f18; display: flex; flex-direction: column; gap: 14px; }
        .sso-page h1 { font-size: 1.4rem; font-weight: 800; margin: 0; }
        .sso-page p { margin: 0; line-height: 1.55; color: #4a473e; }
        .sso-btn { display: inline-block; font: inherit; font-weight: 800; color: #211f18; background: #f8bc1e; border: 0;
          border-radius: 2px; padding: .7rem 1.1rem; text-decoration: none; cursor: pointer; }
        .sso-ok { color: #3f7d4e !important; font-weight: 700; }
        .sso-err { color: #a3322a !important; }
        .sso-alt { font-size: .88rem; }
        .sso-alt a { color: #8a5d00; }
      `}</style>
    </AdminShell>
  );
}
