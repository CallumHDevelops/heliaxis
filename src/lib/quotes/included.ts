import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { QuoteContent } from './types';

/**
 * "What is included", written from the quote's own items in formal contract wording ("This quote includes the supply and installation
 * of ..."). The equipment paragraphs come from the items; the standard inclusions (electrical ancillaries, access equipment, handover
 * documentation, BS 7671) are fixed wording that is added when ticked. Only what is in the lines, or what was typed as key points, is
 * claimed: no prices, warranties or standards are invented. Without a model key, or if it fails, the same paragraphs are made by rule.
 */
const MODEL = process.env.QUOTE_WRITER_MODEL || 'claude-haiku-5-5';

type Item = { heading: string; description: string; detail: string; qty: number; note: boolean };

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

/** The equipment paragraphs by rule: one formal sentence per priced item, in the quote's order. */
export function equipmentByRule(content: QuoteContent, keyPoints = ''): string[] {
  const items = itemsOf(content).filter((i) => !i.note);
  const paras = items.map((i) => {
    const what = i.qty > 1 ? `${i.qty} × ${i.description}` : i.description;
    return `This quote includes the supply and installation of ${what}${i.detail ? `: ${plain(i.detail)}` : ''}.`;
  });
  const kp = keyPoints.trim();
  if (kp) paras.push(`Key points: ${plain(kp.replace(/\s+/g, ' '))}.`);
  return paras;
}

export function includedByRule(content: QuoteContent, o: IncludedOptions = DEFAULT_OPTIONS): string {
  const eq = equipmentByRule(content, o.keyPoints);
  if (!eq.length) return '';
  return [...eq, ...standardClauses(o)].join('\n\n');
}

const SYSTEM = `You write the "What is included" section of a formal quotation for Heliaxis, a solar, battery and heat pump installer in South Wales.
Use formal, precise British English in the third person, as in a contract schedule. No hype, no exclamation marks, no emoji, no headings, no bullet symbols.
Write short paragraphs, each beginning "This quote includes". Describe the system in the order it is built, joining the items up: for example "This quote includes the supply and installation of a 30 kWp solar PV array of 60 × Trina Vertex S 500W panels, connected to a GoodWe GW6K-ET-20 hybrid inverter." then the battery with its capacity in kWh, then any other equipment. Use the quantities, makes and model names exactly as listed and work out totals (such as the array size in kWp, or the battery capacity) only when the arithmetic is certain from the list.
Where the person has given key points, or an item's own detail contains them, put them in a short clause on the relevant item (for example the battery or the inverter). Never add a feature, warranty length, certification, scheme, timescale, price or product that is not in the list or the key points. If there are no key points, add none.
Do NOT write about electrical ancillaries, access equipment, documentation, compliance, BS 7671 or standards: those are added separately.
Keep the whole thing under 170 words. Reply with the paragraphs only, separated by a blank line.`;

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
      max_tokens: 600,
      system: SYSTEM,
      messages: [{ role: 'user', content: `The quote's items:\n${list}${kp ? `\n\nKey points to include (from the person writing the quote):\n${kp}` : ''}` }],
    });
    const eq = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('').trim();
    return eq ? { text: [eq, ...standardClauses(o)].join('\n\n'), via: 'ai' } : fallback;
  } catch {
    return fallback;
  }
}
