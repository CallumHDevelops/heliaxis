/** The business's test instruments (supabase/test-instruments.sql). Pure: used by the page, the certificate and the tests. */
export const KINDS = [
  { key: 'mft', label: 'Multifunction tester' },
  { key: 'continuity', label: 'Continuity tester' },
  { key: 'ir', label: 'Insulation resistance tester' },
  { key: 'efli', label: 'Earth fault loop impedance tester' },
  { key: 'rcd', label: 'RCD tester' },
  { key: 'earth', label: 'Earth electrode resistance tester' },
  { key: 'pat', label: 'PAT tester' },
  { key: 'other', label: 'Other' },
] as const;
export type Kind = (typeof KINDS)[number]['key'];
export const kindLabel = (k: string) => KINDS.find((x) => x.key === k)?.label ?? 'Other';

export type Instrument = {
  id: string;
  name: string;
  kind: Kind;
  make: string;
  model: string;
  serial: string;
  asset_no: string;
  calibrated_on: string | null;
  calibration_due: string | null;
  cert_no: string;
  calibrated_by: string;
  assigned_to: string;
  status: 'active' | 'retired';
  notes: string;
  updated_at: string;
};

/** Where an instrument's calibration stands on a day (YYYY-MM-DD): in date, due within a month, out of date, or no date given. */
export type CalState = 'ok' | 'soon' | 'expired' | 'unknown';
export function calState(due: string | null | undefined, today: string, soonDays = 30): CalState {
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return 'unknown';
  if (due < today) return 'expired';
  const days = (Date.parse(due) - Date.parse(today)) / 86_400_000;
  return days <= soonDays ? 'soon' : 'ok';
}

/** "Calibration due 12 Mar 2027", "Calibration expired 3 Jan 2026". */
export function calWords(due: string | null | undefined, today: string): string {
  const s = calState(due, today);
  if (s === 'unknown') return 'No calibration date';
  const d = new Date(`${due}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return s === 'expired' ? `Calibration expired ${d}` : `Calibration due ${d}`;
}

/** The instrument a serial or asset number written on a certificate belongs to. */
export function findInstrument(list: Pick<Instrument, 'id' | 'serial' | 'asset_no'>[], value: string | null | undefined) {
  const v = (value ?? '').trim().toLowerCase();
  if (!v) return null;
  return list.find((i) => (i.serial && i.serial.trim().toLowerCase() === v) || (i.asset_no && i.asset_no.trim().toLowerCase() === v)) ?? null;
}

const text = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** What may be saved from a request body: unknown kinds and bad dates are dropped, text is trimmed. */
export function cleanInstrument(b: Record<string, unknown>): Partial<Omit<Instrument, 'id' | 'updated_at'>> {
  const out: Record<string, unknown> = {};
  if ('name' in b) out.name = text(b.name, 120);
  if ('kind' in b && KINDS.some((k) => k.key === b.kind)) out.kind = b.kind;
  for (const k of ['make', 'model', 'serial', 'asset_no', 'cert_no', 'calibrated_by', 'assigned_to'] as const) if (k in b) out[k] = text(b[k], 120);
  if ('notes' in b) out.notes = text(b.notes, 1000);
  for (const k of ['calibrated_on', 'calibration_due'] as const) if (k in b) out[k] = day(b[k]);
  if ('status' in b && (b.status === 'active' || b.status === 'retired')) out.status = b.status;
  return out as Partial<Omit<Instrument, 'id' | 'updated_at'>>;
}
