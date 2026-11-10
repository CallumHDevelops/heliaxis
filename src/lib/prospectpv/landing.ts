/**
 * Turns the pv_landing_open result into the props the landing page renders.
 * Pure, so it can be tested and reused by the walk-in lookup later.
 */
import type { QuoteContext } from './booking';
import { overlayImages, urlsFromPaths } from './images';
import { calculatorReady, financeAllowed, parseLandingSettings, type LandingSettingsBundle } from './settings';
import type { ExtraRow, LetterData } from './types';

export type LandingModel = {
  letterCode: string;
  letter: LetterData;
  settings: LandingSettingsBundle;
  quoteContext: QuoteContext;
  /** Calculator shows only when SEG rate, off-peak spread and standing charge are set. */
  calculatorOn: boolean;
  /** Finance copy shows only if it was on for the letter AND is still allowed now. */
  financeOn: boolean;
};

type Raw = { letterCode: string; printed: LetterData; extras: unknown; settings: Record<string, unknown>; assets?: Record<string, string | null> };

const toNum = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : null);

export function parseExtras(raw: unknown): ExtraRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && typeof (e as { key?: unknown }).key === 'string')
    .map((e) => ({
      key: String(e.key),
      name: String(e.name ?? e.key),
      description: typeof e.description === 'string' ? e.description : null,
      price: toNum(e.price),
      effect: (e.effect && typeof e.effect === 'object' ? e.effect : {}) as ExtraRow['effect'],
    }));
}

/** `assetBase` is the Supabase project URL, used to turn stored image paths into addresses. */
export function toLandingModel(raw: Raw, opts: { assetBase?: string } = {}): LandingModel {
  const settings = parseLandingSettings(raw.settings ?? {});
  const letter = opts.assetBase && raw.assets ? overlayImages(raw.printed, urlsFromPaths(opts.assetBase, raw.assets)) : raw.printed;
  return {
    letterCode: raw.letterCode,
    letter,
    settings,
    calculatorOn: calculatorReady(settings.assumptions),
    financeOn: letter.finance.enabled && financeAllowed(settings.finance),
    quoteContext: {
      packagePrice: letter.package.priceIncVat,
      baseBatteryKwh: letter.estimate.batteryKwh,
      moduleKwh: settings.battery.module_kwh,
      modulePrice: settings.battery.module_price_gbp,
      maxKwh: settings.battery.max_kwh,
      extras: parseExtras(raw.extras),
      claims: letter.package.claims,
    },
  };
}
