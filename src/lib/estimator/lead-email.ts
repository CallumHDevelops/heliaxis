import { esc } from '@/lib/email-brand';
import { headline, rest, type EstimateFact } from './lead';

/**
 * The solar estimator's summary as it appears in the alert email: the headline figures as big tiles (system, saving, cost, payback), then the
 * rest (what they use, shade, daytime, the roof) as a short list. Inline styles only (email clients).
 */
export function estimateBlockHtml(facts: EstimateFact[]): string {
  const tiles = headline(facts)
    .map((f) => `<td style="width:50%;padding:0 6px 8px 0;vertical-align:top"><div style="background:#FFFDF8;border:1px solid #e4ddcc;padding:10px 12px"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6E6A5E;font-family:'Courier New',Courier,monospace">${esc(f.label)}</div><div style="font-size:17px;font-weight:700;line-height:1.3;margin-top:3px">${esc(f.value)}</div></div></td>`);
  const rows: string[] = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push(`<tr>${tiles[i]}${tiles[i + 1] ?? '<td></td>'}</tr>`);
  const more = rest(facts)
    .map((f) => `<tr><td style="padding:3px 12px 3px 0;color:#6E6A5E;font-size:13px;white-space:nowrap;vertical-align:top">${esc(f.label)}</td><td style="padding:3px 0;font-size:14px">${esc(f.value)}</td></tr>`)
    .join('');
  return `<p style="margin:18px 0 8px;font-weight:700;font-size:15px">What the solar estimator told them</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 6px">${rows.join('')}</table>
    ${more ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${more}</table>` : ''}`;
}
