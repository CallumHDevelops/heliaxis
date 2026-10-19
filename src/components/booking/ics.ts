/**
 * "Add to my calendar" for a booked survey: a one-event .ics file made in the browser (nothing is
 * sent anywhere). Times are written in UTC, so every calendar app shows the right UK time on both
 * sides of the clocks changing.
 */

export type IcsEvent = {
  uid: string;
  title: string;
  /** ISO strings or epoch ms. */
  start: string | number;
  end: string | number;
  location?: string;
  description?: string;
  url?: string;
  /** When the file was made (epoch ms): pass Date.now() from the click handler. */
  stamp: number;
};

const utc = (t: string | number) =>
  new Date(t)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

/** Commas, semicolons, backslashes and line breaks are escaped in iCalendar text. */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lines longer than 75 bytes are folded (continuation lines start with a space). */
function fold(line: string): string {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (bytes.encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function icsText(e: IcsEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Heliaxis//Survey booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}@heliaxis.co.uk`,
    `DTSTAMP:${utc(e.stamp)}`,
    `DTSTART:${utc(e.start)}`,
    `DTEND:${utc(e.end)}`,
    `SUMMARY:${esc(e.title)}`,
    ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(e.title)}`,
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Hand the file to the browser: phones offer to add it to the calendar, computers download it. */
export function downloadIcs(filename: string, e: IcsEvent): void {
  const blob = new Blob([icsText(e)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
