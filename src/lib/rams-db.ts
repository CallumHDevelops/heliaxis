// Everything this site needs in order to write a subcontractor application into
// the RAMS compliance platform's database.
//
// RAMS lives in a DIFFERENT Supabase project from this marketing site, with its
// own schema, its own keys and its own policies. Both projects would otherwise be
// reached through identically named environment variables, so every name here
// carries a RAMS_ prefix and this site's own `createAdminClient()` is never
// reused: a client pointed at the wrong project writes an application into a
// database that has no table to hold it, or lets this site act on the compliance
// platform, and neither failure announces itself.
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// The RAMS project's own client.
// ---------------------------------------------------------------------------

/** Thrown when the RAMS credentials are absent or obviously wrong. */
export class RamsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RamsConfigError';
  }
}

/**
 * Service-role client for the RAMS project. Bypasses RLS entirely, because every
 * policy on `subcontractors` and `subcontractor_insurances` is written around
 * `is_approved(auth.uid())` / `is_manager(auth.uid())` and an applicant has no
 * RAMS account at all — an anon key would be refused by all of them. The RAMS
 * schema is written for exactly this posture: a portal row arrives with a null
 * `auth.uid()`, which is what marks it as typed by nobody logged in.
 *
 * Server-only, and never logged: this key opens the whole compliance platform,
 * so a leak here is a leak of every project, document and signature in RAMS.
 */
export function createRamsClient(): SupabaseClient {
  const url = process.env.RAMS_SUPABASE_URL?.trim();
  const key = process.env.RAMS_SUPABASE_SERVICE_ROLE_KEY?.trim();

  // Named throws rather than `!`. A missing variable otherwise becomes a POST to
  // `https://undefined`, which surfaces as a network error on the applicant's
  // screen hours after a mis-provisioned deploy went out.
  if (!url) throw new RamsConfigError('RAMS_SUPABASE_URL is not set');
  if (!key) throw new RamsConfigError('RAMS_SUPABASE_SERVICE_ROLE_KEY is not set');

  // The two projects are never the same one. Equality means somebody pasted this
  // site's own values under the RAMS names, and failing here beats writing an
  // application into the marketing database and reporting success.
  if (url === process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    throw new RamsConfigError(
      'RAMS_SUPABASE_URL matches NEXT_PUBLIC_SUPABASE_URL — these are two different Supabase projects'
    );
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Where the office can open a row this endpoint created, when it is configured. */
export function ramsRowUrl(subcontractorId: string): string | null {
  const base = process.env.RAMS_APP_URL?.trim().replace(/\/+$/, '');
  return base ? `${base}/subcontractors/${subcontractorId}` : null;
}

// ---------------------------------------------------------------------------
// Limits. These mirror the RAMS bucket exactly, and must stay mirrored.
// ---------------------------------------------------------------------------

export const DOCS_BUCKET = 'subcontractor-docs';

/**
 * The bucket's own `file_size_limit`. Checked here as well as there because
 * Supabase only refuses an oversized object after this route has already
 * buffered the whole request — the applicant would wait for an upload that was
 * never going to be accepted, and the memory would already have been spent.
 */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/**
 * A ceiling on the whole request, enforced from `content-length` before the body
 * is read. `request.formData()` buffers everything at once, so without this an
 * unauthenticated caller decides how much memory this function allocates.
 */
export const MAX_REQUEST_BYTES = 40 * 1024 * 1024;

/** Per group. Six certificates covers every firm the office has ever taken on. */
export const MAX_FILES_PER_GROUP = 6;

/**
 * The bucket's `allowed_mime_types`, verbatim. SVG is absent on purpose: these
 * files are served back to the office from the Supabase origin, where an SVG can
 * carry script. Word, Excel, PowerPoint, video and audio are absent because the
 * bucket refuses them, so offering them only produces a late, baffling failure.
 */
export const ACCEPTED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/avif',
  'image/tiff',
  'image/bmp',
] as const;

/** Mirrors the closed check constraint on `subcontractor_insurances.kind`. */
export const INSURANCE_KINDS = [
  'public_liability',
  'employers_liability',
  'professional_indemnity',
  'contractors_all_risks',
  'product_liability',
  'motor_fleet',
  'other',
] as const;

export type InsuranceKind = (typeof INSURANCE_KINDS)[number];

export const INSURANCE_LABELS: Record<InsuranceKind, string> = {
  public_liability: 'Public Liability',
  employers_liability: "Employers' Liability",
  professional_indemnity: 'Professional Indemnity',
  contractors_all_risks: 'Contractors All Risks',
  product_liability: 'Product Liability',
  motor_fleet: 'Motor Fleet',
  other: 'Other',
};

/**
 * How many portal rows may be created across the whole site in one hour, and how
 * many may carry one email address. Counted in the database rather than in
 * memory: this function is serverless, so an in-process tally resets on every
 * cold start and an attacker only has to wait for one. The thing being protected
 * is the unreviewed-applications list the office works from, and these cap
 * precisely that.
 */
export const MAX_PORTAL_ROWS_PER_HOUR = 20;
export const MAX_PORTAL_ROWS_PER_EMAIL_PER_HOUR = 3;

/** How far back an unreviewed application still counts as the same one. */
export const DEDUPE_WINDOW_DAYS = 30;

/**
 * How much cover one unreviewed firm may accumulate before the portal stops
 * accepting more against it. Adding documents to an application already on file
 * creates no new row, so the hourly row count cannot see it: without this cap
 * somebody who knows a pending applicant's email address could keep uploading
 * against that firm indefinitely. Twelve is two full submissions' worth.
 */
export const MAX_INSURANCES_PER_FIRM = 12;

// ---------------------------------------------------------------------------
// Validation. Authoritative: the form's own schema runs in the browser and is a
// courtesy to somebody filling it in, not a control over what arrives here.
// ---------------------------------------------------------------------------

const trimmed = (max: number) => z.string().trim().max(max);
/**
 * An answer that may be left blank, stored as null rather than an empty string so
 * that "not given" and "given as nothing" are the same thing in the column.
 *
 * Deliberately NOT `.catch()`ed: an answer over the cap is refused and the
 * applicant is told, rather than being quietly replaced with null. Swallowing it
 * would drop what somebody typed without telling them and leave the office a
 * record with a hole in it that nobody can account for.
 */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .transform((v) => v || null)
    .nullable()
    .default(null);

/** `YYYY-MM-DD` from a date input, round-tripped so 2025-02-31 cannot pass. */
const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be in YYYY-MM-DD form')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'That is not a real date');

/**
 * Sum insured in whole pounds, which is how the column stores it. Commas, spaces
 * and a pound sign are stripped because that is how the figure is written on the
 * certificate being copied from; anything else is refused rather than guessed at,
 * since a misread sum insured is the number a principal contractor relies on.
 */
const coverAmount = z
  .string()
  .trim()
  .transform((v) => v.replace(/[£,\s]/g, ''))
  .refine((v) => v === '' || /^\d{1,12}$/.test(v), 'Enter the sum insured in whole pounds')
  .transform((v) => (v === '' ? null : Number(v)));

export const insuranceEntrySchema = z.object({
  kind: z.enum(INSURANCE_KINDS),
  insurer: trimmed(120).min(2, 'Name the insurer on each certificate'),
  policyNumber: trimmed(100).min(1, 'Give the policy number on each certificate'),
  coverAmount,
  // Optional, and the one field here that is allowed to be absent: a certificate
  // that states only an expiry is still worth recording. Not `.catch`ed, though —
  // a start date that does not parse is refused rather than quietly dropped,
  // because a date silently missing from a compliance record is indistinguishable
  // from one that was never on the certificate.
  issueDate: z.union([isoDate, z.literal(''), z.null()]).transform((v) => v || null),
  // Required, and the one field here with no sensible default. A policy with no
  // expiry cannot be checked by anybody later: it never raises a renewal badge,
  // it is never caught by the expiry index, and it is copied onto a RAMS without
  // the platform being able to say whether it was live on the day. Checked for
  // presence before shape, so a blank field is answered with what is missing
  // rather than with a lecture about date formats.
  expiryDate: z
    .string()
    .trim()
    .min(1, 'Give the expiry date — without it nobody can check this cover later')
    .pipe(isoDate),
});

export type InsuranceEntry = z.infer<typeof insuranceEntrySchema>;

export const applicationSchema = z.object({
  companyName: trimmed(100).min(2, 'Give the registered company name'),
  fullName: trimmed(100).min(2, 'Give a contact name'),
  contactNumber: trimmed(30).min(7, 'Give a contact number'),
  // Lowercased here so that one normalised value serves the insert, both
  // duplicate checks and the reply address. The checks match on it with `eq`
  // rather than `ilike`: an underscore is a legal character in an email local
  // part and a single-character wildcard in LIKE, so an ilike match on an
  // address the applicant chose could land their documents on another firm's
  // unreviewed application and hand them its reference.
  email: z
    .email('Give an email address the office can reply to')
    .max(160)
    .transform((v) => v.toLowerCase()),
  businessAddress: trimmed(500).min(10, 'Give the registered business address'),
  // Separate from the address rather than cut off the end of it: the office
  // searches on it, and a postcode guessed from free text is worse than none.
  postcode: trimmed(12).min(5, 'Give the postcode of the registered address'),
  businessRegNumber: trimmed(50).min(4, 'Give the company registration number'),
  vatNumber: optionalText(50, 'The VAT number'),
  cisNumber: optionalText(50, 'The CIS number'),
  // What the office filters the subcontractor book on when it is choosing a firm
  // for a job, so it is asked for rather than inferred.
  trades: trimmed(200).min(2, 'Say what trades the firm carries out'),
  paymentTerms: z.enum(['14 Day', '30 Day']),
  additionalInfo: optionalText(1000, 'Additional information'),
  // Collected and sent to the office, never written to RAMS. See notesFor().
  bankDetails: trimmed(500).min(10, 'Give the bank name, account number and sort code'),
  sendEmailReceipt: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  // Generated in the applicant's browser and posted back unchanged. This is what
  // makes a retry safe: the column is uniquely indexed, so a resubmission of the
  // same form lands on the row that is already there instead of giving the office
  // two unreviewed firms to compare.
  submissionId: z
    .string()
    .trim()
    .regex(/^[0-9a-f-]{36}$/i, 'Reload the page and submit again'),
});

export type Application = z.infer<typeof applicationSchema>;

// ---------------------------------------------------------------------------
// Files.
// ---------------------------------------------------------------------------

/**
 * What the first bytes of the file actually say it is. `file.type` is whatever a
 * caller chose to put in the multipart part, so it decides nothing on its own: a
 * hand-built request can label an executable `application/pdf`, and these files
 * are opened later by the office.
 */
export function sniffMime(bytes: Uint8Array): string | null {
  const at = (i: number) => bytes[i];
  const ascii = (start: number, len: number) =>
    String.fromCharCode(...Array.from(bytes.slice(start, start + len)));

  if (bytes.length < 12) return null;
  if (ascii(0, 5) === '%PDF-') return 'application/pdf';
  if (at(0) === 0x89 && ascii(1, 3) === 'PNG') return 'image/png';
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  if (ascii(0, 4) === 'GIF8') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  if (ascii(0, 2) === 'BM') return 'image/bmp';
  if (ascii(0, 4) === 'II*\u0000' || ascii(0, 4) === 'MM\u0000*') return 'image/tiff';
  // HEIC, HEIF and AVIF are all ISO base media files; the brand inside the first
  // box is the only thing that separates them, and the bucket accepts all three.
  if (ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4);
    if (brand.startsWith('hei') || brand === 'mif1' || brand === 'msf1') return 'image/heic';
    if (brand.startsWith('av0') || brand.startsWith('avi')) return 'image/avif';
  }
  return null;
}

/** True when a sniffed type may stand in for the declared one. */
function typesAgree(declared: string, sniffed: string): boolean {
  if (declared === sniffed) return true;
  // The bucket treats these three as distinct types but they share one container,
  // so a sniff cannot tell a declared HEIF from a declared HEIC.
  const heif = ['image/heic', 'image/heif', 'image/avif'];
  return heif.includes(declared) && heif.includes(sniffed);
}

export type CheckedFile = { name: string; type: string; bytes: Uint8Array };

/**
 * Refuses a file rather than storing it and sorting it out later. Returns the
 * reason in words the applicant can act on, because the only person who can fix
 * a wrong file is the one who chose it.
 */
export function checkFile(
  name: string,
  declaredType: string,
  bytes: Uint8Array
): { ok: true; file: CheckedFile } | { ok: false; reason: string } {
  if (bytes.length === 0) return { ok: false, reason: 'is empty' };
  if (bytes.length > MAX_FILE_BYTES) {
    return { ok: false, reason: 'is larger than the 15 MB limit' };
  }

  const declared = declaredType.split(';')[0].trim().toLowerCase();
  if (!(ACCEPTED_MIME as readonly string[]).includes(declared)) {
    return { ok: false, reason: 'is not a PDF or an image' };
  }

  const sniffed = sniffMime(bytes);
  if (!sniffed) return { ok: false, reason: 'could not be read as a PDF or an image' };
  if (!typesAgree(declared, sniffed)) {
    return { ok: false, reason: 'does not contain what its file name claims' };
  }

  return { ok: true, file: { name, type: declared, bytes } };
}

/**
 * The object key for one document. The file name is attacker-chosen and can
 * carry `../`, a NUL or the shape of somebody else's key, so it never appears in
 * a key unsanitised — and because the service-role key bypasses every storage
 * policy on the bucket, this function is the only thing standing between a
 * crafted name and an arbitrary object in a bucket that also holds managers'
 * uploads. The firm's id leads, which both satisfies the bucket's folder rule and
 * gives the office one folder per firm.
 */
export function documentKey(subcontractorId: string, fileName: string): string {
  const safeName = fileName.replace(/[^\w.\-]+/g, '_').slice(-80) || 'document';
  return `${subcontractorId}/${crypto.randomUUID()}-${safeName}`;
}

// ---------------------------------------------------------------------------
// Reads and writes against the RAMS project.
// ---------------------------------------------------------------------------

export type ExistingApplication = { id: string; company_name: string };

/** The row this exact submission already created, if it is a retry of one POST. */
export async function findBySubmission(
  rams: SupabaseClient,
  submissionId: string
): Promise<ExistingApplication | null> {
  const { data, error } = await rams
    .from('subcontractors')
    .select('id, company_name')
    .eq('portal_submission_id', submissionId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/**
 * An unreviewed application already on file for this email address. Documents
 * from a second submission are added to it rather than creating a second firm:
 * nothing on `subcontractors` is unique on email, so without this every retry,
 * double click and half-finished attempt leaves the office another row to
 * compare against the first.
 */
export async function findOpenApplication(
  rams: SupabaseClient,
  email: string
): Promise<ExistingApplication | null> {
  const since = new Date(Date.now() - DEDUPE_WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await rams
    .from('subcontractors')
    .select('id, company_name')
    .eq('status', 'applied')
    .is('archived_at', null)
    .eq('source', 'portal')
    .eq('email', email)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

/** How many portal rows exist from the last hour, in total and for one address. */
export async function countRecentApplications(
  rams: SupabaseClient,
  email: string
): Promise<{ total: number; forEmail: number }> {
  const since = new Date(Date.now() - 3_600_000).toISOString();

  const all = rams
    .from('subcontractors')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'portal')
    .gte('created_at', since);

  const mine = rams
    .from('subcontractors')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'portal')
    .eq('email', email)
    .gte('created_at', since);

  const [totalRes, emailRes] = await Promise.all([all, mine]);
  if (totalRes.error) throw totalRes.error;
  if (emailRes.error) throw emailRes.error;
  return { total: totalRes.count ?? 0, forEmail: emailRes.count ?? 0 };
}

/** How much cover is already recorded against a firm. */
export async function countInsurances(
  rams: SupabaseClient,
  subcontractorId: string
): Promise<number> {
  const { count, error } = await rams
    .from('subcontractor_insurances')
    .select('id', { count: 'exact', head: true })
    .eq('subcontractor_id', subcontractorId);
  if (error) throw error;
  return count ?? 0;
}

/**
 * An applicant's own file name, fit to be read back to them. It is never a
 * storage key — see documentKey for that — but it still reaches a notification
 * email and a JSON reply, so its control characters and its tail come off.
 */
export function displayName(name: string): string {
  const flat = name.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return flat.length > 80 ? `${flat.slice(0, 77)}...` : flat || 'a document';
}

/**
 * Everything the applicant said that RAMS has no column for, as one readable
 * block. Payment terms live here because there is no column for them.
 *
 * Bank details are deliberately NOT here. `approved read subcontractors` shows
 * every column of this table to every approved RAMS user, so a sort code folded
 * into `notes` is a sort code on the screen of every member of staff and on
 * anything that prints these notes. They stay in the notification email until
 * the owner decides where they should properly live.
 */
export function notesFor(app: Application, qualifications: CheckedFile[]): string {
  const lines = [
    `Submitted through the subcontractor portal on ${new Date().toISOString().slice(0, 10)}.`,
    `Payment terms requested: ${app.paymentTerms}.`,
    `Portal reference: ${app.submissionId}.`,
  ];
  if (app.additionalInfo) {
    lines.push('', 'What the applicant added:', app.additionalInfo);
  }
  if (qualifications.length > 0) {
    // Trade qualifications have no table of their own in RAMS: the insurance kinds
    // are a closed list with no member for them, and a competency certificate
    // belongs to an operative who does not exist until the firm is taken on. They
    // are filed in the firm's own storage folder and named here, because nothing
    // points at those objects and this note is the only record that they exist.
    lines.push(
      '',
      'Trade qualification documents submitted with this application, filed under',
      'this firm in subcontractor-docs. The notification email names any that did',
      'not arrive:',
      ...qualifications.map((f) => `  - ${f.name}`)
    );
  }
  lines.push(
    '',
    'Bank details were given on the application and are in the notification email only.'
  );
  return lines.join('\n');
}

/**
 * Creates the firm. A strict whitelist: `status`, `approved_at`, `approved_by`
 * and `created_by` are never sent and never taken from the form. `status` is the
 * literal 'applied' and `source` the literal 'portal', written here in the server
 * file so that no payload can reach them — the RAMS guard trigger refuses an
 * insert that arrives already approved, and being refused outright is the signal
 * that something is wrong with this code rather than with the applicant.
 */
export async function insertApplication(
  rams: SupabaseClient,
  app: Application,
  notes: string
): Promise<{ id: string } | { duplicate: true }> {
  const { data, error } = await rams
    .from('subcontractors')
    .insert({
      company_name: app.companyName,
      contact_name: app.fullName,
      email: app.email,
      phone: app.contactNumber,
      address: app.businessAddress,
      postcode: app.postcode.toUpperCase(),
      reg_number: app.businessRegNumber,
      vat_number: app.vatNumber,
      cis_number: app.cisNumber,
      trades: app.trades,
      notes,
      status: 'applied',
      source: 'portal',
      portal_submission_id: app.submissionId,
    })
    .select('id')
    .single();

  // The unique index on portal_submission_id caught a resubmission that arrived
  // while the first was still in flight. The row is already there, so the caller
  // reads it back rather than reporting a failure for work that succeeded.
  if (error?.code === '23505') return { duplicate: true };
  if (error) throw error;
  // Checked rather than assumed. Every object key and every insurance row is
  // built from this id, so an insert that somehow reports success without
  // returning one would file certificates under a folder called "undefined" and
  // hang cover off a row that does not exist. Throwing here sends the caller down
  // the "not recorded" path, which is the truth.
  if (typeof data?.id !== 'string' || data.id === '') {
    throw new Error('the subcontractors insert returned no id');
  }
  return { id: data.id };
}

export async function uploadDocument(
  rams: SupabaseClient,
  subcontractorId: string,
  file: CheckedFile
): Promise<{ path: string } | { failed: true }> {
  const path = documentKey(subcontractorId, file.name);
  const { error } = await rams.storage
    .from(DOCS_BUCKET)
    .upload(path, file.bytes, { contentType: file.type, upsert: false });
  if (error) {
    console.error('subcontractor-docs upload failed', error.message);
    return { failed: true };
  }
  return { path };
}

export async function removeDocument(rams: SupabaseClient, path: string): Promise<void> {
  const { error } = await rams.storage.from(DOCS_BUCKET).remove([path]);
  if (error) console.error('subcontractor-docs cleanup failed', error.message);
}

/**
 * Records one policy as cover with an expiry, not as an attachment. Written even
 * when its certificate did not reach storage: the insurer, the sum insured and
 * the expiry are what a site gate asks about and what raises a renewal badge, so
 * keeping them is worth more than discarding the lot over a missing PDF — and the
 * row's own notes say the file is missing, since this endpoint may not update the
 * firm's record to say so.
 */
export async function insertInsurance(
  rams: SupabaseClient,
  subcontractorId: string,
  entry: InsuranceEntry,
  file: { path: string; name: string } | null
): Promise<boolean> {
  const { error } = await rams.from('subcontractor_insurances').insert({
    subcontractor_id: subcontractorId,
    kind: entry.kind,
    insurer: entry.insurer,
    policy_number: entry.policyNumber,
    cover_amount: entry.coverAmount,
    issue_date: entry.issueDate ?? null,
    expiry_date: entry.expiryDate,
    file_path: file?.path ?? null,
    file_name: file?.name ?? null,
    notes: file
      ? null
      : 'The certificate did not reach storage when this application was submitted. Ask the firm to send it again.',
  });
  if (error) {
    console.error('subcontractor_insurances insert failed', error.code, error.message);
    return false;
  }
  return true;
}
