'use client';

import { useActionState } from 'react';
import { updatePassword } from '@/lib/auth-actions';
import { AuthShell } from '@/components/auth/AuthShell';
import { field } from '@/components/auth/authStyles';

/** Reached from the reset email (via /auth/confirm, which signs the user in). */
export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState(updatePassword, null);
  return (
    <AuthShell title="Set a new password" subtitle="At least 10 characters.">
      <form action={action} style={{ display: 'grid', gap: '1rem' }}>
        {state?.error && <div style={field.error}>{state.error}</div>}
        <div>
          <label style={field.label} htmlFor="password">
            New password
          </label>
          <input style={field.input} id="password" name="password" type="password" required minLength={10} autoComplete="new-password" />
        </div>
        <div>
          <label style={field.label} htmlFor="confirm">
            Confirm new password
          </label>
          <input style={field.input} id="confirm" name="confirm" type="password" required minLength={10} autoComplete="new-password" />
        </div>
        <button style={{ ...field.button, ...(pending ? field.buttonDisabled : {}) }} type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </AuthShell>
  );
}
