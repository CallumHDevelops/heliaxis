import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';
import { DEFAULT_ABOUT, DEFAULT_SURVEY, DEFAULT_TERMS, MCS_EXPLAINED } from '@/lib/quotes/types';
import { cleanContent, type Block } from './types';

/**
 * Ready-made sections for tenders: Heliaxis's own wording that is already used on quotes (About, the accreditations and what MCS means,
 * the survey and structural requirements, the standard terms), the company details, and a tender outline whose prompts say what to write
 * without claiming anything. Nothing here is invented: wording comes from the quote's own standard text and the company record.
 * A picture path starting "assets/" is a file in the site's public assets (not in storage).
 */

export type LibraryEntry = { key: string; name: string; note: string; blocks: Block[] };

const b = (x: Record<string, unknown>) => ({ id: String(x.type) + Math.random().toString(36).slice(2, 6), ...x }) as unknown as Block;

const C = HELIAXIS_COMPANY;

export function standardSections(): LibraryEntry[] {
  const entries: { key: string; name: string; note: string; blocks: Record<string, unknown>[] }[] = [
    {
      key: 'about',
      name: 'About Heliaxis',
      note: 'The company story, with Callum’s photograph',
      blocks: [
        { type: 'section', text: 'About Heliaxis' },
        { type: 'image', side: 'right', path: 'assets/heliaxis-about-callum.jpg', caption: 'Callum Hiscott, Managing Director, Heliaxis', body: DEFAULT_ABOUT },
      ],
    },
    {
      key: 'accreditations',
      name: 'Accreditations and MCS',
      note: 'The accreditation logos and what MCS certification means',
      blocks: [
        { type: 'section', text: 'Accredited and certified' },
        { type: 'image', side: 'full', path: 'assets/heliaxis-accreditations.png', caption: '', body: MCS_EXPLAINED },
      ],
    },
    {
      key: 'company',
      name: 'Company details',
      note: 'Registered address, contact and numbers',
      blocks: [
        { type: 'section', text: 'Company details' },
        {
          type: 'table',
          caption: '',
          headers: ['Detail', 'Heliaxis'],
          rows: [
            ['Company', `${C.legalName}`],
            ['Registered address', C.addressLines.join(', ')],
            ['Telephone', C.phone],
            ['Email', C.email],
            ['MCS certification number', C.mcsNumber],
            ['Company number', C.companyNumber],
            ['VAT number', C.vatNumber],
          ],
        },
      ],
    },
    {
      key: 'survey',
      name: 'Survey and structural requirements',
      note: 'What we check at survey, as on every quote',
      blocks: [
        { type: 'section', text: 'Structural requirements and survey' },
        { type: 'text', body: DEFAULT_SURVEY },
      ],
    },
    {
      key: 'terms',
      name: 'Terms and conditions',
      note: 'The standard terms from the quote',
      blocks: [
        { type: 'section', text: 'Terms and conditions' },
        { type: 'text', body: DEFAULT_TERMS },
      ],
    },
    {
      key: 'outline',
      name: 'Tender outline',
      note: 'Headings with a prompt under each: write your own answers',
      blocks: [
        { type: 'section', text: 'Introduction' },
        { type: 'text', body: 'Say who we are and why we are responding. (Replace this with your own words.)' },
        { type: 'section', text: 'Our understanding of the requirement' },
        { type: 'text', body: 'Summarise what the client has asked for, in your own words, so they can see it has been understood.' },
        { type: 'section', text: 'Our proposed solution' },
        { type: 'text', body: 'Describe the system or works proposed, and why it suits the site.' },
        { type: 'section', text: 'Programme' },
        { type: 'table', caption: '', headers: ['Stage', 'Timing'], rows: [['Survey', ''], ['Design', ''], ['Installation', ''], ['Commissioning and handover', '']] },
        { type: 'section', text: 'Price' },
        { type: 'text', body: 'Add a quote table here (Quote table, then choose the quote), and say what the price includes.' },
        { type: 'section', text: 'Health and safety' },
        { type: 'text', body: 'Describe how the work will be carried out safely.' },
        { type: 'section', text: 'Why Heliaxis' },
        { type: 'text', body: 'Say why the client should choose us. Only include what you can evidence.' },
      ],
    },
  ];
  return entries.map((e) => ({ key: e.key, name: e.name, note: e.note, blocks: cleanContent({ blocks: e.blocks.map(b) }).blocks }));
}
