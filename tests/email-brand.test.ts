import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { brandEmail, detailRows, emailShell, isBranded, textToHtml } from '@/lib/email-brand';

describe('every email is in the Heliaxis template', () => {
  it('has the logo, gold bar, accreditations and company details', () => {
    const h = emailShell('Hello', '<p>Body</p>');
    expect(isBranded(h)).toBe(true);
    expect(h).toContain('/assets/heliaxis-logo-light.png');
    expect(h).toContain('#F8BC1E');
    expect(h).toContain('MCS · RECC · NICEIC · TrustMark certified installer');
    expect(h).toContain('Company No.');
  });
  it('only warns about a personal link when there is a button', () => {
    expect(emailShell('x', '<p>y</p>')).not.toContain('personal to you');
    expect(emailShell('x', '<p>y</p>', { href: 'https://heliaxis.co.uk/a', label: 'Go' })).toContain('personal to you');
  });
  it('leaves branded html alone', () => {
    const h = emailShell('Hello', '<p>Body</p>');
    expect(brandEmail({ subject: 's', html: h })).toBe(h);
  });
  it('wraps plain text in the template, with links and escaped text', () => {
    const h = brandEmail({ subject: 'Your pack', text: 'Hi <Sam>,\n\nOpen it: https://heliaxis.co.uk/p/abc.\n\nThanks' });
    expect(isBranded(h)).toBe(true);
    expect(h).toContain('Your pack');
    expect(h).toContain('Hi &lt;Sam&gt;,');
    expect(h).toContain('<a href="https://heliaxis.co.uk/p/abc"');
  });
  it('puts unbranded html inside the template, without its own page and style sheet', () => {
    const h = brandEmail({ subject: 's', html: '<html><head><style>p{color:red}</style></head><body><p>Hi there</p></body></html>' });
    expect(isBranded(h)).toBe(true);
    expect(h).toContain('Hi there');
    expect(h).not.toContain('color:red');
  });
  it('makes tidy detail tables and skips empty values', () => {
    const t = detailRows([['Name', 'Sam'], ['Phone', ''], ['Email', 'a@b.co']], { Email: 'mailto:a@b.co' });
    expect(t).toContain('Name');
    expect(t).not.toContain('Phone');
    expect(t).toContain('href="mailto:a@b.co"');
    expect(textToHtml('a\n\nb')).toContain('<p');
  });
});

describe('no email bypasses the template', () => {
  const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const src = files('src').filter((f) => /\.tsx?$/.test(f));
  it('sends through Resend only from the places that brand their own mail', () => {
    const direct = src.filter((f) => fs.readFileSync(f, 'utf8').includes('api.resend.com/emails')).map((f) => f.replace(/\\/g, '/')).sort();
    expect(direct).toEqual(['src/app/api/admin/email-health/route.ts', 'src/app/api/quote/route.ts', 'src/app/api/subcontractor/route.ts', 'src/lib/subcontractors/server.ts']);
  });
  it('the direct senders use the template', () => {
    for (const f of ['src/app/api/quote/route.ts', 'src/app/api/subcontractor/route.ts']) expect(fs.readFileSync(f, 'utf8'), f).toContain('emailShell(');
  });
});
