import { NextResponse } from 'next/server';
import { clientIp, emailShell, esc, sendEmail } from '@/lib/subcontractors/server';
import { issueLoginCode, LoginUnavailableError } from '@/lib/subcontractors/session';
import { jsonError, sameOrigin, str } from '@/lib/subcontractors/portal-request';

/** Email a 6-digit sign-in code. Same response whether or not the address is known. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError('Forbidden', 403);
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = str(body.email, 160);
  let issued: Awaited<ReturnType<typeof issueLoginCode>>;
  try {
    issued = await issueLoginCode(email, clientIp(req.headers));
  } catch (e) {
    // Same for every address, so it reveals nothing about who is registered.
    console.error('[portal-login] cannot issue codes', e);
    if (e instanceof LoginUnavailableError) {
      return jsonError('Sign-in is temporarily unavailable. Please call 01633 965205 and we will get you in.', 503);
    }
    throw e;
  }
  if (issued) {
    await sendEmail({
      to: issued.sub.email,
      subject: `Your Heliaxis sign-in code: ${issued.code}`,
      html: emailShell(
        'Your sign-in code',
        `<p>Use this code to sign in to the Heliaxis subcontractor portal for ${esc(issued.sub.company_name)}:</p>
         <p style="font-size:30px;font-weight:800;letter-spacing:.3em;margin:18px 0">${issued.code}</p>
         <p>It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p>`
      ),
    });
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
