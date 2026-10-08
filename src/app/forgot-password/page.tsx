'use client';

import { Suspense, useActionState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { requestPasswordReset } from '@/lib/auth-actions';
import { AuthShell } from '@/components/auth/AuthShell';
import { field } from '@/components/auth/authStyles';

function ForgotForm() {
  const expired = useSearchParams().get('expired');
  const [state, action, pending] = useActionState(requestPasswordReset, null);

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a link to set a new one."
      footer={
        <Link href="/login" style={{ color: '#C77F04', fontWeight: 600 }}>
          ← Back to sign in
        </Link>
      }
    >
      <form action={action} style={{ display: 'grid', gap: '1rem' }}>
        {expired && !state && <div style={field.error}>That link has expired or was already used. Request a new one.</div>}
        {state?.error && <div style={field.error}>{state.error}</div>}
        {state?.ok ? (
          <p style={{ margin: 0, fontSize: '.92rem' }}>{state.ok}</p>
        ) : (
          <>
            <div>
              <label style={field.label} htmlFor="email">
                Email
              </label>
              <input style={field.input} id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <button style={{ ...field.button, ...(pending ? field.buttonDisabled : {}) }} type="submit" disabled={pending}>
              {pending ? 'Sending…' : 'Email me a reset link'}
            </button>
          </>
        )}
      </form>
    </AuthShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotForm />
    </Suspense>
  );
}
