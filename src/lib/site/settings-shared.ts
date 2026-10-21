/**
 * Site and handover settings (CRM settings → Site app), kept in cms_kv 'site-settings' like the CRM's
 * own (settings.ts reads and saves them). Types, defaults and the cleaner: safe in the browser.
 *
 * Every wording and number here is the owner's: payment terms print only once he's written them,
 * and nothing that decides money has a default that could be wrong (the VAT treatment for
 * VAT-registered subcontractors is chosen per assignment until he picks one, D9).
 */
import type { VatTreatment } from './money';

export type SiteSettings = {
  /** Printed on labour POs ("Payment within 14 days of a correct invoice"). Empty: nothing printed. */
  paymentTerms: string;
  /** "Within N days": the trade sees a payment date only when this is set. */
  paymentDays: number | null;
  /** VAT for subcontractors who are VAT registered, when the assignment doesn't choose. '' = choose each time. */
  vatDefault: '' | Exclude<VatTreatment, 'none'>;
  /** Hold the PO (draft, for the office to issue) when a trade signs off with an Urgent problem (D12). */
  holdPoOnUrgent: boolean;
  /** Hold the scaffold PO until the photos once it's down are in (D11). */
  holdScaffoldPoUntilStrike: boolean;
  /** Working days after the scaffold's down date when the strike photos are asked for again. */
  strikeReminderDays: number[];
  /** Stamp trade photos with where they were taken (D18). Time is always stamped. */
  locationStamps: boolean;
  /** New assignments show the customer's mobile in the job pack. */
  shareCustomerPhone: boolean;
  /** F43: a measured string Voc further than this from expected (percent) goes to the office to check (SPEC 2.5 starts at 10). */
  vocTolerancePct: number;
};

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  paymentTerms: '',
  paymentDays: null,
  vatDefault: '',
  holdPoOnUrgent: false,
  holdScaffoldPoUntilStrike: false,
  strikeReminderDays: [1, 3, 5],
  locationStamps: false,
  shareCustomerPhone: true,
  vocTolerancePct: 10,
};

const VAT_DEFAULTS = ['', 'reverse_charge', 'standard', 'zero'];

export function cleanSiteSettings(b: Partial<Record<keyof SiteSettings, unknown>>): SiteSettings {
  const d = DEFAULT_SITE_SETTINGS;
  const bool = (v: unknown, def: boolean) => (v === undefined ? def : v === true);
  const days = Number(b.paymentDays);
  const reminders = Array.isArray(b.strikeReminderDays)
    ? [...new Set(b.strikeReminderDays.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 30))].sort((x, y) => x - y).slice(0, 5)
    : d.strikeReminderDays;
  return {
    paymentTerms: String(b.paymentTerms ?? d.paymentTerms).replace(/\s+/g, ' ').trim().slice(0, 300),
    paymentDays: b.paymentDays === null || b.paymentDays === '' || b.paymentDays === undefined ? null : Number.isInteger(days) && days >= 1 && days <= 120 ? days : null,
    vatDefault: VAT_DEFAULTS.includes(String(b.vatDefault ?? '')) ? (String(b.vatDefault ?? '') as SiteSettings['vatDefault']) : '',
    holdPoOnUrgent: bool(b.holdPoOnUrgent, d.holdPoOnUrgent),
    holdScaffoldPoUntilStrike: bool(b.holdScaffoldPoUntilStrike, d.holdScaffoldPoUntilStrike),
    strikeReminderDays: reminders,
    locationStamps: bool(b.locationStamps, d.locationStamps),
    shareCustomerPhone: bool(b.shareCustomerPhone, d.shareCustomerPhone),
    vocTolerancePct: Number.isFinite(Number(b.vocTolerancePct)) && Number(b.vocTolerancePct) >= 1 && Number(b.vocTolerancePct) <= 50 ? Number(b.vocTolerancePct) : d.vocTolerancePct,
  };
}
