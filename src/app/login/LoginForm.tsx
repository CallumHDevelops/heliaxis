'use client';

import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { login } from '@/lib/auth-actions';
import { AuthShell } from '@/components/auth/AuthShell';
import { field } from '@/components/auth/authStyles';
import { safeAdminPath } from '@/lib/auth-utils';

export default function LoginForm() {
  const searchParams = useSearchParams();
  const next = safeAdminPath(searchParams.get('next'));
  const [state, action, pending] = useActionState(login, null);

  return (
    <AuthShell
      title="Admin sign in"
      subtitle="Sign in to manage the Heliaxis site."
      footer={
        <>
          Need an account?{' '}
          <Link href="/register" style={{ color: '#C77F04', fontWeight: 600 }}>
            Request access
          </Link>
        </>
      }
    >
      <form action={action} style={{ display: 'grid', gap: '1rem' }}>
        <input type="hidden" name="next" value={next} />
        {state?.error && <div style={field.error}>{state.error}</div>}
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
            autoComplete="current-password"
          />
        </div>
        <button
          style={{ ...field.button, ...(pending ? field.buttonDisabled : {}) }}
          type="submit"
          disabled={pending}
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  );
}
