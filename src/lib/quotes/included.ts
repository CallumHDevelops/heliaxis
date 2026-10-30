import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { QuoteContent } from './types';

/**
 * "What is included", written from the quote's own items: short, plain, professional paragraphs. Only what is in the lines is
 * described (no prices, costs, warranties, certificates or dates that are not there). Without a model key, or if it fails,
 * the same paragraphs are made from the line descriptions by rule, so the button always gives a first draft to edit.
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

/** The same thing by rule: one sentence per priced item, in the quote's order, and a closing line. */
export function includedByRule(content: QuoteContent): string {
  const items = itemsOf(content).filter((i) => !i.note);
  if (!items.length) return '';
  const paras = items.map((i) => {
    const what = i.qty > 1 ? `${i.qty} × ${i.description}` : i.description;
    const extra = i.detail ? ` ${i.detail.replace(/[.\s]*$/, '')}.` : '';
    return `Supply and installation of ${what}.${extra}`;
  });
  paras.push('All the equipment, materials and labour for the items above are included in the price.');
  return paras.join('\n\n');
}

const SYSTEM = `You write the "What is included" section of a quote for Heliaxis, a solar, battery and heat pump installer in South Wales.
Write for the customer: plain British English, calm, specific and professional. No hype, no exclamation marks, no emoji, no headings, no bullet symbols.
Group the items by what they are (for example the solar system, the battery, the heat pump, the electrical and installation work) and write one short paragraph for each group, starting with a few words naming it followed by a colon.
Describe only what is in the list you are given: the quantities, makes and details as stated. Never add prices, costs, discounts, warranty lengths, certifications, schemes, timescales or products that are not in the list.
Keep the whole thing under 140 words. Reply with the text only, paragraphs separated by a blank line.`;

export async function writeIncluded(content: QuoteContent): Promise<{ text: string; via: 'ai' | 'rules' }> {
  const items = itemsOf(content);
  if (!items.length) return { text: '', via: 'rules' };
  const fallback = { text: includedByRule(content), via: 'rules' as const };
  if (!process.env.ANTHROPIC_API_KEY) return fallback;
  const list = items.map((i) => (i.note ? `Note: ${i.description}` : `${i.qty} × ${i.description}${i.detail ? ` (${i.detail})` : ''}${i.heading ? ` [section: ${i.heading}]` : ''}`)).join('\n');
  try {
    const res = await new Anthropic().messages.create({ model: MODEL, max_tokens: 500, system: SYSTEM, messages: [{ role: 'user', content: `The quote's items:\n${list}` }] });
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('').trim();
    return text ? { text, via: 'ai' } : fallback;
  } catch {
    return fallback;
  }
}
