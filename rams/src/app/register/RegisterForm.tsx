'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

export function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: '', jobTitle: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password.length < 10) {
      setError('Choose a password of at least 10 characters.');
      return;
    }
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.fullName, job_title: form.jobTitle } },
    });

    if (signUpError) {
      setError(signUpError.message);
      setBusy(false);
      return;
    }

    router.replace('/pending');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      <Field label="Full name" required>
        <Input required value={form.fullName} onChange={set('fullName')} autoComplete="name" />
      </Field>

      <Field label="Job title" hint="Shown on the documents you author.">
        <Input value={form.jobTitle} onChange={set('jobTitle')} placeholder="Lead Installer" />
      </Field>

      <Field label="Work email" required>
        <Input
          type="email"
          required
          value={form.email}
          onChange={set('email')}
          autoComplete="email"
          placeholder="you@heliaxis.co.uk"
        />
      </Field>

      <Field label="Password" required hint="At least 10 characters.">
        <Input
          type="password"
          required
          minLength={10}
          value={form.password}
          onChange={set('password')}
          autoComplete="new-password"
        />
      </Field>

      <Button type="submit" variant="solar" size="lg" className="w-full" disabled={busy}>
        {busy ? 'Creating account…' : 'Request access'}
      </Button>
    </form>
  );
}
