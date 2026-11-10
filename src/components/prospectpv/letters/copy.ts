/**
 * Editable copy blocks for the letter templates (spec 6.1: "edit copy blocks").
 *
 * Defaults live here; the template manager stores overrides in
 * pv_letter_templates.copy_blocks. Each letter stores the template key and
 * version, so editing copy means bumping the version.
 *
 * Compliance rule built into the shape: every block's base text is finance-free.
 * A block can have a `…Finance` variant that is used ONLY when the finance block
 * is enabled (switched on, lender + FCA wording set, lender-approved example).
 * So switching finance off can never leave a loan mention behind.
 *
 * Tokens: {line1} {panels} {package} {kwp} {battery} {annual} {phone} {url}
 * Markup: **bold**, blank line = new paragraph.
 */
import { annualKwh, kwp } from '@/lib/prospectpv/format';
import type { LetterData, TemplateKey } from '@/lib/prospectpv/types';

export type CopyBlocks = Record<string, string>;

/** Shared facts (spec 6.3, Warm Homes Loan Scheme, GOV.UK 27 Oct 2026). */
const WARM_HOMES =
  'Government-backed Warm Homes loans from participating lenders cut rates by up to 5 percentage points, and some lenders offer 0%. Up to £15,000 for solar and £15,000 for a battery.';

const SHARED: CopyBlocks = {
  priceLabel: 'Fully installed',
  priceNote: 'Inc. 0% VAT, scaffolding and MCS certificate',
  frontFooter:
    'Figures are indicative, based on {evidence}. A full MCS performance estimate is provided after your free survey. Prefer not to hear from us? Visit {optout} or call {phone}.',
  noFinanceTitle: 'Free survey. Fixed price.',
  noFinanceBody:
    'We check everything on a free, no-obligation survey, then give you a full MCS performance estimate and a fixed quote. No pressure, no obligation.',
  financeTitle: 'Nothing to pay upfront.',
  financeBody: WARM_HOMES,
  step1: 'Free survey',
  step2: 'MCS estimate and quote',
  step3: 'Book your install date',
  step3Finance: 'Finance, if wanted',
  step4: 'Install and handover',
  benefitsTitle: 'Why we fit GoodWe ESA',
};

export const DEFAULT_COPY: Record<TemplateKey, CopyBlocks> = {
  1: {
    ...SHARED,
    headline: 'Your roof could hold **{panels} solar panels.**',
    intro:
      'Dear Homeowner, we’ve looked at the roof at {line1} using {evidence}, and it looks well suited to solar. Here’s what we think it could take, and what happens next.',
    introFinance:
      'Dear Homeowner, we’ve looked at the roof at {line1} using {evidence}, and it looks well suited to solar. Here’s what we think it could take, and how you could pay nothing upfront.',
    stripTitle: 'Free survey, fixed quote.',
    stripBody: 'We confirm everything on a free survey before you decide. Your package and price are overleaf.',
    stripTitleFinance: 'Nothing to pay upfront.',
    stripBodyFinance:
      'Spread the cost with a government-backed Warm Homes loan at a reduced rate. Some lenders offer 0%. Full details overleaf.',
    ctaTitle: 'Book a free survey',
    benefitsTitle: 'Why GoodWe ESA',
    nextTitle: 'What happens next',
    nextCall: 'Call {phone} or scan the code overleaf.',
  },
  2: {
    ...SHARED,
    numberCaption: 'solar panels could fit on your roof.',
    sub: 'With a GoodWe ESA all-in-one battery.',
    subFinance: 'With a GoodWe ESA battery and nothing to pay upfront.',
    body:
      'Dear Homeowner,\n\nWe’re Heliaxis, an MCS-certified installer based in South Wales. Using {evidence}, we’ve worked out what your roof could take.\n\nTurn over for your package, price and how it works.',
    bodyFinance:
      'Dear Homeowner,\n\nWe’re Heliaxis, an MCS-certified installer based in South Wales. Using {evidence}, we’ve worked out what your roof could take. With a government-backed Warm Homes loan you could spread the cost at a reduced rate, and some lenders offer 0%.\n\nTurn over for your package, price and how it works.',
    ctaTitle: 'Book your free roof survey',
    noFinanceTitle: 'No obligation.',
    financeTitle: 'Pay nothing upfront.',
    stepsTitle: 'Four simple steps',
  },
  3: {
    ...SHARED,
    headline: 'Your roof at {line1} could power a lot more of your home.',
    body1:
      'Dear Homeowner,\n\nI’m {senderFirst}, director of Heliaxis, a local MCS-certified solar and battery installer. We’ve used {evidence} to estimate what your home could generate, and the numbers look good.\n\nYour roof looks suitable for around **{panels} panels**. Paired with a GoodWe ESA battery, that’s our **{package}** package:',
    body2:
      'I’ve put the full details overleaf, and a free survey confirms everything before you decide.\n\nIf you’d like a free, no-obligation survey, scan the code or call us on {phone}.',
    body2Finance:
      'You don’t need the money upfront. The new government-backed Warm Homes loan lets you spread the cost at a reduced rate, and some lenders offer 0%. I’ve put the details overleaf.\n\nIf you’d like a free, no-obligation survey, scan the code or call us on {phone}.',
    signoff: 'Best wishes,',
    benefitsTitle: 'Why we chose GoodWe ESA',
    noFinanceTitle: 'What the survey covers',
    noFinanceBody:
      'We check your roof, wiring and where the battery will go, then give you a full MCS performance estimate and a fixed quote. There’s no obligation.',
    financeTitle: 'How the Warm Homes loan works',
    financeBody:
      'It’s a government-backed loan from a participating lender, so there’s nothing to pay upfront. Rates are up to 5 percentage points lower than usual, and some lenders offer 0%. You can borrow up to £15,000 for solar and £15,000 for a battery.',
    nextSteps:
      '**Next steps:** book your free survey, get your MCS estimate and fixed quote, choose your install date, and we install and hand over. Call {phone}.',
    nextStepsFinance:
      '**Next steps:** book your free survey, get your MCS estimate and fixed quote, apply for finance if you want it, and we install and hand over. Call {phone}.',
  },
  4: {
    ...SHARED,
    reportTitle: 'Solar Roof Report',
    recommendation:
      '**Recommendation:** our **{package}** package, solar with a GoodWe ESA all-in-one battery. Package, price and next steps are overleaf.',
    recommendationFinance:
      '**Recommendation:** our **{package}** package, solar with a GoodWe ESA all-in-one battery. With a government-backed Warm Homes loan, you could pay nothing upfront and spread the cost at a reduced rate. Package, price and finance are overleaf.',
    ctaTitle: 'Confirm this report with a free survey',
    frontFooter:
      'Indicative report based on {evidenceLong}. A full MCS performance estimate is provided after your free survey. Prefer not to hear from us? Visit {optout} or call {phone}.',
    benefitsTitle: 'GoodWe ESA features',
    noFinanceTitle: 'Survey first, then a fixed price',
    financeTitle: 'Warm Homes loan: nothing upfront',
    step1: 'Survey',
    step1Desc: 'Free, on your roof',
    step2: 'Quote',
    step2Desc: 'MCS estimate, fixed price',
    step3: 'Install date',
    step3Desc: 'Book a date that suits',
    step3Finance: 'Finance',
    step3DescFinance: 'If you want it',
    step4: 'Install',
    step4Desc: 'Commission and handover',
  },
  5: {
    ...SHARED,
    eyebrow: 'Roof estimate · {line1}',
    headline: 'Your roof is ready for solar.',
    lead: 'Room for **{panels} panels** and a GoodWe ESA battery.',
    leadFinance: 'Room for **{panels} panels**, a GoodWe ESA battery, and nothing to pay upfront.',
    body:
      'Dear Homeowner,\n\nWe’re Heliaxis, an MCS-certified solar and battery installer in South Wales. We’ve checked your roof using {evidence}, and it looks a strong fit.\n\nYour package, price and what happens next are overleaf. A free survey confirms everything before you decide.',
    bodyFinance:
      'Dear Homeowner,\n\nWe’re Heliaxis, an MCS-certified solar and battery installer in South Wales. We’ve checked your roof using {evidence}, and it looks a strong fit.\n\nWith a government-backed Warm Homes loan, you can spread the cost at a reduced rate, and some lenders offer 0%. Your package, price and finance details are overleaf.',
    qrEyebrow: 'Scan to see your results',
    qrTitle: 'Your roof, your price, book online',
    qrBody: 'Your address is already filled in. Or visit {url} or call {phone}.',
    benefitsTitle: 'Why we fit GoodWe ESA',
    qrBack: 'Scan to book',
  },
};

export type Copy = (key: string) => string;

/** Returns a lookup that applies overrides, the finance rule and token interpolation. */
export function makeCopy(templateKey: TemplateKey, data: LetterData, overrides: CopyBlocks = {}): Copy {
  const blocks = { ...DEFAULT_COPY[templateKey], ...overrides };
  const url = data.qrUrl.replace(/^https?:\/\//, '');
  const tokens: Record<string, string> = {
    line1: data.address.line1,
    panels: String(data.estimate.panelCount),
    package: data.package.name,
    kwp: kwp(data.estimate.kwp),
    battery: String(data.estimate.batteryKwh),
    annual: annualKwh(data.estimate.annualKwh),
    phone: data.company.phone,
    url,
    optout: data.company.optOutUrl,
    evidence: data.source === 'manual' ? 'the roof details we hold' : 'aerial roof data',
    evidenceLong: data.source === 'manual' ? 'the roof details we hold' : 'Ordnance Survey and aerial roof data',
    senderFirst: data.sender.name.startsWith('[') ? data.sender.name : (data.sender.name.split(' ')[0] ?? data.sender.name),
  };
  return (key) => {
    const raw = (data.finance.enabled && blocks[`${key}Finance`]) || blocks[key] || '';
    return raw.replace(/\{(\w+)\}/g, (m, t: string) => tokens[t] ?? m);
  };
}
