import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin/AdminShell';
import { getSessionProfile } from '@/lib/auth';
import { RAMS_ORIGIN, safeRamsPath } from '@/lib/sso';
import { sendSsoCode, verifySsoCode } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Open RAMS · Heliaxis', robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  wrong: 'That code isn’t right. Check the email and try again.',
  expired: 'That code has expired. Send a new one.',
  locked: 'Too many wrong tries. Send a new code, or if that’s refused, try again tomorrow.',
  wait: 'Codes can only be sent every two minutes. Use the last one, or ask again shortly.',
  failed: 'The email couldn’t be sent. Try again in a minute.',
  setup: 'This isn’t switched on yet: sso.sql needs running in Supabase (it’s on the From Claude card).',
};

/** One-off step before one-tap sign-in to RAMS: prove the email address is yours (src/lib/sso.ts). */
export default async function SsoPage({ searchParams }: { searchParams: Promise<{ next?: string; step?: string; e?: string }> }) {
  const q = await searchParams;
  const next = safeRamsPath(q.next ?? null);
  const { user, profile } = await getSessionProfile();
  const email = user?.email ?? '';
  const error = q.e && Object.hasOwn(ERRORS, q.e) ? ERRORS[q.e] : null;

  return (
    <AdminShell active="dashboard" isAdmin={profile?.role === 'admin'}>
      <div className="sso-page">
        <h1>Open RAMS without signing in</h1>
        {error && <p className="sso-err">{error}</p>}
        {q.step === 'code' ? (
          <>
            <p>
              We’ve emailed a 6-digit code to <b>{email}</b>. Type it in here. It works for 15 minutes.
            </p>
            <form action={verifySsoCode} className="sso-row">
              <input type="hidden" name="next" value={next} />
              <label htmlFor="sso-code" className="sso-visually-hidden">
                Code
              </label>
              <input
                id="sso-code"
                name="code"
                className="sso-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                maxLength={7}
                required
                placeholder="123456"
              />
              <button type="submit" className="sso-btn">
                Confirm
              </button>
            </form>
            <form action={sendSsoCode}>
              <input type="hidden" name="next" value={next} />
              <button type="submit" className="sso-link">
                Send a new code
              </button>
            </form>
          </>
        ) : (
          <>
            <p>
              First, confirm that <b>{email}</b> is your email address. You only do this once. It stops anyone else using your
              address to open RAMS as you.
            </p>
            <form action={sendSsoCode}>
              <input type="hidden" name="next" value={next} />
              <button type="submit" className="sso-btn">
                Email me a code
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
        .sso-row { display: flex; gap: 10px; flex-wrap: wrap; }
        .sso-code { font: inherit; font-size: 1.4rem; font-weight: 700; letter-spacing: .25em; width: 9.5em; max-width: 100%;
          padding: .5rem .7rem; border: 1px solid rgba(33,31,24,.25); border-radius: 2px; background: #fff; color: #211f18; }
        .sso-btn { font: inherit; font-weight: 800; color: #211f18; background: #f8bc1e; border: 0; border-radius: 2px;
          padding: .7rem 1.1rem; cursor: pointer; }
        .sso-link { font: inherit; font-size: .88rem; background: none; border: 0; padding: 0; color: #8a5d00;
          text-decoration: underline; cursor: pointer; }
        .sso-err { color: #a3322a !important; }
        .sso-alt { font-size: .88rem; }
        .sso-alt a { color: #8a5d00; }
        .sso-visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
      `}</style>
    </AdminShell>
  );
}
