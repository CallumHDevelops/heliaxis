import { Badge, Button, Card, PageHeader, Select } from '@/components/ui';
import { requireAdmin } from '@/lib/auth';
import { listProfiles } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { updateUser } from './actions';

export const metadata = { title: 'Users' };

export default async function UsersPage() {
  const { user } = await requireAdmin('/admin/users');
  const profiles = await listProfiles();

  const pending = profiles.filter((p) => p.status === 'pending');
  const rest = profiles.filter((p) => p.status !== 'pending');

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Approve new accounts and set what each person can do. Members build and edit documents; managers can also approve, issue and manage company records."
      />

      {pending.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <div className="border-b border-[color:var(--line)] bg-[#FBEBC2]/50 px-4 py-3">
            <h2 className="text-[0.95rem] font-extrabold">
              {pending.length} account{pending.length === 1 ? '' : 's'} awaiting approval
            </h2>
          </div>
          <ul className="divide-y divide-[color:var(--line)]">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.full_name || 'No name given'}</p>
                  <p className="mono truncate text-[0.75rem] text-muted">
                    {p.email} · requested {formatDate(p.created_at)}
                  </p>
                </div>
                <form action={updateUser} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={p.id} />
                  <Select name="role" defaultValue="member" className="py-1.5 text-[0.8rem]">
                    <option value="member">Member</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </Select>
                  <input type="hidden" name="status" value="approved" />
                  <Button type="submit" variant="solar" size="sm">
                    Approve
                  </Button>
                </form>
                <form action={updateUser}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="status" value="rejected" />
                  <Button type="submit" variant="quiet" size="sm">
                    Reject
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-[0.86rem]">
            <thead>
              <tr className="border-b border-[color:var(--line)] bg-paper-2">
                {['Name', 'Email', 'Role', 'Status', 'Joined', ''].map((h) => (
                  <th
                    key={h}
                    className="mono px-3 py-2.5 text-left text-[0.66rem] uppercase tracking-[0.1em] text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rest.map((p) => {
                const self = p.id === user.id;
                return (
                  <tr key={p.id} className="border-b border-[color:var(--line)] last:border-0">
                    <td className="px-3 py-2.5 font-semibold">
                      {p.full_name || '—'}
                      {self && <span className="ml-2 text-[0.72rem] text-muted">(you)</span>}
                      {p.job_title && (
                        <div className="text-[0.74rem] font-normal text-muted">{p.job_title}</div>
                      )}
                    </td>
                    <td className="mono px-3 py-2.5 text-[0.76rem] text-muted">{p.email}</td>
                    <td className="px-3 py-2.5">
                      <form action={updateUser} className="flex items-center gap-1.5">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="status" value={p.status} />
                        <Select
                          name="role"
                          defaultValue={p.role}
                          disabled={self}
                          className="py-1 text-[0.78rem]"
                        >
                          <option value="member">Member</option>
                          <option value="manager">Manager</option>
                          <option value="admin">Admin</option>
                        </Select>
                        {!self && (
                          <Button type="submit" variant="quiet" size="sm">
                            Set
                          </Button>
                        )}
                      </form>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        tone={
                          p.status === 'approved'
                            ? 'ok'
                            : p.status === 'rejected'
                              ? 'danger'
                              : 'warn'
                        }
                      >
                        {p.status}
                      </Badge>
                    </td>
                    <td className="mono px-3 py-2.5 text-[0.76rem] text-muted">
                      {formatDate(p.created_at)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {!self && p.status === 'approved' && (
                        <form action={updateUser}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="role" value={p.role} />
                          <input type="hidden" name="status" value="rejected" />
                          <Button type="submit" variant="quiet" size="sm">
                            Revoke access
                          </Button>
                        </form>
                      )}
                      {!self && p.status === 'rejected' && (
                        <form action={updateUser}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="role" value={p.role} />
                          <input type="hidden" name="status" value="approved" />
                          <Button type="submit" variant="ghost" size="sm">
                            Restore
                          </Button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
