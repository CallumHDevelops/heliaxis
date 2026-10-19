import 'server-only';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireApproved, requirePortal } from '@/lib/auth';
import { canAccess } from '@/lib/portals';
import { linkedToOpportunity } from './active';

/**
 * Shared bits for /api/whatsapp/*. Settings, rules, import and the inbox list are behind the Enquiries
 * portal (session()); one chat, its templates and its queued messages also let CRM staff in for
 * customers with a job (chatSession()).
 */
export const NO_STORE = { 'Cache-Control': 'no-store' };
export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
export const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

export async function session() {
  return requirePortal('enquiries');
}

type Session = NonNullable<Awaited<ReturnType<typeof requireApproved>>>;
/** 'all': Enquiries staff, any chat. 'linked': CRM staff, chats whose number has an opportunity. */
export type ChatSession = Session & { scope: 'all' | 'linked' };

/** Who may use one chat: Enquiries staff any chat; CRM staff a chat whose number has an opportunity. */
export async function chatSession(enquiryId?: string): Promise<ChatSession | null> {
  const s = await requireApproved();
  if (!s) return null;
  if (canAccess(s.profile, 'enquiries')) return { ...s, scope: 'all' };
  if (!canAccess(s.profile, 'crm')) return null;
  if (enquiryId !== undefined && !(await mayOpenChat({ ...s, scope: 'linked' }, enquiryId))) return null;
  return { ...s, scope: 'linked' };
}

/** For routes that answer 404 rather than 401 for a chat this person can't see, so they don't learn it exists. */
export async function mayOpenChat(s: ChatSession, enquiryId: string): Promise<boolean> {
  if (!isUuid(enquiryId)) return false;
  return s.scope === 'all' || linkedToOpportunity(enquiryId);
}

/** A short fingerprint of what a page shows: the same value means nothing on screen has changed. */
export const version = (parts: unknown) => createHash('sha1').update(JSON.stringify(parts)).digest('base64url').slice(0, 16);
