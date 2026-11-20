import { manifestResponse, portalManifest } from '@/lib/crm/portal-manifest';

/** The sign-in page's manifest: installed from /my, the app opens /my (which reopens a remembered project). */
export function GET() {
  return manifestResponse(portalManifest());
}
