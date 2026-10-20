import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { getSessionProfile } from './auth';
import { canAccess } from './portals';

export const BRAND_ACCESS_COOKIE = 'heliaxis_brand_access';

const TOKEN_SALT = 'heliaxis-brand-guidelines-v1';

export function getBrandPagePassword(): string | undefined {
  return process.env.BRAND_PAGE_PASSWORD?.trim() || undefined;
}

function signingSecret(): string {
  return process.env.BRAND_ACCESS_SECRET || getBrandPagePassword() || 'dev-brand-access';
}

export function brandAccessToken(): string {
  return createHmac('sha256', signingSecret()).update(TOKEN_SALT).digest('hex');
}

export async function hasBrandAccess(): Promise<boolean> {
  const password = getBrandPagePassword();
  if (!password) return false;

  const cookieStore = await cookies();
  const value = cookieStore.get(BRAND_ACCESS_COOKIE)?.value;
  if (!value) return false;

  const expected = brandAccessToken();
  try {
    return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Who may view the brand kit (page, inline images and downloads): external
 * partners holding the shared-password cookie, OR signed-in staff granted the
 * Branding portal (admins always).
 */
export async function canViewBrand(): Promise<boolean> {
  if (await hasBrandAccess()) return true;
  const { profile } = await getSessionProfile();
  return canAccess(profile, 'branding');
}

export function verifyBrandPassword(input: string): boolean {
  const password = getBrandPagePassword();
  if (!password || !input) return false;

  const a = Buffer.from(input);
  const b = Buffer.from(password);
  if (a.length !== b.length) return false;

  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
