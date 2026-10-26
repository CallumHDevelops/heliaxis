import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { quotePdf } from '@/lib/quotes/pdf';
import { starterContent } from '@/lib/quotes/types';

describe('quote pdf', () => {
  it('makes a multi-page PDF in the document kit', async () => {
    const content = starterContent('Sam');
    const items = content.blocks[0];
    if (items.type === 'items') {
      items.lines = [
        { id: '1', description: '12 × 450W solar panels', detail: 'All-black, 25-year product warranty', qty: 12, unit_pence: 21000, vat_rate: 0 },
        { id: '2', description: '10 kWh battery', qty: 1, unit_pence: 450000, vat_rate: 0 },
        { id: '3', description: 'Scaffolding', qty: 1, unit_pence: 60000, vat_rate: 20 },
      ];
    }
    const inc = content.blocks[1];
    if (inc.type === 'text') inc.body = 'Supply and installation of the panels and battery.\n\nMCS certificate and DNO notification.';
    const bytes = await quotePdf({
      number: 'Q-0001', title: 'Your Heliaxis quote', issued: '2026-10-26', validUntil: '2026-11-25', jobRef: null,
      customer: { name: 'Sam Example', email: 'sam@example.com', phone: '07700 900123', address: '1 High Street, Swansea, SA1 1AA' },
      content, depositPence: 50000, images: new Map(), datasheets: new Map(),
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(5000);
  });
});
