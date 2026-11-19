/**
 * Compare-and-swap writes to cms_kv. Each key is read with its updated_at and written back only if updated_at has not
 * moved since (someone else's save in between makes the write match no row). On a clash everything is re-read and
 * `change` runs again on the fresh values, up to `attempts` times, then it gives up with CMS_BUSY.
 *
 * `change` must be safe to run again (it is given fresh values each time and should put, not append blindly). Writes
 * to several keys are not one transaction: a clash after the first key is written is settled by the retry, which
 * re-applies the same change on top.
 */

export const CMS_BUSY = 'The CMS was being saved at the same time; try again';

type Res<T> = PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>;

/** The slice of the Supabase client this needs (so tests can pass a fake). */
export type KvDb = {
  from(table: 'cms_kv'): {
    select(cols: string): { in(col: 'key', keys: string[]): Res<{ key: string; value: string | null; updated_at: string | null }[]> };
    update(row: { value: string; updated_at: string }): {
      eq(col: 'key', key: string): {
        eq(col: 'updated_at', at: string): { select(cols: string): Res<{ key: string }[]> };
        is(col: 'updated_at', v: null): { select(cols: string): Res<{ key: string }[]> };
      };
    };
    insert(row: { key: string; value: string; updated_at: string }): Res<unknown>;
  };
};

export async function casCmsKv<T>(
  db: KvDb,
  keys: string[],
  change: (values: Record<string, string | null>) => Promise<{ writes: Record<string, unknown>; result: T }>,
  attempts = 3,
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    const { data, error } = await db.from('cms_kv').select('key, value, updated_at').in('key', keys);
    if (error) throw new Error(error.message);
    const rows = new Map((data ?? []).map((r) => [r.key, r]));
    const values = Object.fromEntries(keys.map((k) => [k, rows.get(k)?.value ?? null]));
    const { writes, result } = await change(values);
    let clash = false;
    for (const [key, v] of Object.entries(writes)) {
      const value = typeof v === 'string' ? v : JSON.stringify(v);
      const at = new Date().toISOString();
      const row = rows.get(key);
      if (row) {
        const q = db.from('cms_kv').update({ value, updated_at: at }).eq('key', key);
        const { data: hit, error: e } = await (row.updated_at ? q.eq('updated_at', row.updated_at) : q.is('updated_at', null)).select('key');
        if (e) throw new Error(e.message);
        if (!hit?.length) clash = true;
      } else {
        const { error: e } = await db.from('cms_kv').insert({ key, value, updated_at: at });
        if (e && e.code === '23505') clash = true;
        else if (e) throw new Error(e.message);
      }
      if (clash) break;
    }
    if (!clash) return result;
  }
  throw new Error(CMS_BUSY);
}
