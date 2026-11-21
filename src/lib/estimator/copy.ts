/** Wording the estimator page, the PDF and the emails share, so what we promise is said once. Nothing here claims more than Heliaxis does. */
export const TIMELINE: { title: string; text: string }[] = [
  { title: 'Free survey', text: 'We visit, check your roof, shading and electrics, and give you a fixed price in writing.' },
  { title: 'Design (MCS)', text: 'We design the system to MCS standards so it suits your roof and how you use electricity.' },
  { title: 'Grid application', text: 'G98 or G99 with your network operator. We deal with National Grid or your DNO, so you don’t have to.' },
  { title: 'Installation', text: 'Usually one to two days, with scaffolding, panels, inverter, battery and all the electrical work.' },
  { title: 'Commissioning and MCS certificate', text: 'We test and commission it, then hand over your MCS certificate and handover pack.' },
  { title: 'Tariff set-up', text: 'We help you register for the Smart Export Guarantee and pick a tariff that pays you for what you export and lets your battery charge cheaply overnight.' },
];

export const ESTIMATE_SMALL_PRINT = 'This is an estimate based on the answers you gave and satellite data. A free survey confirms the final design and price. Savings depend on your usage, tariff and future energy prices.';

export const QUOTE_VALID_DAYS = 30;

export const SITE_URL = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://heliaxis.co.uk').replace(/\/$/, '');

/** The page that books the survey, carrying the quote's reference. */
export const surveyUrl = (reference: string, postcode?: string) => `${SITE_URL()}/book-a-survey?type=solar${postcode ? `&postcode=${encodeURIComponent(postcode)}` : ''}&ref=${encodeURIComponent(reference)}`;
