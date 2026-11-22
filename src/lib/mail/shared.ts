/**
 * My email: the rules that need no database or network, shared by the server job and the screens (and tested on
 * their own in tests/mail-sort.test.ts).
 */

/** Free email services: someone on one of these is matched by their own address, never the whole domain. */
const PERSONAL = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'outlook.co.uk', 'live.com', 'live.co.uk',
  'msn.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'aol.co.uk',
  'btinternet.com', 'btopenworld.com', 'sky.com', 'virginmedia.com', 'ntlworld.com', 'blueyonder.co.uk', 'talktalk.net',
  'tiscali.co.uk', 'plus.net', 'protonmail.com', 'proton.me', 'gmx.com', 'gmx.co.uk', 'mail.com', 'zoho.com',
]);

/** Second-level endings where the company's name is one label further left (nationalgrid.co.uk, not co.uk). */
const TWO_PART = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'me.uk', 'nhs.uk', 'sch.uk', 'com.au', 'co.nz', 'com.cn', 'co.za']);

export const addressOf = (a: string | null | undefined) => (a ?? '').trim().toLowerCase();

export function domainOf(address: string | null | undefined): string {
  const a = addressOf(address);
  const at = a.lastIndexOf('@');
  return at < 0 ? '' : a.slice(at + 1);
}

/** The company's own domain: mail.goodwe.com → goodwe.com, email.nationalgrid.co.uk → nationalgrid.co.uk. */
export function companyDomain(domain: string): string {
  const parts = domain.toLowerCase().split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const lastTwo = parts.slice(-2).join('.');
  return TWO_PART.has(lastTwo) ? parts.slice(-3).join('.') : lastTwo;
}

export const isPersonalDomain = (domain: string) => PERSONAL.has(domain.toLowerCase());

/** A domain from a website or an email address ("https://www.goodwe.com/uk" → goodwe.com). */
export function domainFromText(s: string | null | undefined): string {
  const t = (s ?? '').trim().toLowerCase();
  if (!t) return '';
  if (t.includes('@')) return companyDomain(domainOf(t));
  const host = t.replace(/^[a-z]+:\/\//, '').split(/[/?#:]/)[0].replace(/^www\./, '');
  return host.includes('.') ? companyDomain(host) : '';
}

/** "goodwe.com" → "Goodwe" until the real name is worked out. */
export function guessLabel(domain: string): string {
  const name = companyDomain(domain).split('.')[0] ?? domain;
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : domain;
}

/** The folder groups. A rule's folder is "<group>/<name>"; you can change either part in Email › Folders. */
export const GROUPS = ['Customers', 'Suppliers', 'Grid and DNO', 'Partners', 'Finance and admin', 'Software and services', 'Team', 'Other'] as const;
export type Group = (typeof GROUPS)[number];
export const MARKETING_FOLDER = 'Marketing';

/** Outlook won't take some characters in a folder name, and a / here would make an extra level. */
export function cleanFolderPart(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Other';
}
export const folderFor = (group: string, name: string) => `${cleanFolderPart(group)}/${cleanFolderPart(name)}`;

/** Splits and tidies a folder path someone typed: " Suppliers / GoodWe " → "Suppliers/GoodWe". At most three levels. */
export function tidyFolderPath(path: string): string {
  return path
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map(cleanFolderPart)
    .join('/');
}

/** The organisation's type in the CRM → its folder group. */
export function groupForOrgType(type: string | null | undefined): Group {
  switch (type) {
    case 'supplier':
      return 'Suppliers';
    case 'partner':
      return 'Partners';
    case 'commercial':
    case 'landlord':
    case 'public_sector':
      return 'Customers';
    default:
      return 'Other';
  }
}

export type Header = { name?: string; value?: string };

/** Sent to a mailing list (a newsletter, an offer): it carries an unsubscribe link or says it's bulk mail. */
export function looksLikeMarketing(headers: Header[] | null | undefined): boolean {
  for (const h of headers ?? []) {
    const n = (h.name ?? '').toLowerCase();
    const v = (h.value ?? '').toLowerCase();
    if (n === 'list-unsubscribe' && v.trim()) return true;
    if (n === 'precedence' && /\b(bulk|list|junk)\b/.test(v)) return true;
    if (n === 'x-campaign' || n === 'x-mc-user' || n === 'x-campaignid') return true;
    if (n === 'feedback-id' && /campaign|newsletter/.test(v)) return true;
  }
  return false;
}

/** Sent by a system, not a person (noreply@, notifications@, a bounce): never needs a reply. */
export function looksAutomated(address: string | null | undefined, headers?: Header[] | null): boolean {
  const local = addressOf(address).split('@')[0] ?? '';
  if (/^(no-?reply|do-?not-?reply|donotreply|notifications?|alerts?|mailer-daemon|postmaster|bounces?|automated|system|info-noreply)([+._-]|$)/.test(local)) return true;
  for (const h of headers ?? []) {
    const n = (h.name ?? '').toLowerCase();
    const v = (h.value ?? '').toLowerCase();
    if (n === 'auto-submitted' && v && v !== 'no') return true;
  }
  return false;
}

export type ThreadState = 'new' | 'reply' | 'fyi' | 'replied' | 'done' | 'marketing';

/**
 * Where a conversation stands. You sent the last email: replied. You said no reply needed after their last one:
 * done. Marketing: marketing. Otherwise what the triage said about their last email (new until it has looked).
 */
export function threadState(t: {
  marketing: boolean;
  lastInAt: string | null;
  lastOutAt: string | null;
  doneAt: string | null;
  triagedFor: string | null;
  needsReply: boolean | null;
}): ThreadState {
  if (t.marketing && !t.lastOutAt) return 'marketing';
  const inAt = t.lastInAt ? Date.parse(t.lastInAt) : 0;
  const outAt = t.lastOutAt ? Date.parse(t.lastOutAt) : 0;
  if (!inAt || outAt >= inAt) return 'replied';
  if (t.doneAt && Date.parse(t.doneAt) >= inAt) return 'done';
  if (!t.triagedFor || Date.parse(t.triagedFor) < inAt) return 'new';
  return t.needsReply ? 'reply' : 'fyi';
}

/** Emails older than this are filed whatever their state: nobody is still waiting on a reply to them here. */
export const FILE_AFTER_DAYS = 30;

/** Whether an email in the inbox can go to its folder now: its conversation is dealt with, or it's old. */
export function readyToFile(state: ThreadState, at: string, now = Date.now()): boolean {
  if (state === 'replied' || state === 'done' || state === 'fyi') return true;
  return now - Date.parse(at) > FILE_AFTER_DAYS * 86_400_000;
}

export const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

/** Plain text to the little HTML Outlook wants for a reply: escaped, line breaks kept. */
export function textToHtml(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}
