'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Alert, Button, Field, Select } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

const KINDS = [
  { value: 'survey', label: 'Site survey' },
  { value: 'drawing', label: 'Drawing / layout' },
  { value: 'photo', label: 'Photo' },
  { value: 'permit', label: 'Permit / consent' },
  { value: 'spec', label: 'Specification / datasheet' },
  { value: 'other', label: 'Other' },
];

const MAX_BYTES = 25 * 1024 * 1024;

export function FileUploader({ projectId }: { projectId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState('survey');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_BYTES) {
          throw new Error(`${file.name} is larger than the 25 MB limit.`);
        }
        // Object keys are namespaced by project and randomised so two files of
        // the same name never collide.
        const safeName = file.name.replace(/[^\w.\-]+/g, '_');
        const path = `${projectId}/${crypto.randomUUID()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('project-files')
          .upload(path, file, { contentType: file.type || undefined });
        if (uploadError) throw new Error(uploadError.message);

        const { error: rowError } = await supabase.from('project_files').insert({
          project_id: projectId,
          kind,
          file_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          uploaded_by: user?.id ?? null,
        });
        if (rowError) {
          // Don't leave an orphaned object behind if the row insert fails.
          await supabase.storage.from('project-files').remove([path]);
          throw new Error(rowError.message);
        }
      }
      if (inputRef.current) inputRef.current.value = '';
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
        <Field label="File type">
          <Select value={kind} onChange={(e) => setKind(e.target.value)} disabled={busy}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Files" hint="Up to 25 MB each. PDFs, images and drawings.">
          <input
            ref={inputRef}
            type="file"
            multiple
            disabled={busy}
            onChange={(e) => upload(e.target.files)}
            className="field file:mr-3 file:cursor-pointer file:rounded-[2px] file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-[0.8rem] file:font-semibold file:text-paper"
          />
        </Field>
      </div>
      {busy && (
        <p className="mono text-[0.75rem] text-amber-2">Uploading…</p>
      )}
      <Button
        type="button"
        variant="quiet"
        size="sm"
        className="hidden"
        onClick={() => inputRef.current?.click()}
      >
        Choose files
      </Button>
    </div>
  );
}
