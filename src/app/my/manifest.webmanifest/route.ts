import { manifestResponse, portalManifest } from '@/lib/crm/portal-manifest';
import { isCustomerHost } from '@/lib/crm/portal-url';

/** The sign-in page's manifest: installed from it, the app opens the sign-in page (which reopens a remembered project). */
export function GET(req: Request) {
  return manifestResponse(portalManifest(undefined, isCustomerHost(req.headers.get('host')) ? '' : '/my'));
}
