// The subcontractor portal's submission endpoint.
//
// What changed, and why the shape of this file follows from it: this used to
// email the office and store nothing, so every certificate the owner had ever
// collected lived in an inbox. The RAMS database is now the record and the email
// is a notification. That inverts the old success test — an applicant may only be
// told they are done once a row exists, never because a message was accepted.
//
// It is also an unauthenticated public endpoint that now writes to a production
// compliance database and accepts uploads, so everything that arrives here is
// treated as hostile: the request is sized before it is read, every text field is
// capped server-side, every file is checked against the bucket's own limits and
// sniffed rather than trusted, and the applicant's own text never reaches an
// email header or an object key.
import { NextRequest, NextResponse } from 'next/server';
import { getResendApiKey } from '@/lib/resend';
import {
  type Application,
  type CheckedFile,
  type InsuranceEntry,
  INSURANCE_LABELS,
  MAX_FILES_PER_GROUP,
  MAX_INSURANCES_PER_FIRM,
  MAX_PORTAL_ROWS_PER_EMAIL_PER_HOUR,
  MAX_PORTAL_ROWS_PER_HOUR,
  MAX_REQUEST_BYTES,
  RamsConfigError,
  applicationSchema,
  checkFile,
  countInsurances,
  countRecentApplications,
  createRamsClient,
  displayName,
  findBySubmission,
  findOpenApplication,
  insertApplication,
  insertInsurance,
  insuranceEntrySchema,
  notesFor,
  ramsRowUrl,
  removeDocument,
  uploadDocument,
} from '@/lib/rams-db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' };
const FROM = 'Heliaxis Subcontractors <noreply@heliaxis.co.uk>';
const FALLBACK_ADMIN = 'hello@heliaxis.co.uk';

/** Where the office is told to send documents when nothing could be stored. */
const OFFICE_EMAIL = FALLBACK_ADMIN;

// ---------------------------------------------------------------------------
// Replies. Fixed sentences, chosen here rather than built from whatever a
// database or an upstream service said: a Supabase error carries table, column
// and policy names, and this endpoint answers the public internet.
// ---------------------------------------------------------------------------

type Failure = { code: string; status: number; message: string };

const fail = (code: string, status: number, message: string): Failure => ({ code, status, message });

const NOT_RECORDED = fail(
  'not_recorded',
  503,
  `Your application was not recorded, so there is nothing for the office to review. Please email your details and certificates to ${OFFICE_EMAIL} and somebody will pick them up by hand.`
);

function reply(f: Failure) {
  return NextResponse.json(
    { ok: false, code: f.code, message: f.message },
    { status: f.status, headers: NO_STORE }
  );
}

// ---------------------------------------------------------------------------
// Burst brake. In memory, so it is lost on every cold start and is therefore a
// brake on one caller hammering one warm instance, nothing more. The control that
// survives a restart is the count of portal rows in the RAMS database, applied
// below — and because the applicant's own receipt is only ever sent after a row
// exists, abusing this endpoint to send Heliaxis-branded mail costs a row that
// that count can see.
// ---------------------------------------------------------------------------

const BURST_WINDOW_MS = 10 * 60 * 1000;
const BURST_LIMIT = 5;
const recentByIp = new Map<string, number[]>();

function burstLimited(ip: string): boolean {
  const now = Date.now();
  // Pruned on the way through: this map lives as long as the instance does, and
  // an unbounded one is its own denial of service.
  for (const [key, stamps] of recentByIp) {
    const kept = stamps.filter((t) => now - t < BURST_WINDOW_MS);
    if (kept.length === 0) recentByIp.delete(key);
    else recentByIp.set(key, kept);
  }
  const mine = recentByIp.get(ip) ?? [];
  if (mine.length >= BURST_LIMIT) return true;
  recentByIp.set(ip, [...mine, now]);
  return false;
}

function callerIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  return forwarded.split(',')[0].trim() || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * The page lives on subcontract.heliaxis.co.uk, but the middleware matcher
 * excludes `api`, so without this check the endpoint answers on the main site, on
 * every preview deployment and to any curl. It is not a substitute for the rate
 * limits — a determined caller sets a Host header — but it removes the drive-by
 * and the cross-site form post.
 */
const PORTAL_HOSTS = ['subcontract.heliaxis.co.uk', 'subcontract.localhost'];

function fromPortalHost(request: NextRequest): boolean {
  const permitted = (host: string) => {
    const name = host.split(':')[0].toLowerCase();
    // Matched in full rather than by prefix: `subcontract.` anything would admit
    // a host somebody else owns, and the point of the check is to admit one site.
    if (PORTAL_HOSTS.includes(name)) return true;
    return process.env.NODE_ENV === 'development' && (name === 'localhost' || name === '127.0.0.1');
  };

  if (!permitted(request.headers.get('host') ?? '')) return false;

  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return permitted(new URL(origin).host);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Email.
// ---------------------------------------------------------------------------

/**
 * Escapes at the boundary, on every interpolated value without exception. The
 * office trusts a genuine, DKIM-signed message from its own domain, so an
 * applicant who can plant markup in one can plant a convincing phishing block
 * inside it.
 */
function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Anything bound for a header line loses its line breaks and its tail. */
function headerSafe(value: string, max = 120): string {
  return value.replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

type MailResult = { sent: boolean };

async function sendMail(payload: Record<string, unknown>): Promise<MailResult> {
  const key = getResendApiKey();
  if (!key) {
    console.error('resend key absent — notification not sent');
    return { sent: false };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error('resend rejected the notification', res.status);
      return { sent: false };
    }
    return { sent: true };
  } catch (error) {
    console.error('resend unreachable', error instanceof Error ? error.message : 'unknown');
    return { sent: false };
  }
}

const row = (label: string, value: string | number | null | undefined) =>
  `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;white-space:nowrap">${esc(label)}</td><td style="padding:6px 0;color:#111827">${esc(value || '—')}</td></tr>`;

function adminHtml(opts: {
  app: Application;
  insurances: InsuranceEntry[];
  qualifications: CheckedFile[];
  reference: string | null;
  link: string | null;
  mode: 'created' | 'added' | 'not-recorded';
  warnings: string[];
}): string {
  const { app, insurances, qualifications, reference, link, mode, warnings } = opts;

  const banner =
    mode === 'not-recorded'
      ? `<div style="background:#991b1b;color:#fff;padding:16px 20px"><strong>APPLICATION NOT RECORDED — the database write failed.</strong><br>Nothing is in RAMS and no certificates were stored. Everything the applicant typed is below; the documents are not attached and were not kept. Ask them to send the certificates again.</div>`
      : mode === 'added'
        ? `<div style="background:#92400e;color:#fff;padding:16px 20px"><strong>Documents added to an application already on file.</strong><br>No second firm was created. The existing unreviewed application now carries these certificates.</div>`
        : '';

  const insuranceRows = insurances
    .map(
      (i) => `<tr>
        <td style="padding:6px 12px 6px 0">${esc(INSURANCE_LABELS[i.kind])}</td>
        <td style="padding:6px 12px 6px 0">${esc(i.insurer)}</td>
        <td style="padding:6px 12px 6px 0">${esc(i.policyNumber)}</td>
        <td style="padding:6px 12px 6px 0">${i.coverAmount === null ? '—' : `£${esc(i.coverAmount.toLocaleString('en-GB'))}`}</td>
        <td style="padding:6px 0">${esc(i.expiryDate)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en-GB"><body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#111827">
  <div style="max-width:680px;margin:24px auto;background:#fff">
    ${banner}
    <div style="background:#0f172a;color:#fff;padding:24px 20px">
      <h1 style="margin:0;font-size:20px">Subcontractor application</h1>
      <p style="margin:6px 0 0;opacity:.85">${esc(app.companyName)}</p>
    </div>
    <div style="padding:24px 20px">
      ${reference ? `<p style="margin:0 0 20px"><strong>Reference:</strong> ${esc(reference)}${link ? ` &middot; <a href="${esc(link)}">open in RAMS</a>` : ''}</p>` : ''}
      ${
        warnings.length
          ? `<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;margin:0 0 20px">
               <strong>Needs chasing</strong>
               <ul style="margin:8px 0 0;padding-left:20px">${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
             </div>`
          : ''
      }
      <h2 style="font-size:15px;margin:0 0 8px">Contact</h2>
      <table style="border-collapse:collapse;font-size:14px;margin-bottom:20px">
        ${row('Contact name', app.fullName)}
        ${row('Email', app.email)}
        ${row('Phone', app.contactNumber)}
      </table>
      <h2 style="font-size:15px;margin:0 0 8px">Company</h2>
      <table style="border-collapse:collapse;font-size:14px;margin-bottom:20px">
        ${row('Trades', app.trades)}
        ${row('Address', app.businessAddress)}
        ${row('Postcode', app.postcode.toUpperCase())}
        ${row('Registration no.', app.businessRegNumber)}
        ${row('VAT no.', app.vatNumber)}
        ${row('CIS no.', app.cisNumber)}
      </table>
      <h2 style="font-size:15px;margin:0 0 8px">Insurance declared</h2>
      <table style="border-collapse:collapse;font-size:13px;margin-bottom:20px">
        <tr style="text-align:left;color:#6b7280">
          <th style="padding:0 12px 6px 0">Cover</th><th style="padding:0 12px 6px 0">Insurer</th>
          <th style="padding:0 12px 6px 0">Policy</th><th style="padding:0 12px 6px 0">Sum insured</th>
          <th style="padding:0 0 6px">Expires</th>
        </tr>
        ${insuranceRows}
      </table>
      ${
        qualifications.length
          ? `<h2 style="font-size:15px;margin:0 0 8px">Trade qualifications</h2>
             <p style="font-size:14px;margin:0 0 20px">${qualifications.map((f) => esc(f.name)).join('<br>')}</p>`
          : ''
      }
      <h2 style="font-size:15px;margin:0 0 8px">Payment</h2>
      <table style="border-collapse:collapse;font-size:14px;margin-bottom:20px">
        ${row('Terms requested', app.paymentTerms)}
        ${row('Bank details', app.bankDetails)}
      </table>
      <p style="font-size:12px;color:#6b7280;margin:0">Bank details are sent here and are deliberately not written to RAMS, where every approved user can read them.</p>
      ${app.additionalInfo ? `<h2 style="font-size:15px;margin:20px 0 8px">Additional information</h2><p style="font-size:14px;white-space:pre-wrap;margin:0">${esc(app.additionalInfo)}</p>` : ''}
      <p style="font-size:12px;color:#6b7280;margin:24px 0 0">Certificates are not attached to this message. They are in RAMS against the firm, which is now the record.</p>
    </div>
  </div>
</body></html>`;
}

function receiptHtml(opts: {
  app: Application;
  reference: string;
  warnings: string[];
  added: boolean;
}): string {
  const { app, reference, warnings, added } = opts;
  return `<!DOCTYPE html>
<html lang="en-GB"><body style="margin:0;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;color:#374151">
  <div style="max-width:600px;margin:30px auto;background:#fff">
    <div style="background:#0f172a;color:#fff;padding:28px 24px">
      <h1 style="margin:0;font-size:20px">Your application is with the office</h1>
    </div>
    <div style="padding:28px 24px">
      <p style="margin:0 0 16px">Dear ${esc(app.fullName)},</p>
      <p style="margin:0 0 16px">${added ? `Your documents have been added to the application already on file for ${esc(app.companyName)}.` : `We have recorded the subcontractor application for ${esc(app.companyName)}.`}</p>
      <p style="margin:0 0 16px"><strong>Your reference:</strong> ${esc(reference)}<br>
        <span style="font-size:13px;color:#6b7280">Quote this if you ring or write to us.</span></p>
      ${
        warnings.length
          ? `<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;margin:0 0 16px">
               <strong>Still outstanding</strong>
               <ul style="margin:8px 0 0;padding-left:20px">${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
               <p style="margin:8px 0 0;font-size:13px">Please reply to this email with those files and we will attach them to your application.</p>
             </div>`
          : ''
      }
      <p style="margin:0 0 16px">Somebody will check your details and certificates and come back to you. If anything is missing we will ask.</p>
      <p style="margin:0">Heliaxis</p>
    </div>
    <div style="background:#f9fafb;padding:16px 24px;font-size:12px;color:#6b7280">
      <p style="margin:0">Keep this email for your records. Your bank details are not repeated here.</p>
    </div>
  </div>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Reading the submission.
// ---------------------------------------------------------------------------

type FileSlot = { index: number; file: File };

/**
 * Collects by exact index, never by prefix. `key.startsWith('insuranceDoc')`
 * accepts `insuranceDocAnything`, so a hand-rolled multipart body could carry
 * hundreds of files past a cap that only ever existed in the browser.
 */
function collectFiles(form: FormData, prefix: string): { slots: FileSlot[]; tooMany: boolean } {
  const slots: FileSlot[] = [];
  for (let i = 0; i < MAX_FILES_PER_GROUP; i += 1) {
    const value = form.get(`${prefix}${i}`);
    // An empty part is kept rather than skipped, so that it is reported as an
    // unreadable file rather than silently swelling the count below and being
    // answered with a sentence about attaching fewer documents.
    if (value instanceof File) slots.push({ index: i, file: value });
  }
  // Anything else under this prefix is either beyond the cap or a key this route
  // does not recognise. Either way the submission is not what the form sends.
  let presented = 0;
  for (const key of form.keys()) if (key.startsWith(prefix)) presented += 1;
  return { slots, tooMany: presented > slots.length };
}

type ParsedInsurance = { entry: InsuranceEntry; file: CheckedFile };

// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // A correlation id rather than the applicant's details: this endpoint handles
  // names, addresses, bank details and file names, and none of that belongs in a
  // log that is read by anybody with access to the deployment.
  const trace = crypto.randomUUID().slice(0, 8);

  if (!fromPortalHost(request)) {
    return reply(
      fail(
        'wrong_host',
        403,
        'Applications are only accepted from the subcontractor portal. Open subcontract.heliaxis.co.uk and submit the form there.'
      )
    );
  }

  // Sized before it is read. request.formData() buffers the whole body at once,
  // so without this an unauthenticated caller chooses how much memory this
  // function allocates. A missing length is refused rather than waved through —
  // a browser posting a FormData always sets one, so its absence means the
  // request was not built by the form.
  const declaredLength = Number(request.headers.get('content-length'));
  if (!Number.isFinite(declaredLength) || declaredLength <= 0) {
    return reply(
      fail('no_length', 411, 'That submission could not be read. Open the form again and resubmit.')
    );
  }
  if (declaredLength > MAX_REQUEST_BYTES) {
    return reply(
      fail(
        'too_large',
        413,
        'Those files come to more than 40 MB in total. Remove the largest ones and submit again — each file must be under 15 MB.'
      )
    );
  }

  if (burstLimited(callerIp(request))) {
    return reply(
      fail(
        'rate_limited',
        429,
        `Several applications have already come from this connection. Wait ten minutes and submit again, or email ${OFFICE_EMAIL} if this is urgent.`
      )
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply(
      fail('unreadable', 400, 'That submission could not be read. Open the form again and resubmit.')
    );
  }

  // A field no person sees and no browser fills. A filled one is a bot, and it is
  // told nothing useful about why it was turned away.
  if (String(form.get('companyWebsite') ?? '').trim() !== '') {
    return reply(fail('rejected', 400, 'That submission could not be accepted.'));
  }
  // How long the form was open, measured in the browser against its own clock
  // and sent as a duration. Never a pair of timestamps: the applicant's clock
  // and this one are not the same clock, and subtracting one from the other
  // refused every submission from a device running a few minutes ahead — for
  // ever, and with nothing on the form the applicant could change.
  //
  // Anything missing, unreadable, negative or longer than a day is a
  // measurement rather than a person: an older cached page, a clock moved
  // mid-form, a replayed body. An untrustworthy measurement is not evidence of
  // a bot, so it is let through — the honeypot above and the per-connection
  // limit are what actually stop one, and this only catches a script that posts
  // the instant the page loads.
  const elapsed = Number(form.get('formElapsedMs'));
  const measured = Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 86_400_000;
  if (measured && elapsed < 3000) {
    return reply(
      fail(
        'too_fast',
        400,
        'That came through faster than the form can be filled in. Wait a few seconds and submit it again.'
      )
    );
  }

  const parsed = applicationSchema.safeParse({
    companyName: form.get('companyName') ?? '',
    fullName: form.get('fullName') ?? '',
    contactNumber: form.get('contactNumber') ?? '',
    email: form.get('email') ?? '',
    businessAddress: form.get('businessAddress') ?? '',
    postcode: form.get('postcode') ?? '',
    businessRegNumber: form.get('businessRegNumber') ?? '',
    vatNumber: form.get('vatNumber') ?? '',
    cisNumber: form.get('cisNumber') ?? '',
    trades: form.get('trades') ?? '',
    paymentTerms: form.get('paymentTerms') ?? '',
    additionalInfo: form.get('additionalInfo') ?? '',
    bankDetails: form.get('bankDetails') ?? '',
    sendEmailReceipt: form.get('sendEmailReceipt') ?? 'false',
    submissionId: form.get('submissionId') ?? '',
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return reply(
      fail('invalid', 400, first?.message || 'Some answers are missing or too long. Check the form.')
    );
  }
  const app = parsed.data;

  // --- Documents ------------------------------------------------------------

  const insuranceFiles = collectFiles(form, 'insuranceDoc');
  const qualificationFiles = collectFiles(form, 'qualificationDoc');

  if (insuranceFiles.tooMany || qualificationFiles.tooMany) {
    return reply(
      fail(
        'too_many_files',
        400,
        `That submission carried document fields this form does not use. Attach at most ${MAX_FILES_PER_GROUP} insurance certificates and ${MAX_FILES_PER_GROUP} qualification documents, and submit from the form rather than anywhere else.`
      )
    );
  }
  if (insuranceFiles.slots.length === 0) {
    return reply(
      fail('no_insurance', 400, 'Attach at least one insurance certificate with its details.')
    );
  }

  const insurances: ParsedInsurance[] = [];
  for (const slot of insuranceFiles.slots) {
    const entry = insuranceEntrySchema.safeParse({
      kind: form.get(`insuranceKind${slot.index}`) ?? '',
      insurer: form.get(`insuranceInsurer${slot.index}`) ?? '',
      policyNumber: form.get(`insurancePolicy${slot.index}`) ?? '',
      coverAmount: form.get(`insuranceCover${slot.index}`) ?? '',
      issueDate: form.get(`insuranceIssue${slot.index}`) || null,
      expiryDate: form.get(`insuranceExpiry${slot.index}`) ?? '',
    });
    if (!entry.success) {
      const first = entry.error.issues[0];
      return reply(
        fail(
          'invalid_insurance',
          400,
          `Certificate ${slot.index + 1}: ${first?.message || 'the policy details are incomplete.'}`
        )
      );
    }
    const checked = checkFile(
      slot.file.name,
      slot.file.type,
      new Uint8Array(await slot.file.arrayBuffer())
    );
    if (!checked.ok) {
      return reply(
        fail(
          'bad_file',
          400,
          `Certificate ${slot.index + 1} ${checked.reason}. Attach a PDF or a photo of the certificate, under 15 MB.`
        )
      );
    }
    insurances.push({ entry: entry.data, file: checked.file });
  }

  const qualifications: CheckedFile[] = [];
  for (const slot of qualificationFiles.slots) {
    const checked = checkFile(
      slot.file.name,
      slot.file.type,
      new Uint8Array(await slot.file.arrayBuffer())
    );
    if (!checked.ok) {
      return reply(
        fail(
          'bad_file',
          400,
          `Qualification document ${slot.index + 1} ${checked.reason}. Attach a PDF or a photo, under 15 MB.`
        )
      );
    }
    qualifications.push(checked.file);
  }

  // --- The record -----------------------------------------------------------

  const warnings: string[] = [];
  const entries = insurances.map((i) => i.entry);

  let rams;
  try {
    rams = createRamsClient();
  } catch (error) {
    // A mis-provisioned deploy, not the applicant's doing. The office still hears
    // about it, because being blind during an outage is how an application is
    // lost for good — but nothing is said to the applicant that implies success,
    // and no receipt is sent to an address they chose.
    console.error(`[${trace}] RAMS client unavailable`, error instanceof RamsConfigError ? error.message : error);
    await sendMail({
      from: FROM,
      to: [process.env.ADMIN_EMAIL || FALLBACK_ADMIN],
      subject: headerSafe(`NOT RECORDED — subcontractor application: ${app.companyName}`),
      html: adminHtml({
        app,
        insurances: entries,
        qualifications,
        reference: null,
        link: null,
        mode: 'not-recorded',
        warnings: ['The RAMS database is not reachable from this site. Key this in by hand.'],
      }),
    });
    return reply(NOT_RECORDED);
  }

  let subcontractorId: string;
  let mode: 'created' | 'added' | 'already';

  try {
    // An exact retry of one POST, identified by the token the browser minted.
    // Nothing is rewritten and nothing is uploaded twice: the work already
    // happened, so the applicant is given back the same reference.
    const retry = await findBySubmission(rams, app.submissionId);
    if (retry) {
      return NextResponse.json(
        {
          ok: true,
          stored: true,
          mode: 'already',
          reference: retry.id,
          warnings: [],
          receiptSent: false,
          message:
            'This application is already with the office. Nothing has been sent twice — quote the reference below if you need to add anything.',
        },
        { headers: NO_STORE }
      );
    }

    const counts = await countRecentApplications(rams, app.email);
    if (counts.forEmail >= MAX_PORTAL_ROWS_PER_EMAIL_PER_HOUR) {
      return reply(
        fail(
          'rate_limited',
          429,
          `Several applications have already been received for this email address. The office has them. Reply to the acknowledgement email to add anything else, or write to ${OFFICE_EMAIL}.`
        )
      );
    }
    if (counts.total >= MAX_PORTAL_ROWS_PER_HOUR) {
      return reply(
        fail(
          'rate_limited',
          429,
          `The portal is taking more applications than it can pass on at the moment, so yours has not been recorded. Please try again in an hour, or email your details and certificates to ${OFFICE_EMAIL}.`
        )
      );
    }

    // An unreviewed application already on file for this address. Its documents
    // are added to that firm rather than a second one being created: this
    // endpoint issues no UPDATE to subcontractors under any circumstances, and an
    // insurance row is an insert, so the certificates are kept without the
    // office being handed two unreviewed firms to tell apart.
    const open = await findOpenApplication(rams, app.email);
    if (open) {
      // Adding to a firm already on file writes no new row, so the hourly count
      // above cannot see it. This is the cap that can: without it, anybody who
      // knows a pending applicant's address could keep filing cover against that
      // firm for as long as they liked.
      if ((await countInsurances(rams, open.id)) >= MAX_INSURANCES_PER_FIRM) {
        return reply(
          fail(
            'enough_on_file',
            429,
            `The office already holds a full set of certificates for this email address. Reply to the acknowledgement email with anything further, or write to ${OFFICE_EMAIL}.`
          )
        );
      }
      subcontractorId = open.id;
      mode = 'added';
    } else {
      const created = await insertApplication(rams, app, notesFor(app, qualifications));
      if ('duplicate' in created) {
        // Two copies of the same submission raced. The other one won, so this one
        // reports its reference rather than a failure for work that succeeded.
        const existing = await findBySubmission(rams, app.submissionId);
        if (!existing) throw new Error('submission token collided with no readable row');
        return NextResponse.json(
          {
            ok: true,
            stored: true,
            mode: 'already',
            reference: existing.id,
            warnings: [],
            receiptSent: false,
            message: 'This application is already with the office.',
          },
          { headers: NO_STORE }
        );
      }
      subcontractorId = created.id;
      mode = 'created';
    }
  } catch (error) {
    console.error(`[${trace}] RAMS write failed`, error instanceof Error ? error.message : error);
    await sendMail({
      from: FROM,
      to: [process.env.ADMIN_EMAIL || FALLBACK_ADMIN],
      subject: headerSafe(`NOT RECORDED — subcontractor application: ${app.companyName}`),
      html: adminHtml({
        app,
        insurances: entries,
        qualifications,
        reference: null,
        link: null,
        mode: 'not-recorded',
        warnings: [`The RAMS write was refused. Trace ${trace}. Key this in by hand.`],
      }),
    });
    return reply(NOT_RECORDED);
  }

  // --- Documents, one at a time ---------------------------------------------
  //
  // The row carries the object key, so the row goes first and the objects follow.
  // Sequentially rather than in parallel: all of them are already in memory and
  // sending them at once multiplies the peak for no gain.

  for (const { entry, file } of insurances) {
    const uploaded = await uploadDocument(rams, subcontractorId, file);
    const stored = 'path' in uploaded ? { path: uploaded.path, name: file.name } : null;
    if (!stored) {
      warnings.push(`The ${INSURANCE_LABELS[entry.kind]} certificate did not upload.`);
    }

    // Written either way. The insurer, the sum insured and the expiry are what a
    // site gate asks about and what raises a renewal badge; discarding all of
    // that because one PDF did not arrive loses more than it protects.
    const ok = await insertInsurance(rams, subcontractorId, entry, stored);
    if (!ok) {
      warnings.push(`The ${INSURANCE_LABELS[entry.kind]} policy details could not be saved.`);
      // Nothing points at the object now, so it would sit in a private bucket
      // unreachable and invisible — worse than no file at all.
      if (stored) await removeDocument(rams, stored.path);
    }
  }

  for (const file of qualifications) {
    const uploaded = await uploadDocument(rams, subcontractorId, file);
    if (!('path' in uploaded)) {
      warnings.push(`The qualification document ${displayName(file.name)} did not upload.`);
    }
  }

  // --- Notification ---------------------------------------------------------

  const link = ramsRowUrl(subcontractorId);
  const adminSubject = headerSafe(
    `${mode === 'added' ? 'Documents added' : 'New subcontractor'}: ${app.companyName}`
  );

  const adminMail = await sendMail({
    from: FROM,
    to: [process.env.ADMIN_EMAIL || FALLBACK_ADMIN],
    subject: adminSubject,
    html: adminHtml({
      app,
      insurances: entries,
      qualifications,
      reference: subcontractorId,
      link,
      mode,
      warnings,
    }),
    // The applicant's address, and only after it parsed as one — the office
    // pressing Reply must not be steered to a lookalike domain. It is a value in
    // a JSON body over HTTPS, so a line break in it cannot forge a header, but it
    // can still choose where a reply goes.
    reply_to: app.email,
  });

  if (!adminMail.sent) {
    // The record exists, so the applicant is told the truth: they are done. The
    // office finds the row in the RAMS subcontractors list, which is exactly the
    // backstop that no longer relying on an inbox buys. Returning a failure here
    // would send them round again and leave a second unreviewed firm behind.
    console.error(`[${trace}] notification email failed for ${subcontractorId}`);
  }

  // Only ever after a row exists, and only to the address on that row. That is
  // what stops this endpoint being an open relay for Heliaxis-branded mail: abuse
  // now costs a row the office can see and the hourly count can refuse.
  let receiptSent = false;
  if (app.sendEmailReceipt) {
    const receipt = await sendMail({
      from: FROM,
      to: [app.email],
      subject: headerSafe(`Your subcontractor application — reference ${subcontractorId}`),
      html: receiptHtml({ app, reference: subcontractorId, warnings, added: mode === 'added' }),
    });
    receiptSent = receipt.sent;
  }

  console.log(`[${trace}] application ${mode} ${subcontractorId} warnings=${warnings.length}`);

  return NextResponse.json(
    {
      ok: true,
      stored: true,
      mode,
      reference: subcontractorId,
      warnings,
      receiptSent,
      message:
        mode === 'added'
          ? 'Your documents have been added to the application already on file for this email address.'
          : 'Your application has been recorded and is with the office.',
    },
    { headers: NO_STORE }
  );
}
