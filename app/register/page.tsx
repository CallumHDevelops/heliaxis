import { redirect } from 'next/navigation';

// Sign-in is passwordless (magic link) and invite-only: an admin adds each
// account, so there's no registration step.
export default function RegisterPage() {
  redirect('/login');
}
