import { AppNav } from '@/components/app/AppNav';
import { requireUser } from '@/lib/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUser();

  return (
    <div className="min-h-dvh bg-paper">
      <AppNav profile={profile} />
      <main className="mx-auto max-w-[86rem] px-5 py-8">{children}</main>
    </div>
  );
}
