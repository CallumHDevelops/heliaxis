import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/lib/auth-actions';
import { AuthShell } from '@/components/auth/AuthShell';
import { field, brand } from '@/components/auth/authStyles';

export const dynamic = 'force-dynamic';

export default async function PendingPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string }>;
}) {
  const sp = await searchParams;
  const justRegistered = sp?.registered === '1';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', user.id)
      .single();
    if (profile?.status === 'approved') redirect('/admin');
  }

  return (
    <AuthShell
      title={justRegistered ? 'Request received' : 'Awaiting approval'}
      subtitle={justRegistered ? 'Thanks for registering.' : undefined}
    >
      <p style={{ color: brand.muted, fontSize: '.92rem', lineHeight: 1.6, margin: 0 }}>
        Your account is <strong style={{ color: brand.ink }}>pending approval</strong> by an
        administrator. You&rsquo;ll be able to sign in to the admin area as soon as it&rsquo;s
        approved.
      </p>
      {user ? (
        <form action={signOut} style={{ marginTop: '1.5rem' }}>
          <button style={field.button} type="submit">
            Sign out
          </button>
        </form>
      ) : (
        <a
          href="/login"
          style={{
            ...field.button,
            display: 'block',
            textAlign: 'center',
            textDecoration: 'none',
            marginTop: '1.5rem',
          }}
        >
          Back to sign in
        </a>
      )}
    </AuthShell>
  );
}
