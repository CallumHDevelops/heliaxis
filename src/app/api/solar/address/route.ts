import { NextResponse } from 'next/server';
import { suggest } from '@/lib/estimator/address-lookup';

export const dynamic = 'force-dynamic';

const perIp = new Map<string, number[]>();

/** Address suggestions as the visitor types. ?q=2 marine terrace np26 */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') || '').slice(0, 100);
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'x';
  const now = Date.now();
  const recent = (perIp.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= 120) return NextResponse.json({ suggestions: [] });
  recent.push(now);
  perIp.set(ip, recent);
  if (perIp.size > 5000) perIp.clear();
  return NextResponse.json({ suggestions: await suggest(q) }, { headers: { 'Cache-Control': 'no-store' } });
}
