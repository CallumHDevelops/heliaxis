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

/**
 * A CRM customer's own folder, inside your Inbox: Inbox › Customers › "Sarah Davies (HX-0069)". The reference ties
 * the folder to their record (and keeps two customers with the same name apart).
 */
export const customerFolder = (name: string, ref: string | null | undefined) => `Inbox/Customers/${cleanFolderPart(ref ? `${name} (${ref})` : name)}`;

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
  // A blank line between paragraphs, none after the last: so a signature that starts with your name sits right
  // under "Kind Regards", as in Outlook.
  const paras = esc.split(/\n{2,}/);
  return paras.map((p, i) => `<p style="margin: 0 0 ${i === paras.length - 1 ? '0' : '1em'} 0;">${p.replace(/\n/g, '<br>')}</p>`).join('');
}

/**
 * What their latest email shows in Outlook (always flagged): urgent ("Urgent"), something to do that isn't a reply
 * ("Action needed"), high or any other reply ("Needs reply"), or nothing once it's dealt with.
 */
export function markFor(highlight: boolean, state: string, priority: string | null, actionOnly = false): 'urgent' | 'action' | 'high' | 'reply' | null {
  if (!highlight || state !== 'reply') return null;
  if (priority === 'urgent') return 'urgent';
  if (actionOnly) return 'action';
  return priority === 'high' ? 'high' : 'reply';
}

/* ── Your Outlook signature, copied from your sent emails ───────────────── */

/** The whole element starting at `start` (an opening tag), with everything inside it, matched by tag name. */
function elementAt(html: string, start: number): string | null {
  const open = /^<([a-z0-9]+)\b/i.exec(html.slice(start));
  if (!open) return null;
  const tag = open[1].toLowerCase();
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return null;
}

/** Sent from Outlook on a phone: its signature ("Get Outlook for iOS") isn't the real one. */
export const fromPhone = (html: string) => /ms-outlook-mobile-signature|Get Outlook for (iOS|Android)/i.test(html);

const textOf = (html: string) => html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * The signature in one sent email's own part (Outlook's uniqueBody, HTML): the block Outlook marks as the signature
 * (id="Signature", as Outlook on the web and the new Outlook do). Null when there isn't one.
 */
export function markedSignature(html: string): string | null {
  const m = /<(div|table|p)\b[^>]*\bid="?(x_)?Signature"?[^>]*>/i.exec(html);
  if (!m) return null;
  const el = elementAt(html, m.index);
  return el && textOf(el).length >= 3 ? el : null;
}

/** Whether a piece of HTML opens and closes its divs, tables and paragraphs properly (never closing one it didn't open). */
function balanced(html: string): boolean {
  for (const tag of ['div', 'table', 'p', 'span', 'a', 'td', 'tr']) {
    let depth = 0;
    for (const m of html.matchAll(new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi'))) {
      depth += m[1] ? -1 : 1;
      if (depth < 0) return false;
    }
    if (depth !== 0) return false;
  }
  return true;
}

const squash = (html: string) => html.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();

/**
 * For emails from Outlook on a computer, which doesn't mark the signature: the end that two emails share, starting at
 * a whole block (a paragraph, div or table) and holding some words. Null when they share no such ending.
 */
export function sharedEnding(a: string, b: string): string | null {
  const x = squash(a);
  const y = squash(b);
  let n = 0;
  while (n < x.length && n < y.length && x[x.length - 1 - n] === y[y.length - 1 - n]) n++;
  const tail = x.slice(x.length - n);
  for (const m of tail.matchAll(/<(div|p|table)\b/gi)) {
    // The email's own wrappers close after the signature (</div></body></html>): those closing tags aren't part of it.
    let piece = tail.slice(m.index);
    for (let i = 0; i < 12 && !balanced(piece); i++) {
      const end = /<\/[a-z0-9]+>\s*$/i.exec(piece);
      if (!end) break;
      piece = piece.slice(0, end.index);
    }
    piece = piece.replace(/(<\/(body|html)>\s*)+$/i, '');
    if (balanced(piece) && textOf(piece).length >= 10) return piece;
  }
  return null;
}

/**
 * Your signature from several of your sent emails: the one that turns up most, Outlook's marked signature (in at
 * least two emails) first, otherwise the ending your emails share. Emails sent from your phone are left out.
 */
export function pickSignature(bodies: string[]): string | null {
  const desk = bodies.filter((b) => b && !fromPhone(b));
  const found: string[] = [];
  for (const b of desk) {
    const s = markedSignature(b);
    if (s) found.push(s);
  }
  // A shared ending already comes from two emails, so one is enough; a marked one must turn up in two.
  let need = 2;
  if (found.length < 2) {
    found.length = 0;
    need = 1;
    for (let i = 0; i + 1 < desk.length; i++) {
      for (let j = i + 1; j < desk.length && j < i + 4; j++) {
        const s = sharedEnding(desk[i], desk[j]);
        if (s) found.push(s);
      }
    }
  }
  const counts = new Map<string, { n: number; html: string }>();
  for (const s of found) {
    const k = squash(s);
    const c = counts.get(k) ?? { n: 0, html: s };
    c.n++;
    counts.set(k, c);
  }
  // The one in the most emails (a sign-off two emails happen to share makes a longer, rarer ending), then the shortest.
  const flatDesk = desk.map(squash);
  const scored = [...counts.entries()].map(([k, c]) => ({ ...c, k, in: flatDesk.filter((d) => d.includes(k)).length }));
  const best = scored.sort((p, q) => q.in - p.in || q.n - p.n || p.k.length - q.k.length)[0];
  return best && best.n >= need ? cleanSignature(best.html) : null;
}

/** Takes out anything that runs code or loads a page (scripts, frames, forms, on… handlers, javascript: links). The rest is kept as it is. */
export function cleanSignature(html: string): string {
  return html
    .replace(/<(script|iframe|object|embed|form)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|iframe|object|embed|form|link|meta|base)\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

/** The pictures a signature uses from the email itself (src="cid:…"), by content id. */
export function cidsIn(html: string): string[] {
  return [...new Set([...html.matchAll(/src\s*=\s*["']cid:([^"']+)["']/gi)].map((m) => m[1]))];
}

/** Puts your reply at the top of the draft Outlook made (above the quoted email), the way Outlook does. */
export function insertAtTop(bodyHtml: string, html: string): string {
  const m = /<body\b[^>]*>/i.exec(bodyHtml);
  if (!m) return `${html}${bodyHtml}`;
  const at = m.index + m[0].length;
  return `${bodyHtml.slice(0, at)}${html}${bodyHtml.slice(at)}`;
}

/**
 * The font you write in (Outlook puts it on the first block of each email): the most common font-family and size
 * across your sent emails, as a style to put on replies. Null when there's nothing to go on.
 */
export function pickFont(bodies: string[]): string | null {
  const counts = new Map<string, number>();
  for (const b of bodies) {
    if (!b || fromPhone(b)) continue;
    const inner = b.replace(/^[\s\S]*?<body\b[^>]*>/i, '');
    const style = /<(?:div|p|span)\b[^>]*style="([^"]*font-family[^"]*)"/i.exec(inner)?.[1] ?? '';
    const family = /font-family:\s*([^;]+)/i.exec(style)?.[1]?.trim();
    const size = /font-size:\s*([^;]+)/i.exec(style)?.[1]?.trim();
    if (!family) continue;
    const k = `font-family: ${family.replace(/&quot;/g, "'")}${size ? `; font-size: ${size}` : ''}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const best = [...counts].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 2 ? best[0] : null;
}

/** The usual sign-offs, to swap for yours if a draft ends with a different one. */
const SIGN_OFF = /^(kind regards|best regards|warm regards|regards|many thanks|thanks|thank you|cheers|best wishes|best|all the best|speak soon|ta)\b[,!.]?$/i;

/**
 * Makes sure a reply ends with your sign-off ("Kind regards,"): left alone if it already does, a different sign-off
 * swapped for it, or added at the end. A name on the line under the sign-off is kept.
 */
export function withSignOff(text: string, signOff: string): string {
  const want = signOff.trim();
  if (!want) return text.trim();
  const lines = text.trim().split('\n');
  const norm = (x: string) => x.trim().toLowerCase().replace(/[,.!]+$/, '');
  const tail = lines.slice(-3);
  if (tail.some((l) => norm(l) === norm(want))) return text.trim();
  // A different sign-off in the last three lines (then maybe a name): swap it.
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
    if (SIGN_OFF.test(lines[i].trim())) {
      lines[i] = want;
      return lines.join('\n').trim();
    }
  }
  return `${text.trim()}\n\n${want}`;
}

/** Where "No reply needed" stores an email that has no folder of its own: Inbox › Filed. */
export const FILED_FOLDER = 'Inbox/Filed';

/**
 * Where "No reply needed" stores a conversation. It's always kept, never deleted (Delete is its own button): a
 * customer's or company's folder (approved or suggested), Marketing for marketing, otherwise Inbox › Filed.
 */
export function clearAwayTo(rule: { folder: string; status: string; action: string } | null | undefined): string {
  if (rule?.action === 'marketing') return MARKETING_FOLDER;
  if (rule && rule.action === 'file' && rule.status !== 'off' && rule.folder) return rule.folder;
  return FILED_FOLDER;
}

/* ── Your own folders ─────────────────────────────────────────────────────── */

/**
 * A "/" inside a folder's own name ("Finance / Bank") is kept as this lookalike in a path, so the path's "/" still
 * only separates levels. Shown as "/" again on screen (prettyFolder).
 */
export const NAME_SLASH = '∕';
export const pathPart = (name: string) => name.replace(/\//g, NAME_SLASH);

/** Hestia's folder for a company or contact: inside the Inbox, under its group (Inbox › Suppliers › GoodWe). */
export const companyFolder = (name: string, group: string = 'Other') => `Inbox/${cleanFolderPart(group)}/${cleanFolderPart(name)}`;

/**
 * Whether a folder is one of Hestia's own: inside the Inbox under a group (Inbox › Customers › …, Inbox › Suppliers ›
 * …), or Inbox › Filed, Inbox › Team, or Marketing. Anything else (your old folders, the app's old top-level ones) is
 * sorted again.
 */
export function isHestiaFolder(path: string): boolean {
  if (path === MARKETING_FOLDER || path === 'Inbox/Filed' || path === 'Inbox/Team') return true;
  return path.startsWith('Inbox/') && path.split('/').length >= 3;
}

/** "Inbox/Customers/Sarah Davies (HX-0069)" → "Customers › Sarah Davies (HX-0069)"; "Inbox/Finance ∕ Bank" → "Finance / Bank". */
export const prettyFolder = (folder: string) => folder.replace(/^Inbox\//, '').split('/').join(' › ').replaceAll(NAME_SLASH, '/');

const squashName = (s: string) => s.toLowerCase().replaceAll(NAME_SLASH, '/').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');

/** Your existing folder with this name (GoodWe → Inbox/GoodWe; "Lovell and Co" → Inbox/Lovell & Co.), or null. */
export function matchExisting(name: string, existing: { path: string; name: string }[]): string | null {
  const want = squashName(name);
  if (!want) return null;
  const hit = existing.find((f) => squashName(f.name) === want);
  return hit ? hit.path : null;
}

/**
 * Services that send email on behalf of another business (invoices from Xero, payments via Stripe, documents to sign
 * via DocuSign…). An email from one of these belongs with the business behind it, found from its Reply-To address,
 * not with the service ("AnyMeters" rather than "Xero").
 */
const SENDING_SERVICES = new Set([
  'xero.com', 'intuit.com', 'quickbooks.com', 'sage.com', 'freeagent.com', 'kashflow.com', 'zohoinvoice.com',
  'stripe.com', 'gocardless.com', 'paypal.com', 'paypal.co.uk', 'squareup.com', 'sumup.com', 'invoice2go.com',
  'docusign.net', 'docusign.com', 'hellosign.com', 'dropboxsign.com', 'echosign.com', 'adobesign.com', 'pandadoc.com',
  'sendgrid.net', 'amazonses.com', 'mailgun.org', 'hubspotemail.net', 'mcsv.net', 'mandrillapp.com', 'sparkpostmail.com',
]);
export const isSendingService = (domain: string) => SENDING_SERVICES.has(companyDomain(domain.toLowerCase()));

/** Who an email from them really belongs with: the Reply-To address when it came through a sending service. */
export function belongsTo(from: string, replyTo: string | null | undefined): string {
  const f = addressOf(from);
  const r = addressOf(replyTo);
  if (r && r.includes('@') && r !== f && isSendingService(domainOf(f)) && !isSendingService(domainOf(r))) return r;
  return f;
}

/**
 * With a signature that carries your name, a draft ends at the sign-off ("Kind Regards"): a name typed under it would
 * appear twice. Lines after the sign-off are dropped.
 */
export function endAtSignOff(text: string, signOff: string): string {
  const want = signOff.trim().toLowerCase().replace(/[,.!]+$/, '');
  if (!want) return text.trim();
  const lines = text.trim().split('\n');
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 4); i--) {
    if (lines[i].trim().toLowerCase().replace(/[,.!]+$/, '') === want) return lines.slice(0, i + 1).join('\n').trim();
  }
  return text.trim();
}
