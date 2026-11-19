import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * The one DataForSEO client every Search module uses (spec §4). It signs in with DATAFORSEO_BASE64, or DATAFORSEO_LOGIN and
 * DATAFORSEO_PASSWORD, retries once on DataForSEO's occasional server errors, and writes the cost of every call to
 * seo_api_call so the monthly cap (§7) can be enforced. DATAFORSEO_SANDBOX=1 points it at sandbox.dataforseo.com (free
 * dummy data) for integration runs.
 */

const API = () => (process.env.DATAFORSEO_SANDBOX === '1' ? 'https://sandbox.dataforseo.com/v3' : 'https://api.dataforseo.com/v3');

const clean = (v: string | undefined) => String(v ?? '').trim().replace(/^["']|["']$/g, '').trim();
const base64 = () => clean(process.env.DATAFORSEO_BASE64).replace(/^Basic\s+/i, '');
const creds = () => ({ login: clean(process.env.DATAFORSEO_LOGIN), password: clean(process.env.DATAFORSEO_PASSWORD) });

export const dfsConfigured = () => {
  const c = creds();
  return !!(base64() || (c.login && c.password));
};

function auth() {
  const b = base64();
  if (b) return `Basic ${b}`;
  const c = creds();
  return 'Basic ' + Buffer.from(`${c.login}:${c.password}`).toString('base64');
}

/** The login in use, part hidden ("ca…@heliaxis.co.uk"), never the secret. */
export function dfsLoginShown(): string {
  let login = creds().login;
  const b = base64();
  if (b) {
    try {
      login = Buffer.from(b, 'base64').toString('utf8').split(':')[0] || '(Base64 value)';
    } catch {
      login = '(Base64 value)';
    }
  }
  return login.replace(/^(.{2}).*(@.*)$/, '$1…$2');
}

export type DfsTask = {
  id: string;
  status_code: number;
  status_message: string;
  cost?: number;
  data?: Record<string, unknown>;
  result?: Record<string, unknown>[] | null;
};

export type CallOpts = { module?: string; timeoutMs?: number; log?: boolean };

/** One call. Throws on a transport error or a failed envelope; individual tasks keep their own status codes. */
export async function dfs(path: string, body?: unknown, opts: CallOpts = {}): Promise<{ tasks: DfsTask[]; cost: number }> {
  const started = Date.now();
  let last: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`${API()}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: auth(), 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
        cache: 'no-store',
      });
      const j = (await r.json().catch(() => ({}))) as { status_code?: number; status_message?: string; cost?: number; tasks?: DfsTask[] };
      if (!r.ok || (j.status_code !== undefined && j.status_code !== 20000)) {
        const err = new Error(String(j.status_message ?? `DataForSEO ${r.status}`));
        // 50000-ish codes are DataForSEO's own hiccups: worth one retry. Anything else (auth, money, bad request) is not.
        if (r.status >= 500 || (j.status_code ?? 0) >= 50000) {
          last = err;
          continue;
        }
        throw err;
      }
      const cost = Number(j.cost ?? 0);
      if (opts.log !== false) await logCall(path, opts.module, cost, true, Date.now() - started, j.tasks?.length ?? 0);
      return { tasks: j.tasks ?? [], cost };
    } catch (e) {
      last = e instanceof Error ? e : new Error('DataForSEO failed');
      if (/abort|timeout/i.test(last.message) || attempt === 1) break;
    }
  }
  if (opts.log !== false) await logCall(path, opts.module, 0, false, Date.now() - started, 0);
  throw last ?? new Error('DataForSEO failed');
}

async function logCall(endpoint: string, module: string | undefined, cost: number, ok: boolean, ms: number, tasks: number) {
  try {
    await createAdminClient().from('seo_api_call').insert({ vendor: 'dataforseo', endpoint: endpoint.replace(/\/[0-9a-f-]{20,}$/i, '/{id}'), module: module ?? null, cost_usd: cost, ok, ms, tasks });
  } catch {
    /* logging must never break a run */
  }
}

/** The account balance in US dollars (free to ask). */
export async function dfsBalance(): Promise<number | null> {
  const { tasks } = await dfs('/appendix/user_data', undefined, { timeoutMs: 8_000, log: false });
  const money = (tasks[0]?.result?.[0] as { money?: { balance?: number } } | undefined)?.money;
  return typeof money?.balance === 'number' ? money.balance : null;
}

/* ── Prices (Nov 2026), for pre-flight estimates. Real costs come back on every task and are what is logged. ── */

export const PRICE = {
  /** Standard queue, per 10-result page. */
  serpPage: 0.0006,
  /** Live mode, per page. */
  serpLivePage: 0.002,
} as const;

/** A standard-queue SERP at depth 100: up to 10 pages, plus one for the poisoned check and one for the async AI Overview. */
export const serpTaskCost = (depth = 100) => PRICE.serpPage * (Math.ceil(depth / 10) + 2);
