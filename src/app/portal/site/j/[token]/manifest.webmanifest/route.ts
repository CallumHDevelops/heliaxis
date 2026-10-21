import { isLinkToken, manifestResponse } from '@/lib/site/manifest';

export const dynamic = 'force-dynamic';

/** Installed from a link, the app starts at that link, so it can sign itself in the first time it opens. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return manifestResponse(isLinkToken(token) ? `/portal/site/j/${token}` : '/portal/site');
}
