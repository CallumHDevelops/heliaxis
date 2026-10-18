import type { Metadata } from 'next';
import Link from 'next/link';
import { guardAdmin } from '@/lib/auth';
import { AdminShell } from '@/components/admin/AdminShell';
import { envReport } from '@/lib/env-check';
import '../setup.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Vercel keys · Heliaxis', robots: { index: false, follow: false } };

/** What the live site can see in Vercel: ✓ / ✗ per variable. Names only, never values. */
export default async function EnvPage() {
  await guardAdmin('/admin/setup/env');
  const groups = envReport();
  const missing = groups.flatMap((g) => g.vars.filter((v) => !v.set && !v.optional).map((v) => v.name));
  return (
    <AdminShell active="dashboard">
      <div className="su">
        <Link href="/admin" className="su-back">← Dashboard</Link>
        <p className="su-kicker">Vercel environment variables</p>
        <h1 className="su-h1">{missing.length ? `${missing.length} missing` : 'All the essentials are in'}</h1>
        <p className="su-muted">
          What this live site can see right now. A key added in Vercel only shows here after a redeploy. Values are never shown.
          <b> Secret</b> means switch on <b>Sensitive</b> in Vercel.
        </p>
        {groups.map((g) => {
          const need = g.vars.filter((v) => !v.optional);
          const done = need.every((v) => v.set);
          return (
            <section key={g.title} className="su-group">
              <h2>
                <span className={`su-state ${need.length === 0 ? 'opt' : done ? 'ok' : 'no'}`}>{need.length === 0 ? '○' : done ? '✓' : '✗'}</span>
                {g.title}
              </h2>
              <p className="su-muted">{g.what}</p>
              <ul className="su-vars">
                {g.vars.map((v) => (
                  <li key={v.name} className={v.set ? 'is-set' : v.optional ? 'is-opt' : 'is-missing'}>
                    <span className="su-mark" aria-label={v.set ? 'Set' : 'Missing'}>{v.set ? '✓' : v.optional ? '–' : '✗'}</span>
                    <span className="su-var">
                      <code>{v.name.split('|').join(' or ')}</code>
                      <small>
                        {v.secret ? 'Secret' : 'Setting'}
                        {v.optional ? ' · optional' : ''}
                        {v.set ? '' : ` · ${v.hint}`}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </AdminShell>
  );
}
