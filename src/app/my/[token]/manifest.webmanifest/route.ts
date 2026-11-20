import { manifestResponse, portalManifest } from '@/lib/crm/portal-manifest';

const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

/** A project's manifest: installed from the project, the app opens that project. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return manifestResponse(portalManifest(TOKEN.test(token) ? token : undefined));
}
