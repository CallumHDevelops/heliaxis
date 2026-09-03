'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import {
  COMPANY_CERT_CATALOGUE,
  COMPANY_CERT_CATEGORIES,
  USER_CERT_CATALOGUE,
  USER_CERT_CATEGORIES,
} from '@/lib/content/certifications';
import { addMonthsISO } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import type { Certification, Profile } from '@/lib/types';
import { saveCertification, type CertState } from './actions';

const MAX_BYTES = 15 * 1024 * 1024;

export function CertificationForm({
  staff,
  currentUserId,
  canManageOthers,
  editing,
  onDone,
}: {
  staff: Profile[];
  currentUserId: string;
  canManageOthers: boolean;
  editing?: Certification | null;
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState<CertState, FormData>(saveCertification, {});

  const [ownerType, setOwnerType] = useState<'company' | 'user'>(editing?.owner_type ?? 'user');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [category, setCategory] = useState(editing?.category ?? '');
  const [issuingBody, setIssuingBody] = useState(editing?.issuing_body ?? '');
  const [expiry, setExpiry] = useState(editing?.expiry_date ?? '');

  const [filePath, setFilePath] = useState(editing?.file_path ?? '');
  const [fileName, setFileName] = useState(editing?.file_name ?? '');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const catalogue = ownerType === 'company' ? COMPANY_CERT_CATALOGUE : USER_CERT_CATALOGUE;
  const categories = ownerType === 'company' ? COMPANY_CERT_CATEGORIES : USER_CERT_CATEGORIES;

  useEffect(() => {
    if (state.ok && onDone) onDone();
  }, [state.ok, onDone]);

  /** Picking a catalogue entry fills in the body, category and a likely expiry. */
  function applyCatalogue(value: string) {
    const entry = catalogue.find((c) => c.title === value);
    setTitle(value);
    if (!entry) return;
    setCategory(entry.category);
    if (entry.issuingBody) setIssuingBody(entry.issuingBody);
    if (entry.validityMonths && !expiry) setExpiry(addMonthsISO(entry.validityMonths));
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    if (file.size > MAX_BYTES) {
      setUploadError('That file is larger than the 15 MB limit.');
      return;
    }
    setUploading(true);
    const supabase = createClient();
    const safeName = file.name.replace(/[^\w.\-]+/g, '_');
    const path = `${ownerType === 'company' ? 'company' : currentUserId}/${crypto.randomUUID()}-${safeName}`;

    const { error } = await supabase.storage
      .from('certifications')
      .upload(path, file, { contentType: file.type || undefined });

    setUploading(false);
    if (error) {
      setUploadError(error.message);
      return;
    }
    setFilePath(path);
    setFileName(file.name);
  }

  return (
    <Card className="p-5">
      <form action={formAction} className="space-y-4">
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <input type="hidden" name="file_path" value={filePath} />
        <input type="hidden" name="file_name" value={fileName} />

        {state.error && <Alert tone="danger">{state.error}</Alert>}
        {state.ok && <Alert tone="ok">{state.ok}</Alert>}
        {uploadError && <Alert tone="danger">{uploadError}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Held by" required>
            <Select
              name="owner_type"
              value={ownerType}
              onChange={(e) => setOwnerType(e.target.value as 'company' | 'user')}
              disabled={!canManageOthers && ownerType === 'user'}
            >
              <option value="user">A person</option>
              {canManageOthers && <option value="company">The company</option>}
            </Select>
          </Field>

          {ownerType === 'user' && (
            <Field label="Person" required>
              <Select
                name="profile_id"
                defaultValue={editing?.profile_id ?? currentUserId}
                disabled={!canManageOthers}
              >
                {staff.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Certificate" required className="sm:col-span-2">
            <Input
              name="title"
              required
              list="cert-catalogue"
              value={title}
              onChange={(e) => applyCatalogue(e.target.value)}
              placeholder="Start typing, or pick from the list"
            />
            <datalist id="cert-catalogue">
              {catalogue.map((c) => (
                <option key={c.title} value={c.title} />
              ))}
            </datalist>
          </Field>

          <Field label="Category">
            <Select name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Issuing body">
            <Input
              name="issuing_body"
              value={issuingBody}
              onChange={(e) => setIssuingBody(e.target.value)}
              placeholder="IOSH, NICEIC, CITB…"
            />
          </Field>

          <Field label="Certificate number">
            <Input name="reference" defaultValue={editing?.reference ?? ''} />
          </Field>

          <Field label="Issue date">
            <Input type="date" name="issue_date" defaultValue={editing?.issue_date ?? ''} />
          </Field>

          <Field label="Expiry date" hint="Leave blank if the certificate does not expire.">
            <Input
              type="date"
              name="expiry_date"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </Field>

          <Field label="Notes" className="sm:col-span-2">
            <Textarea name="notes" rows={2} defaultValue={editing?.notes ?? ''} />
          </Field>

          <Field
            label="Certificate PDF"
            className="sm:col-span-2"
            hint="Up to 15 MB. Attached to any RAMS this certificate is listed on."
          >
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/*"
                disabled={uploading}
                onChange={(e) => upload(e.target.files?.[0])}
                className="field flex-1 file:mr-3 file:cursor-pointer file:rounded-[2px] file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-[0.8rem] file:font-semibold file:text-paper"
              />
              {uploading && <span className="mono text-[0.75rem] text-amber-2">Uploading…</span>}
              {fileName && !uploading && (
                <span className="mono text-[0.75rem] text-ok">✓ {fileName}</span>
              )}
            </div>
          </Field>
        </div>

        <div className="flex gap-2">
          <Button type="submit" variant="solar" disabled={pending || uploading}>
            {pending ? 'Saving…' : editing ? 'Save changes' : 'Add certificate'}
          </Button>
          {onDone && (
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
