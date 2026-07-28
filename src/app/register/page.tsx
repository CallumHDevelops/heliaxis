'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { register } from '@/lib/auth-actions';
import { AuthShell } from '@/components/auth/AuthShell';
import { field } from '@/components/auth/authStyles';

export default function RegisterPage() {
  const [state, action, pending] = useActionState(register, null);

  return (
    <AuthShell
      title="Request access"
      subtitle="Create an account. An administrator will approve it before you can sign in."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" style={{ color: '#C77F04', fontWeight: 600 }}>
            Sign in
          </Link>
        </>
      }
    >
      <form action={action} style={{ display: 'grid', gap: '1rem' }}>
        {state?.error && <div style={field.error}>{state.error}</div>}
        <div>
          <label style={field.label} htmlFor="fullName">
            Full name
          </label>
          <input style={field.input} id="fullName" name="fullName" type="text" required autoComplete="name" />
        </div>
        <div>
          <label style={field.label} htmlFor="email">
            Email
          </label>
          <input style={field.input} id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <label style={field.label} htmlFor="password">
            Password
          </label>
          <input
            style={field.input}
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <p style={{ fontSize: '.75rem', color: '#6E6A5E', margin: '.35rem 0 0' }}>
            At least 8 characters.
          </p>
        </div>
        <button
          style={{ ...field.button, ...(pending ? field.buttonDisabled : {}) }}
          type="submit"
          disabled={pending}
        >
          {pending ? 'Creating account…' : 'Request access'}
        </button>
      </form>
    </AuthShell>
  );
}
