import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { factsText } from './proposal';
import type { ProposalOption, QuoteContent } from './types';

/**
 * "What is included", written from the quote's own items in formal contract wording ("This quote includes the supply and installation
 * of ..."). The equipment paragraphs come from the items; the standard inclusions (electrical ancillaries, access equipment, handover
 * documentation, BS 7671) are fixed wording that is added when ticked. Only what is in the lines, or what was typed as key points, is
 * claimed: no prices, warranties or standards are invented. Without a model key, or if it fails, the same paragraphs are made by rule.
 */
const MODEL = process.env.QUOTE_WRITER_MODEL || 'claude-haiku-5-5';

type Item = { heading: string; description: string; detail: string; qty: number; note: boolean };

/** The chosen option of an uploaded design proposal, if there is one. */
export const proposalOf = (c: QuoteContent): { option: ProposalOption; facts: string } | null => {
  const p = c.proposal;
  const option = p?.options[p.chosen];
  return option ? { option, facts: factsText(option, false) } : null;
};

/** The customer-facing lines of the quote, with sections: never costs, markups or internal lines. */
export function itemsOf(content: QuoteContent): Item[] {
  const out: Item[] = [];
  for (const b of content.blocks) {
    if (b.type !== 'items') continue;
    for (const l of b.lines) {
      if (l.internal || !l.description.trim()) continue;
      out.push({ heading: b.heading.trim(), description: l.description.replace(/\s+/g, ' ').trim(), detail: (l.detail ?? '').replace(/\s+/g, ' ').trim(), qty: l.text ? 0 : l.qty, note: !!l.text });
    }
  }
  return out;
}

export type IncludedOptions = {
  ancillaries: boolean;
  access: boolean;
  handover: boolean;
  compliance: boolean;
  /** Selling points the writer may weave in (typed by the person, so they are theirs to stand behind). */
  keyPoints: string;
};
export const DEFAULT_OPTIONS: IncludedOptions = { ancillaries: true, access: true, handover: true, compliance: true, keyPoints: '' };

/** The standard inclusions, in fixed wording. */
export function standardClauses(o: IncludedOptions): string[] {
  const out: string[] = [];
  if (o.ancillaries && o.access) out.push('This quote includes the supply and installation of all electrical ancillaries, and provision for any access equipment required to complete the works.');
  else if (o.ancillaries) out.push('This quote includes the supply and installation of all electrical ancillaries.');
  else if (o.access) out.push('This quote includes provision for any access equipment required to complete the works.');
  if (o.handover) out.push('This quote includes all documentation required for handover.');
  if (o.compliance) out.push('All works comply with BS 7671 (the IET Wiring Regulations) and any other applicable standards.');
  return out;
}

const plain = (t: string) => t.replace(/[.\s]*$/, '');

const kindOf = (d: string): 'panels' | 'inverter' | 'battery' | 'other' => {
  if (/\binstall(ation)?\b|labour|labor|scaffold|commission|ancillar|access/i.test(d)) return 'other';
  if (/batter|\bBAT\b|-BAT-|kwh|storage|\bES\b|lynx|\bBMS\b/i.test(d)) return 'battery';
  if (/inverter|hybrid|\bGW\d|\bET-?\d|\bSUN2000|\bSolis\b/i.test(d)) return 'inverter';
  if (/panel|\bPV\b|solar|\d{3}\s?W\b|vertex|\bmodule/i.test(d)) return 'panels';
  return 'other';
};
const asList = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const withDetail = (i: Item) => {
  const what = i.qty > 1 ? `${i.qty} × ${i.description}` : i.description;
  return i.detail ? `${what} (${plain(i.detail)})` : what;
};

/** The equipment paragraphs by rule: the solar system with its inverter, the battery, then everything else, in formal wording. */
export function equipmentByRule(content: QuoteContent, keyPoints = ''): string[] {
  const items = itemsOf(content).filter((i) => !i.note);
  const by = { panels: [] as Item[], inverter: [] as Item[], battery: [] as Item[], other: [] as Item[] };
  for (const i of items) by[kindOf(i.description)].push(i);
  const paras: string[] = [];
  if (by.panels.length && by.inverter.length) paras.push(`This quote includes the supply and installation of a solar PV system comprising ${asList(by.panels.map(withDetail))}, connected to ${asList(by.inverter.map(withDetail))}.`);
  else if (by.panels.length) paras.push(`This quote includes the supply and installation of a solar PV system comprising ${asList(by.panels.map(withDetail))}.`);
  else if (by.inverter.length) paras.push(`This quote includes the supply and installation of ${asList(by.inverter.map(withDetail))}.`);
  if (by.battery.length) paras.push(`This quote includes the supply and installation of battery energy storage, comprising ${asList(by.battery.map(withDetail))}.`);
  // Work (installation, commissioning, scaffold...) reads as "includes the work"; goods as "supply and installation of".
  const isWork = (i: Item) => /^(install|commission|labour|labor|scaffold|handover|testing|electrical (work|install)|dno|design|survey|project)/i.test(i.description);
  const work = by.other.filter(isWork);
  const goods = by.other.filter((i) => !isWork(i));
  const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
  if (goods.length === 1) paras.push(`This quote includes the supply and installation of ${withDetail(goods[0])}.`);
  else if (goods.length > 1) paras.push(`This quote also includes the supply and installation of the following: ${asList(goods.map(withDetail))}.`);
  if (work.length) paras.push(`This quote includes ${asList(work.map((i) => lower(withDetail(i))))}.`);
  const pr = proposalOf(content)?.option;
  const w: string[] = [];
  if (pr?.panelProductWarrantyYears) w.push(`a ${pr.panelProductWarrantyYears}-year product warranty${pr.panelPerformanceWarrantyYears ? ` and a ${pr.panelPerformanceWarrantyYears}-year performance warranty` : ''} on the solar panels`);
  if (pr?.inverterWarrantyYears) w.push(`a ${pr.inverterWarrantyYears}-year warranty on the inverter`);
  if (pr?.batteryWarrantyYears) w.push(`a ${pr.batteryWarrantyYears}-year warranty on the battery`);
  if (w.length) paras.push(`The equipment is supplied with the manufacturer’s warranties: ${asList(w)}.`);
  const kp = keyPoints.trim();
  if (kp) paras.push(`Key features: ${plain(kp.replace(/\s+/g, ' '))}.`);
  return paras;
}

export function includedByRule(content: QuoteContent, o: IncludedOptions = DEFAULT_OPTIONS): string {
  const eq = equipmentByRule(content, o.keyPoints);
  if (!eq.length) return '';
  return [...eq, ...standardClauses(o)].join('\n\n');
}

const SYSTEM = `You write the "What is included" section of a formal quotation for Heliaxis, a solar, battery and heat pump installer in South Wales.
Use formal, precise British English in the third person, as in a contract schedule: fluent, well-constructed sentences, not a list of item names. No hype, no exclamation marks, no emoji, no headings, no bullet symbols.
Write short paragraphs, each beginning "This quote includes". Describe the system in the order it is built, joining the items up: for example "This quote includes the supply and installation of a 30 kWp solar PV array of 60 × Trina Vertex S 500W panels, connected to a GoodWe GW6K-ET-20 hybrid inverter." then the battery with its capacity in kWh, then any other equipment. Use the quantities, makes and model names exactly as listed and work out totals (such as the array size in kWp, or the battery capacity) only when the arithmetic is certain from the list.
Where the person has given key points, or an item's own detail contains them, put them in a short clause on the relevant item (for example the battery or the inverter). Never add a feature, warranty length, certification, scheme, timescale, price or product that is not in the list, the design-proposal facts or the key points. Warranty lengths in the design-proposal facts may be stated. If there are no key points, add none.
Do NOT write about electrical ancillaries, access equipment, documentation, compliance, BS 7671 or standards: those are added separately.
Keep the whole thing under 170 words. Reply with the paragraphs only, separated by a blank line.`;

/**
 * The model's text, but only if it finished: an answer cut off by the length limit (or that stops mid-sentence) is never used,
 * so a half-written paragraph can't reach a quote. Null sends the caller to the rule-made text.
 */
export function finished(res: { stop_reason: string | null; content: { type: string; text?: string }[] }): string | null {
  if (res.stop_reason === 'max_tokens' || res.stop_reason === 'refusal') return null;
  const t = res.content.flatMap((b) => (b.type === 'text' && b.text ? [b.text] : [])).join('').trim();
  return /[.!?”"’)]$|Heliaxis$/.test(t) ? t : null;
}

export async function writeIncluded(content: QuoteContent, o: IncludedOptions = DEFAULT_OPTIONS): Promise<{ text: string; via: 'ai' | 'rules' }> {
  const items = itemsOf(content);
  if (!items.length) return { text: '', via: 'rules' };
  const fallback = { text: includedByRule(content, o), via: 'rules' as const };
  if (!process.env.ANTHROPIC_API_KEY) return fallback;
  const list = items.map((i) => (i.note ? `Note: ${i.description}` : `${i.qty} × ${i.description}${i.detail ? ` (${i.detail})` : ''}${i.heading ? ` [section: ${i.heading}]` : ''}`)).join('\n');
  const kp = o.keyPoints.trim().slice(0, 600);
  try {
    const res = await new Anthropic().messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: 'user', content: `The quote's items:\n${list}${proposalOf(content) ? `\n\nFacts from the design proposal (use them to describe the equipment and its warranties accurately):\n${proposalOf(content)!.facts}` : ''}${kp ? `\n\nKey points to include (from the person writing the quote):\n${kp}` : ''}` }],
    });
    const eq = finished(res);
    return eq ? { text: [eq, ...standardClauses(o)].join('\n\n'), via: 'ai' } : fallback;
  } catch {
    return fallback;
  }
}

const INTRO_SYSTEM = `You write the introduction of a formal quotation for Heliaxis, a solar, battery and heat pump installer in South Wales.
Use formal, courteous British English. Open "Dear {first name}," if a name is given, then two short paragraphs: thank them for the opportunity to quote for the property and say what this quotation covers, naming the main equipment from the list (the solar PV system, the battery and its capacity, and so on); then say the items, prices and terms follow, and that Heliaxis would be glad to answer any questions. End with "Yours sincerely," then a blank line then "Heliaxis".
No hype, no exclamation marks, no emoji, no prices, no claims about savings, warranties or timescales. Use only the items and facts you are given. Keep it under 120 words. Do not list the items or their details (where something is fitted, cable runs, breakers): name only the main systems, such as the solar PV system, the battery storage and its capacity, and the associated electrical works. Reply with the text only.`;

/** The cover letter, by rule: used when the writing assistant is not switched on or fails. */
export function introByRule(content: QuoteContent, first: string, site: string): string {
  const eq = itemsOf(content).filter((i) => !i.note);
  const kinds = new Set(eq.map((i) => kindOf(i.description)));
  const parts = [kinds.has('panels') ? 'a solar PV system' : '', kinds.has('battery') ? 'battery energy storage' : '', kinds.has('other') || kinds.has('inverter') ? 'the associated electrical works' : ''].filter(Boolean);
  const what = parts.length ? asList(parts) : 'the works described in this quotation';
  return [
    `${first ? `Dear ${first},` : 'Dear customer,'}`,
    `Thank you for the opportunity to quote for the supply and installation of ${what}${site ? ` at ${site}` : ''}. This quotation sets out what is included, the items and their prices, and the terms on which the work would be carried out.`,
    'The items, prices and terms follow. If anything is unclear, or you would like to change any part of it, please contact us and we will be glad to help.',
    'Yours sincerely,\n\nHeliaxis',
  ].join('\n\n');
}

export async function writeIntro(content: QuoteContent, first: string, site: string): Promise<{ text: string; via: 'ai' | 'rules' }> {
  const items = itemsOf(content).filter((i) => !i.note);
  if (!items.length) return { text: '', via: 'rules' };
  const fallback = { text: introByRule(content, first, site), via: 'rules' as const };
  if (!process.env.ANTHROPIC_API_KEY) return fallback;
  const list = items.map((i) => `${i.qty} × ${i.description}${i.detail ? ` (${i.detail})` : ''}`).join('\n');
  try {
    const res = await new Anthropic().messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: INTRO_SYSTEM,
      messages: [{ role: 'user', content: `Customer first name: ${first || '(none)'}\nSite: ${site || '(not given)'}\nItems:\n${list}${proposalOf(content) ? `\n\nFacts from the design proposal:\n${proposalOf(content)!.facts}` : ''}` }],
    });
    const text = finished(res);
    return text ? { text, via: 'ai' } : fallback;
  } catch {
    return fallback;
  }
}
