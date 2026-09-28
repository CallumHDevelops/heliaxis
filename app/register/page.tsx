import { redirect } from 'next/navigation';

// Sign-in is now passwordless (magic link), which also creates the account on
// first use — so there's no separate registration step.
export default function RegisterPage() {
  redirect('/login');
}
