import { z } from 'zod';
import { lightRewordOk } from './similarity';
import type { Platform } from './types';

/**
 * Turns an approved script plus the AI's *choices* into a reply (docs/social-monitoring/04-reply-engine.md §1-§5).
 * The model never writes reply text: it picks variants and enum slot values, and this code renders them.
 */

export type BookingType = 'survey' | 'call' | 'quote';

export type ScriptSegment = {
  id: string;
  rewording?: 'none' | 'light';
  variants?: string[];
  variants_no_name?: string[];
  kind?: 'fact_claims';
  max_claims?: number;
  not_covered_text?: string;
  newline_before?: boolean;
};

export type Script = {
  id: string;
  name: string;
  priority: number;
  safety?: boolean;
  requires_approval?: boolean;
  topics: string[];
  severities: string[];
  platforms: string[];
  booking_types?: BookingType[];
  default_booking_type?: BookingType;
  allowed_claims?: string[];
  banned_phrases?: string[];
  slots?: Record<string, { enum: string[] }>;
  segments: ScriptSegment[];
  examples: string[];
};

export const DraftChoiceSchema = z.object({
  script_id: z.string(),
  segments: z.array(
    z.object({
      segment_id: z.string(),
      variant_index: z.number().int().min(0),
      reworded_text: z.string().max(400).nullable(),
    })
  ),
  slots: z.record(z.string(), z.string()),
  booking_type: z.enum(['survey', 'call', 'quote']),
  reviewer_note: z.string().max(300),
});
export type DraftChoice = z.infer<typeof DraftChoiceSchema>;

export type RenderContext = {
  platform: Platform;
  firstName: string | null;
  signoff: string;
  officePhone: string;
  bookingUrls: Record<BookingType, string>;
  /** A locked Fact Sheet exists. Without one, safety replies make no factual claims at all. */
  factSheetActive: boolean;
  /** Approved claims this draft may use, wording verbatim. */
  claims: { id: string; wording: string }[];
  /** Capitalised words that stay capitalised after a comma (names of places and products). */
  properNouns?: string[];
  /** Fills {{product}}. */
  product?: string;
};

export type RenderedPart = { segmentId: string; text: string; fixed: boolean };
export type RenderedDraft = {
  text: string;
  parts: RenderedPart[];
  bookingSentence: string;
  bookingType: BookingType;
  claimIds: string[];
};

export class RenderError extends Error {}

const ACTION: Record<BookingType, string> = {
  survey: 'book a free survey',
  call: 'book a call with our team',
  quote: 'book a quote consultation',
};

function withUtm(url: string, source: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}utm_source=${source}&utm_medium=social-reply`;
}

/** The booking sentence per platform (04 §4). Instagram links aren't clickable, so it points at the bio. */
export function renderBooking(platform: Platform, type: BookingType, ctx: Pick<RenderContext, 'bookingUrls' | 'officePhone'>): string {
  const action = ACTION[type];
  if (platform === 'instagram') return `You can ${action} through the link in our bio, or send us a DM and we'll get back to you.`;
  if (platform === 'trustpilot' || platform === 'google') return `You can ${action} at heliaxis.co.uk/book or call us on ${ctx.officePhone}.`;
  return `You can ${action} here: ${withUtm(ctx.bookingUrls[type], platform === 'manual' ? 'manual' : 'facebook')}`;
}

/** Matches a booking sentence the system itself writes (and nothing else), so it can be exempted from claim checks. */
export const BOOKING_SENTENCE =
  /You can (?:book a free survey|book a call with our team|book a quote consultation) (?:here: https:\/\/heliaxis\.co\.uk\/[A-Za-z0-9\-_/?=&%.#]*|through the link in our bio, or send us a DM and we'll get back to you\.|at heliaxis\.co\.uk\/book or call us on [0-9 ]+\.)/g;

const NOT_A_NAME = ['mr', 'mrs', 'ms', 'miss', 'dr', 'the', 'admin', 'team', 'official', 'ltd', 'limited', 'solar', 'energy', 'home', 'homes', 'services', 'group', 'uk', 'wales', 'page', 'shop', 'store', 'user'];

/** "Sarah Jones" → "Sarah". Anything that isn't clearly a first name gives null, and the no-name greeting is used. */
export function deriveFirstName(displayName: string | null | undefined, notAName: string[] = NOT_A_NAME): string | null {
  if (!displayName) return null;
  const first = displayName.trim().split(/\s+/)[0] ?? '';
  // Keep mixed case as typed ("O'Neil", "McDonald"); title-case names typed all lower or all upper.
  const titled = first === first.toLowerCase() || first === first.toUpperCase() ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : first;
  if (!/^[A-Z][A-Za-z'’-]{1,20}$/.test(titled)) return null;
  if (notAName.includes(titled.toLowerCase())) return null;
  return titled;
}

const SLOT = /\{\{\s*([a-z_]+)\s*\}\}/g;

function fill(text: string, vars: Record<string, string | null | undefined>): string {
  return text.replace(SLOT, (_m, name: string) => {
    const v = vars[name];
    if (v === null || v === undefined) throw new RenderError(`Unknown or empty slot {{${name}}}`);
    return v;
  });
}

function segmentList(seg: ScriptSegment, ctx: RenderContext): string[] {
  const named = seg.variants ?? [];
  if (!ctx.firstName && seg.variants_no_name) return seg.variants_no_name;
  return named;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Everything wrong with a choice, as text. Empty means valid. */
export function validateChoice(script: Script, choice: DraftChoice, ctx: RenderContext): string[] {
  const errors: string[] = [];
  if (choice.script_id !== script.id) errors.push(`script_id ${choice.script_id} is not ${script.id}`);
  if (choice.segments.length !== script.segments.length) errors.push('segments do not match the script');
  script.segments.forEach((seg, i) => {
    const c = choice.segments[i];
    if (!c || c.segment_id !== seg.id) {
      errors.push(`segment ${i} should be ${seg.id}`);
      return;
    }
    if (seg.kind === 'fact_claims') return;
    const list = segmentList(seg, ctx);
    if (c.variant_index >= list.length) errors.push(`${seg.id}: variant ${c.variant_index} out of range`);
    if (c.reworded_text !== null && seg.rewording !== 'light') errors.push(`${seg.id}: rewording is not allowed here`);
  });
  for (const [name, def] of Object.entries(script.slots ?? {})) {
    const v = choice.slots[name];
    if (v !== undefined && !def.enum.includes(v)) errors.push(`slot ${name}: "${v}" is not an allowed value`);
  }
  for (const name of Object.keys(choice.slots)) if (!script.slots?.[name]) errors.push(`slot ${name} is not declared by the script`);
  const types = script.booking_types ?? ['survey', 'call', 'quote'];
  if (types.length && !types.includes(choice.booking_type)) errors.push(`booking type ${choice.booking_type} is not allowed here`);
  return errors;
}

function factsText(seg: ScriptSegment, script: Script, ctx: RenderContext): { text: string; ids: string[] } {
  const allowed = new Set(script.allowed_claims ?? []);
  const usable = ctx.claims.filter((c) => allowed.has(c.id)).slice(0, seg.max_claims ?? 2);
  if (usable.length) return { text: usable.map((c) => c.wording).join(' '), ids: usable.map((c) => c.id) };
  // A Fact Sheet exists but doesn't cover this: say so rather than guess. With no Fact Sheet at all, say nothing.
  if (ctx.factSheetActive && seg.not_covered_text) return { text: seg.not_covered_text, ids: [] };
  return { text: '', ids: [] };
}

export function renderDraft(script: Script, choice: DraftChoice, ctx: RenderContext): RenderedDraft {
  const errors = validateChoice(script, choice, ctx);
  if (errors.length) throw new RenderError(errors.join('; '));

  const bookingSentence = renderBooking(ctx.platform, choice.booking_type, ctx);
  const vars: Record<string, string | null> = {
    first_name: ctx.firstName,
    signoff: ctx.signoff,
    booking: bookingSentence,
    office_phone: ctx.officePhone,
    product: ctx.product ?? 'system',
    ...choice.slots,
  };
  const proper = new Set((ctx.properNouns ?? []).map((w) => w.toLowerCase()));

  const parts: RenderedPart[] = [];
  const claimIds: string[] = [];
  let text = '';
  let lastEndedWithComma = false;

  script.segments.forEach((seg, i) => {
    const c = choice.segments[i];
    let piece: string;
    let fixed = true;
    if (seg.kind === 'fact_claims') {
      const f = factsText(seg, script, ctx);
      if (!f.text) return;
      piece = f.text;
      claimIds.push(...f.ids);
    } else {
      const raw = segmentList(seg, ctx)[c.variant_index];
      let chosen = fill(raw, vars);
      if (c.reworded_text !== null && seg.rewording === 'light') {
        const reworded = fill(c.reworded_text, vars);
        if (lightRewordOk(chosen, reworded, [...(ctx.properNouns ?? []), ctx.firstName ?? ''])) {
          chosen = reworded;
          fixed = false;
        }
      }
      piece = chosen;
    }
    if (!text) {
      text = piece;
    } else if (seg.newline_before) {
      text += `\n${piece}`;
    } else {
      const first = piece.split(/\s+/)[0]?.replace(/[^\p{L}']/gu, '').toLowerCase() ?? '';
      const keepCase = /^I($|[ '’])/.test(piece) || proper.has(first);
      if (lastEndedWithComma && !keepCase) piece = lowerFirst(piece);
      text += ` ${piece}`;
    }
    parts.push({ segmentId: seg.id, text: piece, fixed });
    lastEndedWithComma = piece.endsWith(',');
  });

  return { text, parts, bookingSentence, bookingType: choice.booking_type, claimIds };
}

/**
 * Every piece of text the system itself could have written for this script (all variants, all enum slot
 * values, the no-name greetings, both letter cases, every booking sentence). Used to tell reviewer edits
 * from system text when a draft is re-checked.
 */
export function allFixedTexts(script: Script, ctx: Omit<RenderContext, 'platform'>): string[] {
  const out = new Set<string>();
  const slotCombos = (text: string): string[] => {
    const names = [...text.matchAll(SLOT)].map((m) => m[1]);
    const enumNames = names.filter((n) => script.slots?.[n]);
    let combos = [text];
    for (const n of new Set(enumNames)) {
      combos = combos.flatMap((t) => script.slots![n].enum.map((v) => t.replaceAll(`{{${n}}}`, v)));
    }
    return combos;
  };
  const base: Record<string, string | null> = {
    first_name: ctx.firstName,
    signoff: ctx.signoff,
    office_phone: ctx.officePhone,
    product: ctx.product ?? 'system',
  };
  const types = script.booking_types ?? ['survey', 'call', 'quote'];
  const platforms: Platform[] = ['facebook', 'instagram', 'trustpilot', 'google', 'manual'];
  const bookings = platforms.flatMap((p) => types.map((t) => renderBooking(p, t, ctx)));
  for (const seg of script.segments) {
    if (seg.kind === 'fact_claims') {
      if (seg.not_covered_text) out.add(seg.not_covered_text);
      continue;
    }
    for (const v of [...(seg.variants ?? []), ...(seg.variants_no_name ?? [])]) {
      for (const t of slotCombos(v)) {
        if (/\{\{\s*first_name\s*\}\}/.test(t) && !ctx.firstName) continue;
        let filled: string[];
        if (/\{\{\s*booking\s*\}\}/.test(t)) filled = bookings;
        else {
          try {
            filled = [fill(t, base)];
          } catch {
            continue;
          }
        }
        for (const f of filled) {
          out.add(f);
          out.add(lowerFirst(f));
        }
      }
    }
  }
  for (const c of ctx.claims) out.add(c.wording);
  return [...out].filter((s) => s.trim().length > 0);
}
