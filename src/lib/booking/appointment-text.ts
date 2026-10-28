/** The wording of the appointment messages on WhatsApp and SMS. Pure, so it can be tested. */

export type AppointmentWords = { first: string; date: string; time: string; link: string; me: string };

/** "Tuesday 3 November" and "10:45" from a start time, in UK time. */
export function dateWords(ms: number): { date: string; time: string } {
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', ...o }).format(new Date(ms));
  return { date: f({ weekday: 'long', day: 'numeric', month: 'long' }), time: f({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) };
}

/** Free-text WhatsApp message (inside their 24-hour window). The ready-made template `survey_location` carries the same words. */
export const whatsappText = (w: AppointmentWords) =>
  `Hi ${w.first}, thank you for your time. I look forward to meeting you on ${w.date} at ${w.time}.\n\nI would be grateful if you could check the pin location at the link below and confirm, so I can find you first time around.\n${w.link}\n\nKind regards,\n${w.me}, Heliaxis`;

/** A text message, kept short. */
export const smsText = (w: AppointmentWords) => `Hi ${w.first}, thanks for your time. I look forward to meeting you on ${w.date} at ${w.time}. Please check the pin at ${w.link} so I can find you first time. ${w.me}, Heliaxis`;
