import { cleanContent, type Block, type WriteupContent } from './types';

/**
 * Ready-made documents for Sales › Documents › New document › From template: a title, the words under it
 * and the blocks, ready to fill in. Heliaxis's standard ones are here; the ones people save from a document
 * are in crm_writeup_templates (supabase/document-templates.sql). Using one makes a copy, so the template
 * itself never changes. Pure.
 */
export type TemplateEntry = { key: string; name: string; category: string; note: string; title: string; subtitle: string; blocks: Record<string, unknown>[] };

const rows = (labels: string[]) => labels.map((l) => [l, '']);
const section = (text: string) => ({ type: 'section', text });
const table = (headers: string[], r: string[][], caption = '') => ({ type: 'table', caption, headers, rows: r });

const ENTRIES: TemplateEntry[] = [
  {
    key: 'installer-claim-of-compliance',
    name: 'Installers Claim of Compliance',
    category: 'Certificates and declarations',
    note: 'Installer and property address, the measures installed and the PAS 2035 / PAS 2030 declaration, with signature lines',
    title: 'Installers Claim of Compliance',
    subtitle: '',
    blocks: [
      section('Installer address'),
      table(['Item', 'Detail'], rows(['Company name', 'Office/Unit Number/Name', 'Street', 'Town', 'County', 'Postcode', 'TrustMark Licence Number'])),
      section('Property address'),
      table(['Item', 'Detail'], rows(['House/Flat Number/Name', 'Street', 'Town', 'County', 'Postcode'])),
      section('Measure(s) installed'),
      table(['Measure', 'Description'], rows([1, 2, 3, 4, 5, 6, 7].map((n) => `Measure ${n}`))),
      section('Declaration'),
      { type: 'text', body: 'The installation of the above measures at the disclosed address are handed over based on a Retrofit design claimed to comply with PAS2035:2023, using a process complying with PAS 2030:2023.' },
      { type: 'signature', lines: ['Signature', 'Date', 'Name'] },
    ],
  },
];

/** The standard templates, each with fresh block ids. */
export function standardTemplates(): (Omit<TemplateEntry, 'blocks'> & { blocks: Block[] })[] {
  return ENTRIES.map((e) => ({ ...e, blocks: cleanContent({ blocks: e.blocks.map((b) => ({ ...b, id: Math.random().toString(36).slice(2, 10) })) }).blocks }));
}

/** The content a new document starts with, from a standard template (null if the key is unknown). */
export function contentFromStandard(key: string): { title: string; content: WriteupContent } | null {
  const e = standardTemplates().find((t) => t.key === key);
  return e ? { title: e.title, content: { blocks: e.blocks, subtitle: e.subtitle } } : null;
}
