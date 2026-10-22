import { NextResponse } from 'next/server';
import { designSession, json, okPath, signedFile } from '@/lib/design/server';

export const dynamic = 'force-dynamic';

/**
 * Stable URL for a Design studio file (template PDF, uploaded image, thumbnail):
 * /api/design/file?path=uploads/… → a short-lived signed storage URL. Saved designs
 * reference files by this URL so they never hold an expiring link.
 */
export async function GET(req: Request) {
  if (!(await designSession())) return json({ error: 'unauthorized' }, 401);
  const path = new URL(req.url).searchParams.get('path');
  if (!okPath(path)) return json({ error: 'Not found' }, 404);
  const url = await signedFile(path, 600);
  if (!url) return json({ error: 'Not found' }, 404);
  return new NextResponse(null, {
    status: 302,
    headers: { Location: url, 'Cache-Control': 'private, max-age=300', 'Referrer-Policy': 'no-referrer' },
  });
}
