/**
 * General opt-out page (spec 7.4, 9): the address printed on every letter.
 * Asks for the code on the letter (or the whole web address printed there),
 * adds the address to the do-not-contact list straight away, and gives a phone
 * number for anyone who can't find it. Needs a button press (POST) so link
 * previews and crawlers can't opt anyone out.
 */
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import '@/components/prospectpv/landing/fonts';
import { SimplePage, TooManyRequests } from '@/components/prospectpv/landing/SimplePage';
import { clientKey, rateLimit } from '@/lib/prospectpv/server/requestGuard';
import { supabaseAdmin } from '@/lib/prospectpv/server/supabaseAdmin';
import { extractShortCode } from '@/lib/prospectpv/shortCode';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Stop letters · Heliaxis', robots: { index: false, follow: false } };

type Search = { done?: string; error?: string };

async function optOut(formData: FormData) {
  'use server';
  const code = extractShortCode(String(formData.get('code') ?? ''));
  if (!code) redirect('/optout?error=code');
  const key = clientKey(await headers());
  if (!(await rateLimit(`optout:${key}`, 3600, 10))) redirect('/optout?error=busy');
  const { data, error } = await supabaseAdmin().rpc('pv_opt_out', { p_code: code });
  if (error) redirect('/optout?error=failed');
  // Same answer whether or not the code exists, so this can't be used to probe for codes.
  redirect(data ? '/optout?done=1' : '/optout?error=code');
}

export default async function OptOutPage({ searchParams }: { searchParams: Search | Promise<Search> }) {
  const sp = await searchParams;
  const { data } = await supabaseAdmin().rpc('pv_setting', { p_key: 'company' });
  const phone = (data as { phone?: string } | null)?.phone ?? null;
  const call = phone ? <> Or call us on <a href={`tel:${phone.replace(/\s/g, '')}`}>{phone}</a> and we’ll do it for you.</> : null;

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
      <p>Enter the code from your letter and we’ll stop writing to that address. It’s the 8 characters at the end of the web address printed on the letter, like 7KQ4M2XA. You can paste the whole address too.{call}</p>
      {sp.error === 'code' ? <p className="pvl-err" role="alert">We couldn’t find that code. Check it against your letter and try again.</p> : null}
      {sp.error === 'failed' ? <p className="pvl-err" role="alert">That didn’t work. Please try again.</p> : null}
      <form action={optOut} className="pvl-form">
        <label className="pvl-in">
          Code from your letter
          <input type="text" name="code" autoComplete="off" autoCapitalize="characters" spellCheck={false} required />
        </label>
        <button type="submit" className="pvl-submit">Stop letters to this address</button>
      </form>
    </SimplePage>
  );
}
