import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Jamendo music search + audio proxy.
// Requires JAMENDO_CLIENT_ID (free: https://devportal.jamendo.com/).
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const audio = searchParams.get('audio');

  // --- audio proxy (so a Jamendo stream can be used same-origin in export) ---
  if (audio) {
    let u: URL;
    try {
      u = new URL(audio);
    } catch {
      return NextResponse.json({ error: 'Bad url' }, { status: 400 });
    }
    if (
      (u.protocol !== 'http:' && u.protocol !== 'https:') ||
      !/(^|\.)jamendo\.com$/i.test(u.hostname)
    ) {
      return NextResponse.json({ error: 'Only Jamendo URLs allowed' }, { status: 400 });
    }
    const r = await fetch(u.toString());
    if (!r.ok || !r.body)
      return NextResponse.json({ error: 'Fetch failed' }, { status: 502 });
    return new Response(r.body, {
      headers: {
        'content-type': r.headers.get('content-type') || 'audio/mpeg',
        'cache-control': 'private, max-age=3600',
      },
    });
  }

  // --- search ---
  const cid = process.env.JAMENDO_CLIENT_ID;
  if (!cid)
    return NextResponse.json(
      { error: 'Music search is not configured (set JAMENDO_CLIENT_ID).' },
      { status: 500 }
    );

  const q = (searchParams.get('q') || '').trim();
  const api = new URL('https://api.jamendo.com/v3.0/tracks/');
  api.searchParams.set('client_id', cid);
  api.searchParams.set('format', 'json');
  api.searchParams.set('limit', '30');
  api.searchParams.set('order', 'popularity_total');
  api.searchParams.set('include', 'musicinfo licenses');
  api.searchParams.set('audioformat', 'mp31');
  if (q) api.searchParams.set('search', q);
  else api.searchParams.set('tags', 'corporate');

  const r = await fetch(api.toString(), { signal: AbortSignal.timeout(9000) });
  if (!r.ok) {
    const detail = await r.text();
    return NextResponse.json({ error: 'Jamendo error', detail }, { status: 502 });
  }
  const data = await r.json();
  const tracks = (Array.isArray(data?.results) ? data.results : [])
    .filter((t: any) => t?.audio && !/\/(nc)/i.test(t?.license_ccurl || '')) // exclude non-commercial
    .map((t: any) => ({
      id: String(t.id),
      name: String(t.name || 'Untitled'),
      artist: String(t.artist_name || 'Unknown'),
      duration: Number(t.duration) || 0,
      audio: String(t.audio),
      license: String(t.license_ccurl || ''),
      image: String(t.image || t.album_image || ''),
      shareurl: String(t.shareurl || ''),
    }));

  return NextResponse.json({ tracks });
}
