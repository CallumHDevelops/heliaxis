import { deviceSession, isResponse, siteJson, theirAssignment } from '@/lib/site/device';
import { buildPack } from '@/lib/site/pack';

export const dynamic = 'force-dynamic';

/** One job's pack for the phone (src/lib/site/pack.ts): details, team, access, drawings and design as short-lived links, answers and photos held. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await deviceSession(req);
  if (isResponse(s)) return s;
  const a = await theirAssignment(s, (await params).id);
  if (isResponse(a)) return a;
  return siteJson(await buildPack(s.db, a));
}
