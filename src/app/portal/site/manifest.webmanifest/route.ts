import { manifestResponse } from '@/lib/site/manifest';

export const dynamic = 'force-static';

/** The manifest for every site app page apart from a link (that one starts at its link). */
export function GET() {
  return manifestResponse('/portal/site');
}
