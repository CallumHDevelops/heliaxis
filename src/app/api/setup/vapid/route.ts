import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { getSessionProfile } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** A fresh pair of Web Push (VAPID) keys for the admin to paste into Vercel. Not stored here. */
export async function POST() {
  const { profile } = await getSessionProfile();
  if (profile?.role !== 'admin' || profile.status !== 'approved') return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return NextResponse.json({ error: 'The keys are already set in Vercel.' }, { status: 400 });
  const k = webpush.generateVAPIDKeys();
  return NextResponse.json(
    {
      keys: [
        { name: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', value: k.publicKey },
        { name: 'VAPID_PRIVATE_KEY', value: k.privateKey },
        { name: 'VAPID_SUBJECT', value: `mailto:${profile.email || 'hello@heliaxis.co.uk'}` },
      ],
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
