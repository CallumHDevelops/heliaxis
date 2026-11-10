/**
 * Test shim: a Supabase-like client whose .rpc() runs the real pv_* functions
 * on a local Postgres via named-argument calls. Lets the route handlers run
 * unchanged against the actual migrations.
 */
import pg from 'pg';

export function makeShim(pool: pg.Pool) {
  return {
    async rpc(fn: string, args: Record<string, unknown>) {
      if (!/^pv_[a-z_]+$/.test(fn)) throw new Error(`unexpected rpc ${fn}`);
      const keys = Object.keys(args);
      const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
      const values = keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
      try {
        const { rows } = await pool.query(sql, values);
        return { data: rows[0]?.r ?? null, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message, code: (e as { code?: string }).code } };
      }
    },
  };
}
