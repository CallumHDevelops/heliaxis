import { LinkButton } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="px-6 py-20 text-center">
      <p className="mono text-[0.7rem] uppercase tracking-[0.14em] text-amber-2">404</p>
      <h1 className="mt-2 text-[1.6rem] font-extrabold">Not found</h1>
      <p className="mx-auto mt-2 max-w-md text-muted">
        That page, project or document does not exist — or you do not have access to it.
      </p>
      <LinkButton href="/" variant="solar" className="mt-5">
        Back to dashboard
      </LinkButton>
    </div>
  );
}
