/** WhatsApp helpers safe for server and client code (no secrets, no I/O). */

/** Meta lets you send free-form messages for 24h after the customer's last message. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Smart replies stay quiet on a chat for this long after someone replies by hand. */
export const HUMAN_TAKEOVER_MS = 2 * 60 * 60 * 1000;

/**
 * A phone number as WhatsApp ids it: country code + number, digits only.
 * UK numbers written the local way (07700 900123) become 447700900123.
 */
export function toWaId(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.trim().replace(/^\+/, '00').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = `44${d.slice(1)}`;
  if (d.startsWith('440')) d = `44${d.slice(3)}`; // +44 (0)7700…
  return d.length >= 10 && d.length <= 15 ? d : null;
}

export function windowOpen(lastInboundAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastInboundAt) return false;
  const t = new Date(lastInboundAt).getTime();
  return Number.isFinite(t) && now - t < SERVICE_WINDOW_MS;
}

/** Time left in the 24h window, e.g. "19h left" / "35m left", or null when closed. */
export function windowLeft(lastInboundAt: string | null | undefined, now = Date.now()): string | null {
  if (!windowOpen(lastInboundAt, now)) return null;
  const ms = new Date(lastInboundAt!).getTime() + SERVICE_WINDOW_MS - now;
  const h = Math.floor(ms / 3_600_000);
  return h >= 1 ? `${h}h left` : `${Math.max(1, Math.round(ms / 60_000))}m left`;
}

export type SmartRule = {
  id: string;
  name: string;
  keywords: string[];
  reply: string;
  enabled: boolean;
  delay_min_seconds: number;
  delay_max_seconds: number;
  priority: number;
};

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9£%]+/g, ' ').trim();
}

/** Whole-word match that also accepts a plural: "heat pump" matches "heat pumps". */
function hasKeyword(text: string, keyword: string) {
  const esc = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^| )${esc}(?:s|es)?(?= |$)`).test(text);
}

/**
 * The enabled rule whose keyword appears in the message (whole words, so "led" doesn't
 * match "called"). Highest priority wins, then the longest keyword (most specific).
 */
export function matchRule<R extends SmartRule>(text: string, rules: R[]): R | null {
  const t = norm(text);
  let best: { rule: R; len: number } | null = null;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    for (const k of rule.keywords) {
      const kw = norm(k);
      if (kw && hasKeyword(t, kw)) {
        const len = kw.length;
        if (!best || rule.priority > best.rule.priority || (rule.priority === best.rule.priority && len > best.len)) {
          best = { rule, len };
        }
      }
    }
  }
  return best?.rule ?? null;
}

/** A random wait between the rule's min and max, so replies don't land on a fixed beat. */
export function pickDelaySeconds(min: number, max: number, rand = Math.random): number {
  const lo = Math.max(0, Math.min(min, max));
  const hi = Math.max(min, max);
  return Math.round(lo + (hi - lo) * rand());
}

/** Fill {name} / {first_name} in a smart reply. */
export function fillReply(reply: string, name: string | null | undefined): string {
  const full = (name || '').trim();
  const first = full.split(/\s+/)[0] || '';
  return reply.replace(/\{first_name\}/g, first || 'there').replace(/\{name\}/g, full || 'there');
}
