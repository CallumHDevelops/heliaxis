/**
 * Public landing page: /r/{code}. The only public surface of ProspectPV.
 * Looks up one code via pv_landing_open (which records the scan), and shows
 * exactly the figures printed on that letter.
 */
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import '@/components/prospectpv/landing/fonts';
import { LANDING_CSS } from '@/components/prospectpv/landing/landingCss';
import { LandingView } from '@/components/prospectpv/landing/LandingView';
import { LinkNotFound, TooManyRequests } from '@/components/prospectpv/landing/SimplePage';
import { toLandingModel } from '@/lib/prospectpv/landing';
import { clientKey, rateLimit } from '@/lib/prospectpv/server/requestGuard';
import { supabaseAdmin } from '@/lib/prospectpv/server/supabaseAdmin';
import { normaliseShortCode } from '@/lib/prospectpv/shortCode';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Your roof results · Heliaxis',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

type Params = { code: string };

export default async function LandingPage({ params }: { params: Promise<Params> }) {
  const { code: raw } = await params;
  const code = normaliseShortCode(raw);
  const db = supabaseAdmin();

  const phone = async () => {
    const { data } = await db.rpc('pv_setting', { p_key: 'company' });
    return (data as { phone?: string } | null)?.phone ?? null;
  };

  if (!code) return <LinkNotFound phone={await phone()} />;

  const key = clientKey(await headers());
  if (!(await rateLimit(`landing:${key}`, 60, 30))) return <TooManyRequests />;

  const { data, error } = await db.rpc('pv_landing_open', { p_code: code });
  if (error) throw new Error(`pv_landing_open failed: ${error.message}`);
  if (!data) return <LinkNotFound phone={await phone()} />;

  const model = toLandingModel(data, { assetBase: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL });
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />
      <LandingView
        model={model}
        optOutHref={`/r/${code}/optout`}
        checkAnotherHref={model.settings.landing.walk_in_lookup_enabled ? '/r/check' : undefined}
      />
    </>
  );
}
