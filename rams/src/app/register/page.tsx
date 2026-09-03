import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { RegisterForm } from './RegisterForm';

export const metadata = { title: 'Request access' };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Request access"
      subtitle="Create an account, then an administrator approves it before you can sign in."
      footer={
        <>
          Already registered?{' '}
          <Link href="/login" className="font-semibold text-solar hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
