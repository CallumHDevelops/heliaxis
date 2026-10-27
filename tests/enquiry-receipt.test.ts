import { describe, expect, it } from 'vitest';
import { enquiryReceiptEmail, estimateLine } from '@/lib/enquiry-receipt';

const message = 'Solar estimator: 4.50 kWp (10 panels). About 3,993 kWh a year, saving about £950 a year, indicative cost £12,500, payback about 12 years. Uses £120/month; some shade; daytime: some (roof found at 2 Marine Terrace).';

describe('enquiry receipt email', () => {
  it('pulls the estimate out of the estimator message', () => {
    expect(estimateLine(message)).toBe('4.50 kWp (10 panels), about 3,993 kWh a year, saving about £950 a year, indicative cost £12,500, payback about 12 years');
    expect(estimateLine('Please call me')).toBeNull();
    expect(estimateLine(undefined)).toBeNull();
  });
  it('is a branded survey-request receipt for the estimator, with what they sent', () => {
    const m = enquiryReceiptEmail({ name: 'Sam Williams', email: 'sam@example.com', postcode: 'NP26 5ST', interest: 'Solar panels, Battery storage', source: 'solar-estimator', message });
    expect(m.subject).toBe('We’ve received your survey request | Heliaxis');
    expect(m.html).toContain('HELIAXIS');
    expect(m.html).toContain('Hi Sam,');
    expect(m.html).toContain('NP26 5ST');
    expect(m.html).toContain('Solar panels, Battery storage');
    expect(m.html).toContain('4.50 kWp');
    expect(m.html).not.toContain('personal to you');
    expect(m.text).toContain('We call you within one working day');
  });
  it('is a plain enquiry receipt for other forms and escapes what people typed', () => {
    const m = enquiryReceiptEmail({ name: '<b>Sam</b>', email: 'a@b.co', source: 'quote-form' });
    expect(m.subject).toBe('We’ve received your enquiry | Heliaxis');
    expect(m.html).not.toContain('<b>Sam</b>');
    expect(m.html).toContain('&lt;b&gt;Sam&lt;/b&gt;');
  });
});
