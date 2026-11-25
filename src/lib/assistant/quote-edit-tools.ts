import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { logActivity } from '@/lib/crm/server';
import { docFileName } from '@/lib/documents/pdf-kit';
import { saveGenerated } from '@/lib/documents/store';
import { priceJob } from '@/lib/pricing/price';
import { loadBook, loadSettings } from '@/lib/pvdesign/server';
import { applyEdits, diffQuote, parseEditInput, type EditOp, type ProductAdd } from '@/lib/quotes/edit';
import { designBlockBody, quoteTitle, refreshDesignBlock } from '@/lib/quotes/from-design';
import { customerRefOf, readQuote, renderQuote, type QuoteRow } from '@/lib/quotes/server';
import { profitOf, totalsOf, type QuoteContent } from '@/lib/quotes/types';
import { listVersions, saveVersion, type QuoteMeta, type QuoteVersion } from '@/lib/quotes/versions';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkFor, resolveProducts } from './quote-tools';
import { gbp, s } from './design-tools';
import type { AssistantAction } from './tools';

/**
 * Metis changes a DRAFT quote by conversation. Every change is a new version: the old one is kept and can be restored.
 * A change that removes, replaces or lowers something already there is shown first, exactly, and only saved once the
 * user has said yes. A quote that has been sent or accepted is never edited: it is what the customer saw or signed.
 */

const str = { type: 'string' } as const;
const nullable = (description: string, type: 'string' | 'number' = 'string') => ({ type: [type, 'null'], description }) as const;
const obj = (properties: Record<string, unknown>) => ({ type: 'object' as const, properties, required: Object.keys(properties), additionalProperties: false });

export const QUOTE_EDIT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_quote',
    description: 'A quote’s lines (with their ids and SKUs), totals, status and current version number. Use it before editing, to see what to change.',
    input_schema: obj({ quote_number: { type: 'string', description: 'e.g. Q-1042' } }),
  },
  {
    name: 'edit_quote',
    description:
      'Change a DRAFT quote and save the change as a new version, showing exactly what changed. Operations: set_qty (line, qty), add_product (sku, qty: a price-book item, priced from the book), add_line (description, qty, unit_price_gbp, cost_gbp, vat_percent: an item the user priced), remove_line (line), set_unit_price (line, unit_price_gbp), set_labour_days (days), set_discount_percent (percent; 0 removes it). Changes that remove, replace or lower something are previewed first and saved only when you call again with confirmed true after the user says yes. Never edits a sent or accepted quote.',
    input_schema: obj({
      quote_number: str,
      edits: {
        type: 'array',
        items: obj({
          op: { type: 'string', enum: ['set_qty', 'add_product', 'add_line', 'remove_line', 'set_unit_price', 'set_labour_days', 'set_discount_percent'] },
          line: nullable('A line id, SKU or words from its description.'),
          qty: nullable('Quantity.', 'number'),
          sku: nullable('A price-book SKU.'),
          description: nullable('Description of a new line.'),
          unit_price_gbp: nullable('Price each in pounds, ex VAT, as the user gave it.', 'number'),
          cost_gbp: nullable('Cost each in pounds, or null.', 'number'),
          vat_percent: nullable('VAT per cent for a new line.', 'number'),
          days: nullable('Install days.', 'number'),
          percent: nullable('Discount per cent.', 'number'),
        }),
      },
      note: nullable('A short summary of why, in the user’s words, or null.'),
      confirmed: { type: 'boolean', description: 'true only after the user has seen the exact change and said yes.' },
    }),
  },
  {
    name: 'list_quote_versions',
    description: 'The saved versions of a quote, newest first, with what changed and the total each time.',
    input_schema: obj({ quote_number: str }),
  },
  {
    name: 'restore_quote_version',
    description: 'Make an earlier version of a draft quote the current one again, as a new version (nothing is lost). Preview first; save only with confirmed true after the user says yes.',
    input_schema: obj({ quote_number: str, version: { type: 'integer' }, confirmed: { type: 'boolean' } }),
  },
];

export const QUOTE_EDIT_NAMES = new Set(QUOTE_EDIT_TOOLS.map((t) => t.name));

async function quoteByNumber(number: string): Promise<QuoteRow | string> {
  const n = number.trim().toUpperCase();
  if (!/^Q-\d{3,6}$/.test(n)) return 'Give the quote number, like Q-1042.';
  const { data } = await createAdminClient().from('crm_quotes').select('id').eq('number', n).maybeSingle();
  const q = data ? await readQuote(data.id as string) : null;
  return q ?? `There is no quote ${n}.`;
}

const draftOnly = (q: QuoteRow) => (q.status === 'draft' ? null : `${q.number} is ${q.status}: it has been sent to the customer, so I do not edit it (it is what they saw or signed). Make a new quote instead.`);

/** The version to build on: the latest, after saving the quote as it stands as version 1 if it has none yet. */
async function currentVersion(db: ReturnType<typeof createAdminClient>, q: QuoteRow, by: string): Promise<{ versions: QuoteVersion[] } | { error: string }> {
  const l = await listVersions(db, q.id);
  if ('error' in l) return l;
  if (l.versions.length) return l;
  const v1 = await saveVersion(db, q.id, { title: q.title, content: q.content, validUntil: q.valid_until, meta: {}, summary: 'The quote as it was before Metis changed it', changes: [], by });
  if ('error' in v1) return v1;
  return listVersions(db, q.id);
}

function marginWarning(content: QuoteContent, min: number | null): string | null {
  const m = profitOf(content).marginPct;
  return m != null && min != null && m < min ? `The margin is now ${Math.round(m * 10) / 10}%, below the minimum of ${min}%.` : null;
}

export async function runQuoteEditTool(name: string, input: Record<string, unknown>, me: { id: string; name: string }, actions: AssistantAction[]): Promise<string> {
  const db = createAdminClient();
  const q = await quoteByNumber(s(input.quote_number));
  if (typeof q === 'string') return q;

  switch (name) {
    case 'get_quote': {
      const v = await listVersions(db, q.id);
      const t = totalsOf(q.content);
      return JSON.stringify({
        quote_number: q.number,
        status: q.status,
        title: q.title,
        version: 'versions' in v ? v.versions[0]?.version ?? 1 : null,
        total_inc_vat: gbp(t.gross),
        lines: q.content.blocks.flatMap((b) => (b.type === 'items' ? b.lines : [])).map((l) => ({ id: l.id, description: l.description, sku: l.detail ?? null, qty: l.qty, unit_price: gbp(l.unit_pence), vat_percent: l.vat_rate })),
        design: 'versions' in v ? v.versions[0]?.meta ?? null : null,
        editable: q.status === 'draft',
      });
    }

    case 'list_quote_versions': {
      const l = await listVersions(db, q.id);
      if ('error' in l) return l.error;
      return JSON.stringify(l.versions.map((v) => ({ version: v.version, saved: v.createdAt, total_inc_vat: gbp(v.totalGrossPence), summary: v.summary, changes: v.changes })));
    }

    case 'edit_quote':
    case 'restore_quote_version': {
      const blocked = draftOnly(q);
      if (blocked) return blocked;
      const cur = await currentVersion(db, q, me.id);
      if ('error' in cur) return cur.error;
      const latest = cur.versions[0];
      const { design: ds, pricing } = await loadSettings();
      let meta: Partial<QuoteMeta> = { ...latest.meta };
      let next: QuoteContent;
      let overwrites: boolean;
      let summary: string;

      if (name === 'restore_quote_version') {
        const target = cur.versions.find((v) => v.version === Math.round(Number(input.version)));
        if (!target) return `Quote ${q.number} has no version ${input.version}. It has versions 1 to ${latest.version}.`;
        next = target.content;
        meta = { ...target.meta };
        overwrites = true;
        summary = `Restored version ${target.version}`;
      } else {
        const parsed = parseEditInput(input.edits);
        if (!parsed.ok) return parsed.error;
        // Price-book products are priced from the book and HAP's settings, never by guessing.
        const ops: EditOp[] = [];
        const adds = parsed.ops.filter((o): o is ProductAdd => o.op === 'add_product');
        const book = adds.length ? await loadBook(adds.map((a) => a.sku)) : { rows: new Map() };
        if ('error' in book) return book.error;
        for (const o of parsed.ops) {
          if (o.op !== 'add_product') {
            ops.push(o);
            continue;
          }
          const priced = priceJob({ items: [{ sku: o.sku, qty: o.qty }], installDays: 0, customerType: meta.customerType ?? 'domestic' }, book.rows, pricing);
          const l = priced.lines[0];
          if (!l) return `${o.sku} could not be added.`;
          ops.push({ op: 'add_line', description: l.description, qty: l.qty, unitPence: l.unit_pence, costPence: l.cost_pence, vatRate: l.vat_rate, sku: o.sku });
        }
        const r = applyEdits(q.content, ops);
        if (!r.ok) return `${r.error} Nothing was changed.`;
        next = r.content;
        overwrites = r.overwrites;
        summary = s(input.note) || 'Changed by conversation';
      }

      // If the panel count changed, run the design checks again so the quote's design wording stays true.
      let designNote: string | undefined;
      const panelLine = meta.panelSku ? next.blocks.flatMap((b) => (b.type === 'items' ? b.lines : [])).find((l) => l.detail === meta.panelSku && !l.id.startsWith('disc')) : null;
      if (meta.panelSku && meta.inverterSku && panelLine && panelLine.qty !== meta.panelCount) {
        const rp = await resolveProducts(meta.panelSku, meta.inverterSku, meta.batterySku ?? '');
        if (typeof rp === 'string') designNote = `The design wording was not refreshed: ${rp}`;
        else {
          const count = Math.round(panelLine.qty);
          const check = checkFor(rp, { battery_count: meta.batteryCount, system_type: meta.systemType, daily_load_kwh: meta.dailyLoadKwh, peak_load_kw: meta.peakLoadKw, generator_backup: meta.generatorBackup }, count, ds.minTempC);
          const wp = typeof rp.panel.specs.wp === 'number' ? (rp.panel.specs.wp as number) : null;
          const kwp = wp != null ? Math.round(wp * count) / 1000 : null;
          next = refreshDesignBlock(next, designBlockBody(count, kwp, check.issues));
          meta = { ...meta, panelCount: count, kwp };
          const worse = check.issues.filter((i) => i.severity !== 'info');
          if (worse.length) designNote = `With ${count} panels the design checks say: ${worse.map((i) => i.message).join(' ')}`;
        }
      }

      const diff = diffQuote(q.content, next);
      if (!diff.changed) return 'That would not change the quote, so nothing was saved.';
      const warnings = [marginWarning(next, pricing.minMarginPct), designNote, ...(next.blocks.flatMap((b) => (b.type === 'items' ? b.lines : [])).some((l) => /^PRICE REQUIRED/i.test(l.description)) ? ['A line is marked PRICE REQUIRED: it must be priced before the quote is sent.'] : [])].filter((x): x is string => !!x);

      if (overwrites && input.confirmed !== true) {
        actions.push({
          kind: 'confirm',
          label: `Confirm this change to ${q.number}?`,
          href: '',
          detail: [...diff.lines, ...warnings.map((w) => `Warning: ${w}`), 'The current version is kept and can be restored.'],
          buttons: [{ label: 'Confirm change', prompt: 'Yes, apply that change.' }, { label: 'Cancel', prompt: 'No, leave the quote as it is.' }],
        });
        return JSON.stringify({ saved: false, needs_confirmation: true, quote: q.number, changes: diff.lines, warnings, note: 'Nothing is saved yet. Show the user exactly these changes, and ask them to confirm. Only call again with confirmed true once they say yes.' });
      }

      // Save: the quote gets the new content, the PDF a new version, and the history a new version row. Nothing is overwritten.
      const title = meta.panelSku ? quoteTitle({ systemType: meta.systemType ?? 'grid-tied', kwp: meta.kwp ?? null }, q.title.split(':')[0] || q.title) : q.title;
      const saved = await saveVersion(db, q.id, { title, content: next, validUntil: q.valid_until, meta, summary, changes: diff.lines, by: me.id });
      if ('error' in saved) return saved.error;
      const { error } = await db.from('crm_quotes').update({ content: next, title, updated_at: new Date().toISOString() }).eq('id', q.id).eq('status', 'draft');
      if (error) return `The version was saved but the quote could not be updated: ${error.message}`;
      let docId: string | null = null;
      let pdfNote: string | undefined;
      try {
        const fresh = await readQuote(q.id);
        if (fresh) {
          const ref = await customerRefOf(q.enquiry_id);
          const doc = await saveGenerated(db, q.project_id, { key: q.number, name: docFileName(ref, 'Quote', q.number), bytes: await renderQuote(fresh), inputs: { content: fresh.content, valid_until: fresh.valid_until, title: fresh.title, version: saved.version }, category: 'quote', visible: false, by: me.id });
          docId = doc.doc.id;
          await db.from('crm_quotes').update({ document_id: docId }).eq('id', q.id);
        }
      } catch (e) {
        pdfNote = `The quote was changed but its PDF could not be remade: ${e instanceof Error ? e.message : 'unknown error'}.`;
      }
      await logActivity({ enquiryId: q.enquiry_id, projectId: q.project_id, kind: 'system', body: `Quote ${q.number} changed by Metis (version ${saved.version}): ${diff.lines.slice(0, 3).join('; ')}`, byId: me.id });
      actions.push({
        kind: 'quote',
        label: `Quote ${q.number} v${saved.version} (draft): ${gbp(diff.totalAfter)} inc VAT`,
        href: `/admin/sales/quotes/${q.id}`,
        detail: [...diff.lines, ...warnings.map((w) => `Warning: ${w}`), 'Draft only: nothing has been sent.'],
        buttons: [{ label: 'Open quote', href: `/admin/sales/quotes/${q.id}` }, ...(docId ? [{ label: 'Open file', documentId: docId }] : []), { label: `Restore v${latest.version}`, prompt: `Restore version ${latest.version} of ${q.number}` }],
      });
      return JSON.stringify({ saved: true, quote: q.number, version: saved.version, previous_version: latest.version, changes: diff.lines, total_before: gbp(diff.totalBefore), total_after: gbp(diff.totalAfter), warnings, pdf_saved: !!docId, ...(pdfNote ? { pdf_note: pdfNote } : {}), note: 'It is still a draft and nothing has been sent. Tell the user what changed, the old and new totals, and any warning. The previous version is kept.' });
    }
  }
  return `Unknown tool ${name}`;
}
