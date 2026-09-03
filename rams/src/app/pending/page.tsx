import { AuthShell } from '@/components/auth/AuthShell';
import { SignOutButton } from '@/components/app/SignOutButton';
import { getSession } from '@/lib/auth';

export const metadata = { title: 'Awaiting approval' };

export default async function PendingPage() {
  const { profile } = await getSession();
  const rejected = profile?.status === 'rejected';

  return (
    <AuthShell
      title={rejected ? 'Access declined' : 'Awaiting approval'}
      subtitle={
        rejected
          ? 'Your account request was not approved. Speak to your manager if you think this is a mistake.'
          : 'Your account has been created. An administrator will approve it shortly — you will be able to sign in once they do.'
      }
    >
      <SignOutButton className="w-full" />
    </AuthShell>
  );
}
