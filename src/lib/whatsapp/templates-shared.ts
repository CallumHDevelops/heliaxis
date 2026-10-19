/**
 * WhatsApp message templates: Heliaxis's ready-made ones, the CRM fields that fill their blanks,
 * Meta's rules for new ones, and the jobs that send them automatically. Safe for client code.
 *
 * A template's blanks ({{1}}, {{2}}…) are filled in order when it's sent. Which CRM field fills
 * each one is saved per template (cms_kv 'whatsapp-template-fields'); the ready-made ones below
 * carry their own.
 */

export type TemplateCategory = 'UTILITY' | 'MARKETING';

/** UK prices are Meta's per delivered message, roughly (see WHATSAPP_SETUP.md → Costs). */
export const CATEGORIES: Record<TemplateCategory, { label: string; cost: string; when: string }> = {
  UTILITY: {
    label: 'Utility',
    cost: 'About 1.6p a message, and free if they’ve messaged you in the last 24 hours.',
    when: 'About something the customer has already asked for or booked: their enquiry, a survey, a quote, an install. No offers or selling: Meta moves anything salesy to Marketing.',
  },
  MARKETING: {
    label: 'Marketing',
    cost: 'About 4–5p a message, every time.',
    when: 'Anything else, like getting back in touch with older leads, offers or news. Only for people who agreed to hear from you on WhatsApp. Meta limits how many marketing messages each person gets, so the odd one may not arrive.',
  },
};

export const categoryLabel = (c: string) =>
  CATEGORIES[c as TemplateCategory]?.label ?? (c ? c[0] + c.slice(1).toLowerCase() : '');

/* ── What fills each blank ───────────────────────────────────────────────────── */

export type FieldKey =
  | 'first_name'
  | 'my_first_name'
  | 'interest'
  | 'booking_link'
  | 'quote_link'
  | 'when_words'
  | 'date_time'
  | 'review_link';

export const FIELDS: Record<FieldKey, { label: string; example: string; help: string; token?: string }> = {
  first_name: { label: 'Customer’s first name', example: 'Sarah', help: 'From the customer’s name', token: 'first_name' },
  my_first_name: { label: 'Your first name', example: 'Callum', help: 'Whoever sends it', token: 'your_name' },
  interest: {
    label: 'What they asked about',
    example: 'solar panels',
    help: 'From the products on their opportunity, e.g. “solar panels and battery storage”',
    token: 'asked_about',
  },
  booking_link: { label: 'Booking link', example: 'https://heliaxis.co.uk/my/Xk2pQ7', help: 'The link they book their survey from', token: 'booking_link' },
  quote_link: { label: 'Quote / portal link', example: 'https://heliaxis.co.uk/my/Xk2pQ7', help: 'Their customer portal link', token: 'quote_link' },
  when_words: { label: 'When (“tomorrow”, “in 3 days”)', example: 'tomorrow', help: 'Filled in by the reminder' },
  date_time: { label: 'Date and time', example: 'Monday 3 November, 10:00', help: 'Filled in by the reminder' },
  review_link: { label: 'Google review link', example: 'https://g.page/r/CQx8HeliaxisReview/review', help: 'From CRM settings → Review requests' },
};

/** The fields the "New template" form offers as insert chips, typed into the message as {token}. */
export const INSERTABLE: FieldKey[] = ['first_name', 'my_first_name', 'interest', 'booking_link', 'quote_link'];

/** One blank: a CRM field, or something typed in when sending (described by its label). */
export type Blank = { field: FieldKey } | { field: 'custom'; label: string };

export const blankLabel = (b: Blank) => (b.field === 'custom' ? b.label : FIELDS[b.field].label);

/** Saved blanks from the browser or cms_kv, checked. Null = not a valid list. */
export function cleanBlanks(v: unknown): Blank[] | null {
  if (!Array.isArray(v) || v.length > 20) return null;
  const out: Blank[] = [];
  for (const b of v) {
    const field = (b as { field?: unknown })?.field;
    if (typeof field === 'string' && field in FIELDS) out.push({ field: field as FieldKey });
    else if (field === 'custom') {
      const label = String((b as { label?: unknown }).label ?? '').trim().slice(0, 60);
      if (!label) return null;
      out.push({ field: 'custom', label });
    } else return null;
  }
  return out;
}

/** "What they asked about" from the opportunity's products, e.g. "solar panels and battery storage". */
const PRODUCT_PHRASE: Record<string, string> = {
  solar: 'solar panels',
  battery: 'battery storage',
  heatpump: 'a heat pump',
  ev: 'an EV charger',
  infrared: 'infrared heating',
  led: 'LED lighting',
};
export function interestPhrase(products: string[] | null | undefined): string {
  const words = (products ?? []).map((p) => PRODUCT_PHRASE[p]).filter(Boolean);
  if (words.length < 2) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

/* ── Ready-made Heliaxis templates ───────────────────────────────────────────── */

export type JobKey = 'firstContact' | 'chase' | 'survey' | 'install' | 'review';

export type ReadyTemplate = {
  name: string;
  /** Plain name for the card. */
  title: string;
  category: TemplateCategory;
  /** When it's used. */
  use: string;
  body: string;
  fields: FieldKey[];
  buttons: string[];
  /** The automatic job it's made for, if any. */
  job?: JobKey;
};

/**
 * Meta's rules shaped the wording: never a blank at the very start or end, never two blanks side
 * by side. survey_reminder, install_reminder and review_request keep the names CRM settings use.
 */
export const READY_MADE: ReadyTemplate[] = [
  {
    name: 'new_enquiry_welcome',
    title: 'Welcome a new enquiry',
    category: 'UTILITY',
    use: 'The first message to a new lead who said yes to WhatsApp, e.g. from a Meta lead form.',
    body: 'Hi {{1}}, thanks for your enquiry about {{2}} with Heliaxis. When’s a good time for a quick call? Or just reply here with any questions.',
    fields: ['first_name', 'interest'],
    buttons: ['Call me today', 'Call me tomorrow', 'Message me instead'],
    job: 'firstContact',
  },
  {
    name: 'enquiry_followup',
    title: 'Get back in touch with an older lead',
    category: 'MARKETING',
    use: 'Leads who went quiet weeks or months ago, like the Meta leads you imported.',
    body: 'Hi {{1}}, it’s {{2}} from Heliaxis. A while ago you asked us about {{3}}. Are you still thinking about it? We’re happy to answer questions or book a free, no-obligation survey.',
    fields: ['first_name', 'my_first_name', 'interest'],
    buttons: ['Yes, still interested', 'Not right now'],
  },
  {
    name: 'survey_booking_link',
    title: 'Survey booking link',
    category: 'UTILITY',
    use: 'Send them the link to book their free survey.',
    body: 'Hi {{1}}, here’s your link to book your free Heliaxis survey: {{2}} Pick whichever time suits you.',
    fields: ['first_name', 'booking_link'],
    buttons: [],
  },
  {
    name: 'quote_ready',
    title: 'Quote ready',
    category: 'UTILITY',
    use: 'Tell them their quote is ready, with the link to see it.',
    body: 'Hi {{1}}, your Heliaxis quote is ready to view: {{2}} Any questions, just reply here.',
    fields: ['first_name', 'quote_link'],
    buttons: [],
  },
  {
    name: 'missed_call',
    title: 'Sorry we missed you',
    category: 'UTILITY',
    use: 'After you rang and they didn’t pick up.',
    body: 'Hi {{1}}, it’s {{2}} from Heliaxis. We tried to call you about your enquiry for {{3}}. When’s a good time to call back? Or just reply here.',
    fields: ['first_name', 'my_first_name', 'interest'],
    buttons: [],
  },
  {
    name: 'survey_reminder',
    title: 'Survey booked / reminder',
    category: 'UTILITY',
    use: 'Sent by itself when a survey is booked and before it (CRM settings → reminders), if they haven’t messaged in the last 24 hours.',
    body: 'Hi {{1}}, a reminder that your Heliaxis survey is {{2}} — {{3}}. Reply here with any questions.',
    fields: ['first_name', 'when_words', 'date_time'],
    buttons: [],
    job: 'survey',
  },
  {
    name: 'install_reminder',
    title: 'Install booked / reminder',
    category: 'UTILITY',
    use: 'Sent by itself when an install is booked and before it (CRM settings → reminders), if they haven’t messaged in the last 24 hours.',
    body: 'Hi {{1}}, a reminder that your Heliaxis installation is {{2}} — {{3}}. Reply here with any questions.',
    fields: ['first_name', 'when_words', 'date_time'],
    buttons: [],
    job: 'install',
  },
  {
    name: 'review_request',
    title: 'Google review request',
    category: 'UTILITY',
    use: 'Sent by itself a few days after a job is marked Complete (CRM settings → Review requests).',
    body: 'Hi {{1}}, thank you for choosing Heliaxis! If you’re happy with your installation, would you leave us a quick review? {{2}} It really helps a small local business.',
    fields: ['first_name', 'review_link'],
    buttons: [],
    job: 'review',
  },
];

export const readyMade = (name: string) => READY_MADE.find((t) => t.name === name);

/* ── Jobs that send a template by themselves ─────────────────────────────────── */

export type Job = {
  key: JobKey;
  label: string;
  /** Which settings API saves it, and under which key. */
  where: 'whatsapp' | 'crm';
  setting: 'firstContactTemplate' | 'chaseTemplate' | 'surveyTemplate' | 'installTemplate' | 'reviewTemplate';
  /**
   * What the job fills in. `flexible`: it fills each blank by its field (any of these, any order);
   * otherwise it sends exactly these, in this order (src/lib/crm/automation.ts).
   */
  fields: FieldKey[];
  flexible: boolean;
};

export const JOBS: Job[] = [
  { key: 'firstContact', label: 'First message to new Meta leads', where: 'whatsapp', setting: 'firstContactTemplate', fields: ['first_name', 'interest'], flexible: true },
  { key: 'chase', label: 'Chasers once the free 24 hours are up', where: 'whatsapp', setting: 'chaseTemplate', fields: ['first_name', 'interest'], flexible: true },
  { key: 'survey', label: 'Survey booked + reminders', where: 'crm', setting: 'surveyTemplate', fields: ['first_name', 'when_words', 'date_time'], flexible: false },
  { key: 'install', label: 'Install booked + reminders', where: 'crm', setting: 'installTemplate', fields: ['first_name', 'when_words', 'date_time'], flexible: false },
  { key: 'review', label: 'Google review requests', where: 'crm', setting: 'reviewTemplate', fields: ['first_name', 'review_link'], flexible: false },
];

/** Why this template can't do this job (null = it can). `blanks` null = nobody has said what fills them. */
export function jobProblem(job: Job, t: { language: string; params: number; blanks: Blank[] | null }, lang: string): string | null {
  if (t.language !== lang) return `Automatic messages go out in ${lang}, and this one is ${t.language}.`;
  const wants = job.fields.map((f) => FIELDS[f].label).join(', ');
  if (job.flexible) {
    if (!t.blanks) {
      if (t.params === 1) return null; // the old rule: {{1}} = first name
      return t.params ? 'Say what fills the blanks first.' : 'Automatic messages put the customer’s first name in it, and this one has no blanks.';
    }
    const odd = t.blanks.find((b) => b.field === 'custom' || !job.fields.includes(b.field));
    return odd ? `It needs “${blankLabel(odd)}”, which can’t be filled in automatically.` : null;
  }
  if (!t.blanks) return t.params === job.fields.length ? null : `It needs exactly ${job.fields.length} blanks: ${wants}.`;
  const same = t.blanks.length === job.fields.length && t.blanks.every((b, i) => b.field === job.fields[i]);
  return same ? null : `Its blanks must be, in order: ${wants}.`;
}

/* ── Meta's rules for a new template ─────────────────────────────────────────── */

export const NAME_RE = /^[a-z0-9_]{1,60}$/;
export const MAX_BODY = 1024;
export const MAX_BUTTONS = 3;
export const MAX_BUTTON_TEXT = 25;

/** Lowercase_with_underscores from whatever was typed: "Missed call (2)" → "missed_call_2". */
export const toTemplateName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
    .replace(/_+$/, '');

/** The blanks' numbers in the order they appear: "Hi {{1}}, … {{2}}" → [1, 2]. */
export const blanksIn = (body: string) => [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));

export type TemplateDraft = { name: string; category: string; body: string; examples: string[]; buttons: string[] };

/** Everything Meta would reject, in plain words. Empty = good to send. */
export function checkTemplate(d: TemplateDraft): string[] {
  const errs: string[] = [];
  const has = (s: string) => /[a-z0-9]/i.test(s);
  if (!NAME_RE.test(d.name)) errs.push('The name can only have lowercase letters, numbers and _ (60 at most).');
  if (d.category !== 'UTILITY' && d.category !== 'MARKETING') errs.push('Choose Utility or Marketing.');
  const body = d.body.trim();
  if (!body) errs.push('Write the message.');
  if (body.length > MAX_BODY) errs.push(`The message is ${body.length} characters long. WhatsApp allows ${MAX_BODY}.`);
  if (/\{\{(?!\d+\}\})|\{\{\d+\}\}\}/.test(body)) errs.push('Something in the message looks like a blank but isn’t one.');
  const nums = blanksIn(body);
  if (nums.some((n, i) => n !== i + 1)) errs.push('Blanks must be numbered 1, 2, 3… in order, each used once.');
  if (nums.length) {
    const text = body.split(/\{\{\d+\}\}/);
    if (!has(text[0])) errs.push('Start with some words. Meta won’t accept a message that begins with a blank.');
    if (!has(text[text.length - 1])) errs.push('Add some words after the last blank. Meta won’t accept a message that ends with one.');
    if (text.slice(1, -1).some((s) => !s.trim())) errs.push('Put a word or two between blanks. Meta won’t accept two blanks side by side.');
    const words = text.join(' ').split(/\s+/).filter(has).length;
    if (words < nums.length * 2 + 1) errs.push('Too many blanks for such a short message. Add more words or use fewer blanks.');
  }
  if (d.examples.length !== nums.length || d.examples.some((e) => !e.trim())) errs.push('Give an example for every blank. Meta checks them.');
  if (d.examples.some((e) => /[\n\t]/.test(e) || e.length > 200)) errs.push('Each example must be one short line.');
  if (d.buttons.length > MAX_BUTTONS) errs.push(`Up to ${MAX_BUTTONS} quick replies.`);
  if (d.buttons.some((b) => !b.trim())) errs.push('A quick reply is empty. Fill it in or remove it.');
  if (d.buttons.some((b) => b.trim().length > MAX_BUTTON_TEXT)) errs.push(`Quick replies can be ${MAX_BUTTON_TEXT} characters at most.`);
  if (d.buttons.some((b) => /[\n{}]/.test(b))) errs.push('Quick replies can’t have blanks or line breaks.');
  if (new Set(d.buttons.map((b) => b.trim().toLowerCase())).size !== d.buttons.length) errs.push('Two quick replies say the same thing.');
  return errs;
}

/**
 * The "New template" form's message, with fields written as {first_name}, {asked_about}…, turned
 * into Meta's {{1}}, {{2}}… Each use of a field is its own blank. `unknown` = braces that aren't a field.
 */
export function compileBody(text: string): { body: string; fields: FieldKey[]; unknown: string[] } {
  const byToken = new Map(INSERTABLE.map((k) => [FIELDS[k].token!, k]));
  const fields: FieldKey[] = [];
  const unknown: string[] = [];
  const clean = text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (/\{\{/.test(clean)) unknown.push('{{…}}');
  const body = clean.replace(/\{\s*([a-z_ ]+?)\s*\}/gi, (m, tok: string) => {
    const k = byToken.get(tok.toLowerCase().replace(/\s+/g, '_'));
    if (!k) {
      unknown.push(m);
      return m;
    }
    fields.push(k);
    return `{{${fields.length}}}`;
  });
  return { body, fields, unknown };
}

/* ── Showing templates ───────────────────────────────────────────────────────── */

export type TemplateStatus = { label: string; tone: 'ok' | 'wait' | 'bad' | 'off'; help?: string };

export function statusInfo(status: string): TemplateStatus {
  switch (status) {
    case 'APPROVED':
      return { label: 'Approved ✓', tone: 'ok' };
    case 'PENDING':
      return { label: 'Waiting for Meta', tone: 'wait', help: 'Usually a few minutes, sometimes up to a day. This page updates by itself.' };
    case 'IN_APPEAL':
      return { label: 'Waiting for Meta (appeal)', tone: 'wait' };
    case 'REJECTED':
      return { label: 'Rejected', tone: 'bad' };
    case 'PAUSED':
      return {
        label: 'Paused',
        tone: 'wait',
        help: 'Meta paused it because people blocked or reported it. It restarts by itself after a few hours. If it keeps happening, change the wording.',
      };
    case 'DISABLED':
      return { label: 'Disabled', tone: 'bad', help: 'Meta turned it off after pausing it too often. Make a new one with different wording.' };
    case 'PENDING_DELETION':
    case 'DELETED':
      return { label: 'Being deleted', tone: 'off' };
    case 'LIMIT_EXCEEDED':
      return { label: 'Over Meta’s limit', tone: 'bad', help: 'The account has as many templates as Meta allows. Delete ones you don’t use.' };
    default:
      return { label: status ? status[0] + status.slice(1).toLowerCase().replace(/_/g, ' ') : 'Unknown', tone: 'off' };
  }
}

/** Meta's rejection reason in plain words (null when there isn't one). */
export function rejectionText(reason: string | null | undefined): string | null {
  switch (reason || 'NONE') {
    case 'NONE':
      return null;
    case 'INVALID_FORMAT':
      return 'Meta says the format is wrong: usually a blank at the very start or end, two blanks together, or examples that don’t look real.';
    case 'PROMOTIONAL':
      return 'Meta thinks it’s selling something. Send it again as Marketing, or take out anything that sounds like an offer.';
    case 'TAG_CONTENT_MISMATCH':
    case 'INCORRECT_CATEGORY':
      return 'Meta says the wording doesn’t fit the category (e.g. sales wording in a Utility template). Try it as Marketing.';
    case 'ABUSIVE_CONTENT':
      return 'Meta thinks the wording breaks its rules.';
    case 'SCAM':
      return 'Meta flagged it as possibly misleading.';
    default:
      return `Meta’s reason: ${reason!.toLowerCase().replace(/_/g, ' ')}.`;
  }
}

/** Where Meta's own template screens are (to fix a rejected one by hand). */
export const WHATSAPP_MANAGER_URL = 'https://business.facebook.com/wa/manage/message-templates/';

/** Meta's sample template, never worth sending to a customer. */
export const SAMPLE_TEMPLATE = 'hello_world';

/** For the Send template pickers: no sample, and only English (UK / plain English) once a UK one exists. */
export function forUk<T extends { name: string; language: string }>(list: T[]): T[] {
  const real = list.filter((t) => t.name !== SAMPLE_TEMPLATE);
  if (!real.some((t) => t.language === 'en_GB')) return real;
  return real.filter((t) => t.language === 'en_GB' || (t.language === 'en' && !real.some((x) => x.name === t.name && x.language === 'en_GB')));
}

/** A template as the app shows and sends it. */
export type WaTemplate = {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  /** Meta's code, see rejectionText(). */
  rejected: string | null;
  /** GREEN / YELLOW / RED once people have received it. */
  quality: string | null;
  header: string | null;
  body: string;
  footer: string | null;
  buttons: string[];
  params: number;
  /** False when it needs something Heliaxis can't fill (a picture, a link button with a blank…). */
  sendable: boolean;
  /** What fills each blank; null = nobody has said. */
  blanks: Blank[] | null;
};

/** The body with blanks filled in; empty ones show what they're for, in [brackets]. */
export function fillPreview(body: string, values: string[], labels: string[] = []) {
  return body.replace(/\{\{(\d+)\}\}/g, (m, n: string) => values[Number(n) - 1]?.trim() || `[${labels[Number(n) - 1] || `blank ${n}`}]`);
}
