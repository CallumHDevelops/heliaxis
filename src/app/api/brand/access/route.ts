import { NextResponse } from 'next/server';
import {
  BRAND_ACCESS_COOKIE,
  brandAccessToken,
  getBrandPagePassword,
  verifyBrandPassword,
} from '@/lib/brand-access';

export async function POST(request: Request) {
  if (!getBrandPagePassword()) {
    return NextResponse.json(
      { error: 'Brand page access is not configured. Set BRAND_PAGE_PASSWORD.' },
      { status: 503 },
    );
  }

  let password = '';
  try {
    const body = (await request.json()) as { password?: string };
    password = String(body.password || '');
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (!verifyBrandPassword(password)) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(BRAND_ACCESS_COOKIE, brandAccessToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
