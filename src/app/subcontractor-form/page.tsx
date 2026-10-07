'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// These limits are the RAMS storage bucket's own, not this form's preference: a
// file outside them is refused by the bucket after the whole upload has been
// spent, so advertising anything wider only produces a late, baffling failure.
// They are repeated here rather than imported because the module that writes to
// RAMS is server-only and must never be pulled into the browser bundle — the
// authoritative copy of every rule below is in src/lib/rams-db.ts.
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 6;
const ACCEPTED_MIME = [
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
];
const ACCEPT_ATTR = ACCEPTED_MIME.join(',');

/** Mirrors the closed check constraint on subcontractor_insurances.kind. */
const INSURANCE_KINDS = [
  { value: 'public_liability', label: 'Public Liability' },
  { value: 'employers_liability', label: "Employers' Liability" },
  { value: 'professional_indemnity', label: 'Professional Indemnity' },
  { value: 'contractors_all_risks', label: 'Contractors All Risks' },
  { value: 'product_liability', label: 'Product Liability' },
  { value: 'motor_fleet', label: 'Motor Fleet' },
  { value: 'other', label: 'Other' },
] as const;

// The browser's copy of the rules, so somebody filling the form in is told about
// a problem before they wait for an upload. The server validates all of this
// again and is the only thing that decides what is stored.
const formSchema = z.object({
  companyName: z
    .string()
    .min(2, 'Company name must be at least 2 characters')
    .max(100, 'Company name must not exceed 100 characters'),

  fullName: z
    .string()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must not exceed 100 characters'),

  contactNumber: z
    .string()
    .min(7, 'Contact number must be at least 7 digits')
    .max(30, 'Contact number must not exceed 30 characters')
    .regex(/^[0-9+\s()-]+$/, 'Invalid phone number format'),

  email: z.email('Please enter a valid email address').max(160, 'Email must not exceed 160 characters'),

  businessAddress: z
    .string()
    .min(10, 'Business address must be at least 10 characters')
    .max(500, 'Business address must not exceed 500 characters'),

  postcode: z
    .string()
    .min(5, 'Please give the postcode of the registered address')
    .max(12, 'That does not look like a postcode'),

  businessRegNumber: z
    .string()
    .min(4, 'Business registration number must be at least 4 characters')
    .max(50, 'Business registration number must not exceed 50 characters'),

  vatNumber: z.string().max(50, 'VAT number must not exceed 50 characters').optional().or(z.literal('')),

  cisNumber: z.string().max(50, 'CIS number must not exceed 50 characters').optional().or(z.literal('')),

  trades: z
    .string()
    .min(2, 'Please say what trades the firm carries out')
    .max(200, 'Trades must not exceed 200 characters'),

  bankDetails: z
    .string()
    .min(10, 'Bank details must be at least 10 characters')
    .max(500, 'Bank details must not exceed 500 characters'),

  paymentTerms: z.enum(['14 Day', '30 Day']),

  additionalInfo: z
    .string()
    .max(1000, 'Additional information must not exceed 1000 characters')
    .optional()
    .or(z.literal('')),

  sendEmailReceipt: z.boolean().catch(false),
});

type SubcontractorFormData = z.infer<typeof formSchema>;

type InsuranceRow = {
  key: string;
  kind: string;
  insurer: string;
  policyNumber: string;
  coverAmount: string;
  issueDate: string;
  expiryDate: string;
  file: File | null;
};

type Outcome = {
  mode: 'created' | 'added' | 'already';
  reference: string;
  warnings: string[];
  receiptSent: boolean;
  message: string;
};

const emptyRow = (key: string): InsuranceRow => ({
  key,
  kind: '',
  insurer: '',
  policyNumber: '',
  coverAmount: '',
  issueDate: '',
  expiryDate: '',
  file: null,
});

/** Shared by both file inputs, and deliberately the same test the server makes. */
function fileProblem(file: File): string | null {
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name} is larger than the 15 MB limit.`;
  // A browser cannot always type a file it has just been handed, and the bucket
  // refuses an untyped upload exactly as it refuses a wrong one.
  if (!ACCEPTED_MIME.includes(file.type)) {
    return `${file.name} is not a PDF or an image. Attach a PDF or a photo of the document.`;
  }
  return null;
}

const INPUT_BASE =
  'w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition';

/**
 * How long the form has been open, measured end to end in the browser.
 *
 * Both readings come off the same clock, so what the server receives is a
 * duration rather than two machines' opinions of the time. It has no way to know
 * how far an applicant's phone is from its own, and subtracting one from the
 * other refused every submission from a device running a few minutes ahead —
 * permanently, and with nothing on the form the applicant could change.
 *
 * Outside the component because reading a clock is not something React allows
 * while rendering; it is only ever called from the submit handler.
 */
function elapsedSince(openedAt: number): number {
  return Date.now() - openedAt;
}

export default function SubcontractorOnboarding() {
  const [rows, setRows] = useState<InsuranceRow[]>([emptyRow('ins-0')]);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [qualificationDocs, setQualificationDocs] = useState<File[]>([]);
  const [qualificationError, setQualificationError] = useState('');
  const [insuranceError, setInsuranceError] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  // The honeypot's value has to be read back, or the field catches nothing: this
  // form builds its own body rather than letting the browser serialise the DOM.
  const [honeypot, setHoneypot] = useState('');

  // Minted once per mount and held across every retry of the same application.
  // The server keys its duplicate check on it, which is the only thing that makes
  // a retry safe: a submission whose row was written and whose email then failed
  // would otherwise leave the office two unreviewed firms to compare.
  const [submissionId] = useState(() => crypto.randomUUID());

  // When this form reached the browser, read once at hydration. It never leaves
  // here: what is sent is the elapsed time computed against it below, so both
  // readings come off the same clock. A phone running a few minutes ahead of the
  // server would otherwise look as though it had answered the form before it was
  // served, and be refused on every attempt with nothing the applicant could
  // change.
  const [openedAt] = useState(() => Date.now());

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SubcontractorFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyName: '',
      fullName: '',
      contactNumber: '',
      email: '',
      businessAddress: '',
      postcode: '',
      businessRegNumber: '',
      vatNumber: '',
      cisNumber: '',
      trades: '',
      bankDetails: '',
      paymentTerms: '14 Day',
      additionalInfo: '',
      sendEmailReceipt: false,
    },
  });

  const patchRow = (key: string, patch: Partial<InsuranceRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setRowErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const addRow = () => {
    if (rows.length >= MAX_FILES) return;
    // Keyed on a uuid rather than an index, so removing a block in the middle
    // does not make React reuse the wrong block's file input. Minted in the click
    // handler, never during render: the key reaches the DOM as an input id, and
    // one value on the server and another in the browser is a hydration mismatch.
    setRows((prev) => [...prev, emptyRow(crypto.randomUUID())]);
    setInsuranceError('');
  };

  const removeRow = (key: string) => {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.key !== key)));
  };

  const onRowFile = (key: string, input: HTMLInputElement) => {
    const file = input.files?.[0] ?? null;
    if (!file) {
      patchRow(key, { file: null });
      return;
    }
    const problem = fileProblem(file);
    if (problem) {
      input.value = '';
      setRows((prev) => prev.map((r) => (r.key === key ? { ...r, file: null } : r)));
      setRowErrors((prev) => ({ ...prev, [key]: problem }));
      return;
    }
    patchRow(key, { file });
  };

  const onQualificationFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files || []);
    const problems = chosen.map(fileProblem).filter((p): p is string => p !== null);
    if (problems.length > 0) {
      setQualificationError(problems[0]);
      e.target.value = '';
      return;
    }
    const combined = [...qualificationDocs, ...chosen];
    if (combined.length > MAX_FILES) {
      setQualificationError(`Attach at most ${MAX_FILES} qualification documents.`);
      e.target.value = '';
      return;
    }
    setQualificationError('');
    setQualificationDocs(combined);
    e.target.value = '';
  };

  /** Everything the server will insist on, checked before anything is uploaded. */
  const validateRows = (): boolean => {
    const next: Record<string, string> = {};
    rows.forEach((r, index) => {
      if (!r.file) next[r.key] = `Attach the certificate for insurance ${index + 1}.`;
      else if (!r.kind) next[r.key] = 'Choose which cover this certificate is for.';
      else if (r.insurer.trim().length < 2) next[r.key] = 'Name the insurer on the certificate.';
      else if (r.policyNumber.trim().length < 1) next[r.key] = 'Give the policy number.';
      else if (!r.expiryDate) next[r.key] = 'Give the expiry date — without it nobody can check this cover later.';
      else if (r.coverAmount.trim() && !/^\d{1,12}$/.test(r.coverAmount.replace(/[£,\s]/g, '')))
        next[r.key] = 'Give the sum insured in whole pounds, or leave it blank.';
    });
    setRowErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (data: SubcontractorFormData) => {
    setErrorMessage('');
    setInsuranceError('');

    if (rows.length === 0) {
      setInsuranceError('Add at least one insurance certificate.');
      return;
    }
    if (!validateRows()) return;

    const body = new window.FormData();
    body.append('companyName', data.companyName);
    body.append('fullName', data.fullName);
    body.append('contactNumber', data.contactNumber);
    body.append('email', data.email);
    body.append('businessAddress', data.businessAddress);
    body.append('postcode', data.postcode);
    body.append('businessRegNumber', data.businessRegNumber);
    body.append('vatNumber', data.vatNumber || '');
    body.append('cisNumber', data.cisNumber || '');
    body.append('trades', data.trades);
    body.append('bankDetails', data.bankDetails);
    body.append('paymentTerms', data.paymentTerms);
    body.append('additionalInfo', data.additionalInfo || '');
    body.append('sendEmailReceipt', String(data.sendEmailReceipt));
    body.append('submissionId', submissionId);
    // Sent raw, a negative value from a clock changed mid-form included: the
    // server decides what it can trust, and clamping it here would turn a
    // measurement it should discard into a figure that reads as instant.
    body.append('formElapsedMs', String(elapsedSince(openedAt)));
    body.append('companyWebsite', honeypot);

    // Indexed field names, matched exactly on the server. The metadata travels
    // beside its own certificate so each policy lands as cover with an insurer,
    // a sum insured and an expiry rather than as an unlabelled attachment.
    rows.forEach((r, index) => {
      if (!r.file) return;
      body.append(`insuranceDoc${index}`, r.file);
      body.append(`insuranceKind${index}`, r.kind);
      body.append(`insuranceInsurer${index}`, r.insurer);
      body.append(`insurancePolicy${index}`, r.policyNumber);
      body.append(`insuranceCover${index}`, r.coverAmount);
      body.append(`insuranceIssue${index}`, r.issueDate);
      body.append(`insuranceExpiry${index}`, r.expiryDate);
    });

    qualificationDocs.forEach((file, index) => {
      body.append(`qualificationDoc${index}`, file);
    });

    try {
      const response = await fetch('/api/subcontractor', { method: 'POST', body });
      const result = await response.json();

      // The record is the row in the office's database, so only the server saying
      // it stored one counts as submitted. Nothing here is reset on a failure: the
      // chosen files are still attached, so a retry costs nothing.
      if (!response.ok || !result?.ok) {
        setErrorMessage(
          typeof result?.message === 'string' && result.message
            ? result.message
            : 'Your application was not recorded. Please email your details and certificates to hello@heliaxis.co.uk.'
        );
        return;
      }

      setOutcome({
        mode: result.mode === 'added' || result.mode === 'already' ? result.mode : 'created',
        reference: String(result.reference ?? ''),
        warnings: Array.isArray(result.warnings) ? result.warnings.map(String) : [],
        receiptSent: result.receiptSent === true,
        message: typeof result.message === 'string' ? result.message : '',
      });
    } catch {
      setErrorMessage(
        'Your application could not be sent, so it was not recorded. Check your connection and submit again, or email hello@heliaxis.co.uk.'
      );
    }
  };

  return (
    <>
      <section className="relative min-h-screen flex items-center pt-10">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=1920&h=1080&fit=crop"
            alt="Professional construction and installation team"
            fill
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-heliaxis-navy/85" />
        </div>

        <div className="container mx-auto px-4 lg:px-8 py-20 relative z-10">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <Badge className="bg-heliaxis-gold/20 text-heliaxis-gold border-heliaxis-gold/30 mb-6">
                Partner with Us
              </Badge>
              <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
                Subcontractor <span className="text-heliaxis-gold">Onboarding</span>
              </h1>
              <p className="text-lg text-white/80 leading-relaxed mb-8">
                Join our network of trusted subcontractors. Complete the form below to begin your
                partnership with Heliaxis.
              </p>
            </div>

            <Card className="p-8 shadow-2xl bg-white/95 backdrop-blur">
              {outcome ? (
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {outcome.mode === 'already'
                      ? 'This application is already with the office'
                      : outcome.mode === 'added'
                        ? 'Your documents have been added'
                        : 'Your application has been recorded'}
                  </h2>
                  <p className="text-gray-700">{outcome.message}</p>
                  <div className="bg-gray-50 border border-gray-200 rounded-md px-4 py-3">
                    <p className="text-sm text-gray-600">Your reference</p>
                    <p className="font-mono text-sm text-gray-900 break-all">{outcome.reference}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      Quote this if you ring or write to us.
                    </p>
                  </div>

                  {outcome.warnings.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3">
                      <p className="font-medium text-amber-900">Some documents did not arrive</p>
                      <ul className="list-disc pl-5 mt-2 text-sm text-amber-900 space-y-1">
                        {outcome.warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                      <p className="text-sm text-amber-900 mt-2">
                        Your application is recorded and the rest of it is with the office. Please
                        email those files to hello@heliaxis.co.uk, quoting the reference above, and
                        they will be attached to it. Do not submit the form again — it would record
                        your other certificates twice.
                      </p>
                    </div>
                  )}

                  {outcome.warnings.length === 0 && outcome.mode !== 'already' && (
                    <p className="text-gray-700">
                      Somebody will check your details and certificates and come back to you.
                    </p>
                  )}

                  <p className="text-sm text-gray-600">
                    {outcome.receiptSent
                      ? 'A confirmation email has been sent to the address you gave.'
                      : 'No confirmation email was sent. Your application is recorded either way.'}
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  {/* Not shown to anybody and not filled by any browser. A value in
                      it is a bot, and the server turns that submission away. */}
                  <input
                    type="text"
                    name="companyWebsite"
                    tabIndex={-1}
                    autoComplete="off"
                    className="hidden"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                  />

                  {/* 1. Company Name */}
                  <div>
                    <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-2">
                      1. Company Name <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      id="companyName"
                      {...register('companyName')}
                      placeholder="Enter your answer"
                      className={`${INPUT_BASE} ${errors.companyName ? 'border-red-500' : 'border-gray-300'}`}
                    />
                    {errors.companyName && (
                      <p className="mt-1 text-sm text-red-600">{errors.companyName.message}</p>
                    )}
                  </div>

                  {/* 2. Full Name */}
                  <div>
                    <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
                      2. Full Name <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      id="fullName"
                      {...register('fullName')}
                      placeholder="Enter your answer"
                      className={`${INPUT_BASE} ${errors.fullName ? 'border-red-500' : 'border-gray-300'}`}
                    />
                    {errors.fullName && (
                      <p className="mt-1 text-sm text-red-600">{errors.fullName.message}</p>
                    )}
                  </div>

                  {/* 3. Contact Number */}
                  <div>
                    <label htmlFor="contactNumber" className="block text-sm font-medium text-gray-700 mb-2">
                      3. Contact Number <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="tel"
                      id="contactNumber"
                      {...register('contactNumber')}
                      placeholder="Enter your answer"
                      className={`${INPUT_BASE} ${errors.contactNumber ? 'border-red-500' : 'border-gray-300'}`}
                    />
                    {errors.contactNumber && (
                      <p className="mt-1 text-sm text-red-600">{errors.contactNumber.message}</p>
                    )}
                  </div>

                  {/* 4. Email Address */}
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                      4. Email Address <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="email"
                      id="email"
                      {...register('email')}
                      placeholder="Enter your answer"
                      className={`${INPUT_BASE} ${errors.email ? 'border-red-500' : 'border-gray-300'}`}
                    />
                    {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
                  </div>

                  {/* 5. Registered Business Address */}
                  <div>
                    <label htmlFor="businessAddress" className="block text-sm font-medium text-gray-700 mb-2">
                      5. Registered Business Address <span className="text-red-600">*</span>
                    </label>
                    <textarea
                      id="businessAddress"
                      {...register('businessAddress')}
                      placeholder="Enter your answer"
                      rows={3}
                      className={`${INPUT_BASE} resize-none ${errors.businessAddress ? 'border-red-500' : 'border-gray-300'}`}
                    />
                    {errors.businessAddress && (
                      <p className="mt-1 text-sm text-red-600">{errors.businessAddress.message}</p>
                    )}
                  </div>

                  {/* 6. Postcode — asked for separately because the office searches on
                      it, and a postcode guessed off the end of an address is worse
                      than none. */}
                  <div>
                    <label htmlFor="postcode" className="block text-sm font-medium text-gray-700 mb-2">
                      6. Postcode of the Registered Address <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      id="postcode"
                      {...register('postcode')}
                      placeholder="e.g. BS1 4DJ"
                      autoComplete="postal-code"
                      className={`${INPUT_BASE} ${errors.postcode ? 'border-red-500' : 'border-gray-300'}`}
                    />
                    {errors.postcode && (
                      <p className="mt-1 text-sm text-red-600">{errors.postcode.message}</p>
                    )}
                  </div>

                  {/* 7. Business Registration Number */}
                  <div>
                    <label htmlFor="businessRegNumber" className="block text-sm font-medium text-gray-700 mb-2">
                      7. Business Registration Number <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      id="businessRegNumber"
                      {...register('businessRegNumber')}
                      placeholder="Enter your answer"
                      className={`${INPUT_BASE} ${errors.businessRegNumber ? 'border-red-500' : 'border-gray-300'}`}
                    />
                    {errors.businessRegNumber && (
                      <p className="mt-1 text-sm text-red-600">{errors.businessRegNumber.message}</p>
                    )}
                  </div>

                  {/* 8. VAT Number */}
                  <div>
                    <label htmlFor="vatNumber" className="block text-sm font-medium text-gray-700 mb-2">
                      8. VAT Number
                    </label>
                    <input
                      type="text"
                      id="vatNumber"
                      {...register('vatNumber')}
                      placeholder="Enter your answer"
                      className={`${INPUT_BASE} ${errors.vatNumber ? 'border-red-500' : 'border-gray-300'}`}
                    />
                    {errors.vatNumber && (
                      <p className="mt-1 text-sm text-red-600">{errors.vatNumber.message}</p>
                    )}
                  </div>

                  {/* 9. CIS Number */}
                  <div>
                    <label htmlFor="cisNumber" className="block text-sm font-medium text-gray-700 mb-2">
                      9. CIS Number (If applicable)
                    </label>
                    <input
                      type="text"
                      id="cisNumber"
                      {...register('cisNumber')}
                      placeholder="Enter your answer"
                      className={`${INPUT_BASE} ${errors.cisNumber ? 'border-red-500' : 'border-gray-300'}`}
                    />
                    {errors.cisNumber && (
                      <p className="mt-1 text-sm text-red-600">{errors.cisNumber.message}</p>
                    )}
                  </div>

                  {/* 10. Trades — what the office filters the subcontractor book on
                      when it is choosing a firm for a job. */}
                  <div>
                    <label htmlFor="trades" className="block text-sm font-medium text-gray-700 mb-2">
                      10. Trades Carried Out <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      id="trades"
                      {...register('trades')}
                      placeholder="e.g. scaffolding, roofing, electrical testing"
                      className={`${INPUT_BASE} ${errors.trades ? 'border-red-500' : 'border-gray-300'}`}
                    />
                    {errors.trades && <p className="mt-1 text-sm text-red-600">{errors.trades.message}</p>}
                  </div>

                  {/* 11. Bank Details */}
                  <div>
                    <label htmlFor="bankDetails" className="block text-sm font-medium text-gray-700 mb-2">
                      11. Bank Name, Account Number and Sort Code <span className="text-red-600">*</span>
                    </label>
                    <textarea
                      id="bankDetails"
                      {...register('bankDetails')}
                      placeholder="Enter your answer"
                      rows={3}
                      className={`${INPUT_BASE} resize-none ${errors.bankDetails ? 'border-red-500' : 'border-gray-300'}`}
                    />
                    <p className="mt-1 text-xs text-gray-600">
                      Sent to the accounts office only. It is not stored alongside your health and
                      safety records.
                    </p>
                    {errors.bankDetails && (
                      <p className="mt-1 text-sm text-red-600">{errors.bankDetails.message}</p>
                    )}
                  </div>

                  {/* 12. Payment Terms */}
                  <div>
                    <span className="block text-sm font-medium text-gray-700 mb-2">
                      12. Payment Terms (Upon completion) <span className="text-red-600">*</span>
                    </span>
                    <div className="space-y-2">
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="radio"
                          {...register('paymentTerms')}
                          value="14 Day"
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-gray-700">14 Day</span>
                      </label>
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="radio"
                          {...register('paymentTerms')}
                          value="30 Day"
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-gray-700">30 Day</span>
                      </label>
                    </div>
                    {errors.paymentTerms && (
                      <p className="mt-1 text-sm text-red-600">{errors.paymentTerms.message}</p>
                    )}
                  </div>

                  {/* 13. Insurance — one block per policy. The details are asked for
                      beside each certificate because cover is recorded as cover: a
                      sum insured and an expiry date are what a site gate asks about
                      and what raises a renewal reminder later. An unlabelled bag of
                      files cannot answer either question. */}
                  <div>
                    <span className="block text-sm font-medium text-gray-700 mb-2">
                      13. Insurance Certificates <span className="text-red-600">*</span>
                    </span>
                    <p className="text-xs text-gray-600 mb-3">
                      Public Liability and Employers&apos; Liability are the two a site will refuse
                      entry without. Add a block for each policy you hold.
                    </p>
                    <p className="text-xs text-gray-500 mb-3">
                      Up to {MAX_FILES} certificates &middot; 15 MB each &middot; PDF or photo
                      (PNG, JPEG, WebP, GIF, HEIC, AVIF, TIFF, BMP)
                    </p>

                    <div className="space-y-5">
                      {rows.map((r, index) => (
                        <div key={r.key} className="border border-gray-300 rounded-md p-4 bg-gray-50/60">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-semibold text-gray-800">
                              Insurance {index + 1}
                            </span>
                            {rows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeRow(r.key)}
                                className="text-red-600 hover:text-red-800 text-sm font-medium"
                              >
                                Remove
                              </button>
                            )}
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                              <label
                                htmlFor={`${r.key}-kind`}
                                className="block text-xs font-medium text-gray-700 mb-1"
                              >
                                Cover <span className="text-red-600">*</span>
                              </label>
                              <select
                                id={`${r.key}-kind`}
                                value={r.kind}
                                onChange={(e) => patchRow(r.key, { kind: e.target.value })}
                                className={`${INPUT_BASE} border-gray-300 bg-white`}
                              >
                                <option value="">Choose the type of cover</option>
                                {INSURANCE_KINDS.map((k) => (
                                  <option key={k.value} value={k.value}>
                                    {k.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label
                                htmlFor={`${r.key}-insurer`}
                                className="block text-xs font-medium text-gray-700 mb-1"
                              >
                                Insurer <span className="text-red-600">*</span>
                              </label>
                              <input
                                type="text"
                                id={`${r.key}-insurer`}
                                value={r.insurer}
                                onChange={(e) => patchRow(r.key, { insurer: e.target.value })}
                                maxLength={120}
                                placeholder="As shown on the certificate"
                                className={`${INPUT_BASE} border-gray-300`}
                              />
                            </div>

                            <div>
                              <label
                                htmlFor={`${r.key}-policy`}
                                className="block text-xs font-medium text-gray-700 mb-1"
                              >
                                Policy number <span className="text-red-600">*</span>
                              </label>
                              <input
                                type="text"
                                id={`${r.key}-policy`}
                                value={r.policyNumber}
                                onChange={(e) => patchRow(r.key, { policyNumber: e.target.value })}
                                maxLength={100}
                                className={`${INPUT_BASE} border-gray-300`}
                              />
                            </div>

                            <div>
                              <label
                                htmlFor={`${r.key}-cover`}
                                className="block text-xs font-medium text-gray-700 mb-1"
                              >
                                Sum insured (£)
                              </label>
                              <input
                                type="text"
                                inputMode="numeric"
                                id={`${r.key}-cover`}
                                value={r.coverAmount}
                                onChange={(e) => patchRow(r.key, { coverAmount: e.target.value })}
                                maxLength={16}
                                placeholder="e.g. 5000000"
                                className={`${INPUT_BASE} border-gray-300`}
                              />
                            </div>

                            <div>
                              <label
                                htmlFor={`${r.key}-issue`}
                                className="block text-xs font-medium text-gray-700 mb-1"
                              >
                                Start date
                              </label>
                              <input
                                type="date"
                                id={`${r.key}-issue`}
                                value={r.issueDate}
                                onChange={(e) => patchRow(r.key, { issueDate: e.target.value })}
                                className={`${INPUT_BASE} border-gray-300`}
                              />
                            </div>

                            <div className="sm:col-span-2">
                              <label
                                htmlFor={`${r.key}-expiry`}
                                className="block text-xs font-medium text-gray-700 mb-1"
                              >
                                Expiry date <span className="text-red-600">*</span>
                              </label>
                              <input
                                type="date"
                                id={`${r.key}-expiry`}
                                value={r.expiryDate}
                                onChange={(e) => patchRow(r.key, { expiryDate: e.target.value })}
                                className={`${INPUT_BASE} border-gray-300`}
                              />
                              <p className="mt-1 text-xs text-gray-600">
                                Required. Without it nobody can check later whether this cover is
                                still live.
                              </p>
                            </div>

                            <div className="sm:col-span-2">
                              <label
                                htmlFor={`${r.key}-file`}
                                className="block text-xs font-medium text-gray-700 mb-1"
                              >
                                Certificate <span className="text-red-600">*</span>
                              </label>
                              <input
                                type="file"
                                id={`${r.key}-file`}
                                accept={ACCEPT_ATTR}
                                onChange={(e) => onRowFile(r.key, e.currentTarget)}
                                className={`${INPUT_BASE} border-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100`}
                              />
                              {r.file && (
                                <p className="mt-1 text-xs text-gray-700 truncate">{r.file.name}</p>
                              )}
                            </div>
                          </div>

                          {rowErrors[r.key] && (
                            <p className="mt-2 text-sm text-red-600">{rowErrors[r.key]}</p>
                          )}
                        </div>
                      ))}
                    </div>

                    {rows.length < MAX_FILES && (
                      <button
                        type="button"
                        onClick={addRow}
                        className="mt-3 text-sm font-medium text-blue-700 hover:text-blue-900"
                      >
                        + Add another insurance certificate
                      </button>
                    )}
                    {insuranceError && <p className="mt-2 text-sm text-red-600">{insuranceError}</p>}
                  </div>

                  {/* 14. Trade Specific Qualifications */}
                  <div>
                    <label
                      htmlFor="qualificationDocs"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      14. Trade Specific Qualifications
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      Up to {MAX_FILES} documents &middot; 15 MB each &middot; PDF or photo
                    </p>
                    <input
                      type="file"
                      id="qualificationDocs"
                      onChange={onQualificationFiles}
                      multiple
                      accept={ACCEPT_ATTR}
                      className={`${INPUT_BASE} ${qualificationError ? 'border-red-500' : 'border-gray-300'} file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100`}
                    />
                    {qualificationError && (
                      <p className="mt-1 text-sm text-red-600">{qualificationError}</p>
                    )}
                    {qualificationDocs.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {qualificationDocs.map((file, index) => (
                          <div
                            key={`${file.name}-${index}`}
                            className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded"
                          >
                            <span className="text-sm text-gray-700 truncate">{file.name}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setQualificationDocs((prev) => prev.filter((_, i) => i !== index))
                              }
                              className="text-red-600 hover:text-red-800 text-sm font-medium"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 15. Additional Information */}
                  <div>
                    <label htmlFor="additionalInfo" className="block text-sm font-medium text-gray-700 mb-2">
                      15. Additional Information
                    </label>
                    <textarea
                      id="additionalInfo"
                      {...register('additionalInfo')}
                      placeholder="Enter your answer"
                      rows={4}
                      className={`${INPUT_BASE} resize-none ${errors.additionalInfo ? 'border-red-500' : 'border-gray-300'}`}
                    />
                    {errors.additionalInfo && (
                      <p className="mt-1 text-sm text-red-600">{errors.additionalInfo.message}</p>
                    )}
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                      <input
                        type="checkbox"
                        id="sendEmailReceipt"
                        {...register('sendEmailReceipt')}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 mt-1"
                      />
                      <div className="flex-1">
                        <label
                          htmlFor="sendEmailReceipt"
                          className="text-sm font-medium text-gray-900 cursor-pointer block"
                        >
                          Send me a confirmation email
                        </label>
                        <p className="text-xs text-gray-600 mt-1">
                          You will get your reference number and a note of anything still
                          outstanding. Your bank details are never repeated back to you.
                        </p>
                      </div>
                    </div>
                  </div>

                  {errorMessage && (
                    <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md">
                      <p className="font-medium">This was not submitted</p>
                      <p className="text-sm mt-1">{errorMessage}</p>
                      <p className="text-xs mt-2">
                        Your answers and the files you chose are still here, so nothing needs typing
                        again.
                      </p>
                    </div>
                  )}

                  <div className="pt-4">
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-md transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? 'Submitting…' : 'Submit'}
                    </Button>
                  </div>
                </form>
              )}
            </Card>
          </div>
        </div>
      </section>
    </>
  );
}
