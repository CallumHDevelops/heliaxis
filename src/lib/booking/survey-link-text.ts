/**
 * The words that go out with a customer's survey booking link, on each channel. Pure, so it can be tested and shown as a preview.
 * The WhatsApp wording outside the 24-hour window is the approved template (survey_booking_link in templates-shared.ts), which
 * says the same thing.
 */
export const COMPANY_PHONE = '01633 965205';

export type LinkWords = { first: string; url: string; me: string };

/** WhatsApp inside the 24-hour window, and the preview. */
export const whatsappWords = ({ first, url, me }: LinkWords) =>
  `Hi ${first}, thanks for your time on the phone just now. Please use the link below to book a survey for your home: ${url} Any questions, just reply here. Kind regards, ${me}, Heliaxis`;

/** A text can't be replied to (it comes from the name "Heliaxis"), so it says how to reach us. */
export const smsWords = ({ first, url, me }: LinkWords) =>
  `Hi ${first}, thanks for your time on the phone just now. Please use this link to book a survey for your home: ${url} Any questions, call us on ${COMPANY_PHONE}. ${me}, Heliaxis`;

export const emailSubject = 'Book your survey with Heliaxis';

/** Paragraphs of the email, above the "Book your survey" button. */
export const emailParagraphs = ({ first, me }: Pick<LinkWords, 'first' | 'me'>) => [
  `Hi ${first},`,
  'Thanks for your time on the phone just now. Please use the button below to choose a day and time for a survey of your home. It only takes a minute.',
  `If you have any questions, just reply to this email or call us on ${COMPANY_PHONE}.`,
  `Kind regards,\n${me}, Heliaxis`,
];

/** "Remind me to check they've booked": none, or this many days on (at 9am). */
export const CHASE_CHOICES = [0, 1, 2, 3, 7] as const;
export const chaseWords = (d: number) => (d === 0 ? 'No reminder' : d === 1 ? 'Tomorrow' : d === 7 ? 'In a week' : `In ${d} days`);
