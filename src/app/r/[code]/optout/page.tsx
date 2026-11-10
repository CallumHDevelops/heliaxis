/**
 * "Stop letters to this address" (spec 7.4, 9). Writes to pv_suppression
 * immediately; suppression is checked before every scan and print run.
 * A button press (POST via server action) is required so link previews and
 * crawlers can't opt someone out by visiting the URL.
 */
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import '@/components/prospectpv/landing/fonts';
import { LinkNotFound, SimplePage, TooManyRequests } from '@/components/prospectpv/landing/SimplePage';
import { clientKey, rateLimit } from '@/lib/prospectpv/server/requestGuard';
import { supabaseAdmin } from '@/lib/prospectpv/server/supabaseAdmin';
import { normaliseShortCode } from '@/lib/prospectpv/shortCode';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Stop letters · Heliaxis', robots: { index: false, follow: false } };

type Params = { code: string };
type Search = { done?: string; error?: string };

async function optOut(formData: FormData) {
  'use server';
  const code = normaliseShortCode(String(formData.get('code') ?? ''));
  if (!code) redirect('/');
  const key = clientKey(await headers());
  if (!(await rateLimit(`optout:${key}`, 3600, 10))) redirect(`/r/${code}/optout?error=busy`);
  const { data, error } = await supabaseAdmin().rpc('pv_opt_out', { p_code: code });
  if (error || !data) redirect(`/r/${code}/optout?error=failed`);
  redirect(`/r/${code}/optout?done=1`);
}

export default async function OptOutPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Search | Promise<Search>;
}) {
  const { code: raw } = await params;
  const sp = await searchParams;
  const code = normaliseShortCode(raw);
  if (!code) return <LinkNotFound />;

  if (sp.done) {
    return (
      <SimplePage title="Done. We won’t write to this address again.">
        <p>We’ve added the address to our do-not-contact list straight away. You don’t need to do anything else.</p>
      </SimplePage>
    );
  }
  if (sp.error === 'busy') return <TooManyRequests />;

  return (
    <SimplePage title="Stop letters to this address">
      <p>We’ll add this address to our do-not-contact list and won’t send any more letters to it.</p>
      {sp.error ? <p className="pvl-err" role="alert">That didn’t work. Try again, or call us and we’ll do it for you.</p> : null}
      <form action={optOut}>
        <input type="hidden" name="code" value={code} />
        <button type="submit" className="pvl-submit" style={{ width: '100%' }}>
          Stop letters to this address
        </button>
      </form>
    </SimplePage>
  );
}
