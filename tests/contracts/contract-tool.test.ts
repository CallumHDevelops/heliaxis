import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderTemplate } from '@/lib/documents/templates/render';
import { forPrinting, LEGAL_BANNER } from '@/lib/templates/legal';
import { templateByCode } from '@/lib/templates/registry';
import { answersFor, type PackFacts } from '@/lib/contracts/offgrid';
import { GRID_WARNING } from '@/lib/assistant/contract-tools';

const root = path.resolve(__dirname, '../..');
const src = readFileSync(path.join(root, 'src/lib/assistant/contract-tools.ts'), 'utf8');

describe('the contract pack tool: drafts only, the user stays in control', () => {
  it('stops at the grid-connection question', () => {
    const gate = src.indexOf('confirmed_no_grid_connection !== true');
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(src.indexOf('createAdminClient()', gate));
    expect(GRID_WARNING).toMatch(/G98\/G99/);
    expect(GRID_WARNING).toMatch(/DNO/);
    expect(GRID_WARNING).toMatch(/not off-grid/);
  });
  it('can never sign, approve, send or publish anything', () => {
    expect(src).not.toMatch(/signLine|setApproval|reviseForm|sendQuoteForSigning|needs_signature|visible:\s*true/);
    expect(src).not.toMatch(/resend|ms365|sendMail|whatsapp\/send|sendManual|sendSms/);
    expect(src).not.toMatch(/\.delete\(/);
  });
  it('writes the documents only as hidden contract drafts, and nothing to the database directly', () => {
    expect(src).not.toMatch(/\.(insert|update|upsert)\(/);
    expect(src).toMatch(/category:\s*'contract'/);
    expect(src).toMatch(/visible:\s*false/);
  });
  it('refuses a quote that still has a PRICE REQUIRED line', () => {
    expect(src).toMatch(/PRICE REQUIRED/);
  });
  it('the approval action is admin-only and is not reachable from Metis', () => {
    const act = readFileSync(path.join(root, 'src/app/admin/legal-templates/actions.ts'), 'utf8');
    expect(act).toMatch(/profile\.role !== 'admin'/);
    const tools = readFileSync(path.join(root, 'src/lib/assistant/tools.ts'), 'utf8') + src + readFileSync(path.join(root, 'src/lib/assistant/quote-tools.ts'), 'utf8') + readFileSync(path.join(root, 'src/lib/assistant/design-tools.ts'), 'utf8');
    expect(tools).not.toMatch(/setApproval|setTemplateApproval|template_approvals/);
  });
  it('the forms route refuses to sign unapproved wording', () => {
    const route = readFileSync(path.join(root, 'src/app/api/crm/projects/[id]/forms/[code]/route.ts'), 'utf8');
    expect(route.indexOf('canIssue(')).toBeGreaterThan(0);
    expect(route.indexOf('canIssue(')).toBeLessThan(route.indexOf('signLine('));
  });
  it('the legal page is admin only in the middleware map', () => {
    expect(readFileSync(path.join(root, 'src/lib/portals.ts'), 'utf8')).toMatch(/ADMIN_ONLY_PATHS[^\n]*'\/admin\/legal-templates'/);
  });
});

describe('the pack as PDFs', () => {
  const job = { ref: 'HX-0001', issued: '2026-11-25', customer: 'Henry Price', address: ['1 Example Road', 'Cardiff'], postcode: 'CF10 1AA', variant: 'digital' as const };
  const facts: PackFacts = {
    customerType: 'Consumer',
    quoteRef: 'Q-1042',
    totalPence: 1425000,
    vatPence: 237500,
    schedule: [{ label: 'Deposit', percent: 30, amountPence: 427500, due: 'On acceptance' }, { label: 'Balance', percent: 70, amountPence: 997500, due: 'On completion' }],
    design: { panels: '10 × Test 400 W', arrayKwp: '4 kWp', layout: 'Portrait and landscape rows', strings: '1 string: 10 panels', inverter: 'Test 6 kW Hybrid', battery: 'Test 16 kWh', batteryUsable: '16 kWh', generator: 'No', dcAc: '0.67', dailyLoad: '8 kWh a day', autonomy: '2 (battery only, no solar)', assumptions: 'Gable roof assumed. Pitch assumed at 35°.', designPoints: 'The array is small for a 6 kW inverter.', designRef: 'Design pack HX-DS-01', surveyStatus: 'Not yet surveyed: indicative' },
    warranty: { panelYears: 25, inverterYears: 10, batteryYears: 10, workmanshipYears: 5 },
  };
  it('every document renders, marked as awaiting legal review', async () => {
    for (const code of ['HX-OG-01', 'HX-OG-02', 'HX-OG-03', 'HX-OG-04', 'HX-OG-05', 'HX-OG-06'] as const) {
      const t = templateByCode(code)!;
      const printed = forPrinting(t, {});
      expect(printed.legalDraft).toBe(true);
      expect(LEGAL_BANNER).toMatch(/awaiting legal review/);
      const bytes = await renderTemplate({ template: printed, job, answers: answersFor(code, facts), signed: {}, draft: true, revision: 'Issue 1' });
      expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
      if (process.env.METIS_PACK_DIR) writeFileSync(path.join(process.env.METIS_PACK_DIR, `${code}.pdf`), bytes);
    }
  }, 120000);
  it('the consumer terms render, and so do the business terms', async () => {
    const t = forPrinting(templateByCode('HX-OG-01')!, {});
    for (const type of ['Consumer', 'Business'] as const) {
      const bytes = await renderTemplate({ template: t, job, answers: answersFor('HX-OG-01', { ...facts, customerType: type }), signed: {}, draft: true, revision: 'Issue 1' });
      expect(bytes.length).toBeGreaterThan(3000);
    }
  }, 60000);
});
