import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * What the Metis desktop app needs before anyone has signed in: where Supabase is and its public (anon) key.
 * Both are already public (they ship in the website's JavaScript). The service role key is never here.
 */
export async function GET() {
  return NextResponse.json(
    { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null, supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null, minDesktopVersion: '0.1.0' },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
