/**
 * Offline-first storage for the Tasks board.
 *
 * Every change is applied locally straight away and queued in an outbox (localStorage,
 * per user). The outbox is sent to /api/tasks in order whenever we're online; anything
 * that can't reach the server stays queued until the next attempt. The last good copy
 * of the list is kept too, so the board opens offline.
 */
import type { Task } from '@/lib/tasks';

export type TaskOp =
  | { kind: 'create'; task: Task }
  | { kind: 'update'; id: string; patch: Partial<Task> }
  | { kind: 'delete'; id: string };

const PREFIX = 'hx.tasks.';
const cacheKey = (userId: string) => `${PREFIX}cache.${userId}`;
const outboxKey = (userId: string) => `${PREFIX}outbox.${userId}`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked — the board still works online.
  }
}

export function loadCache(userId: string): Task[] | null {
  return read<{ tasks: Task[] }>(cacheKey(userId))?.tasks ?? null;
}

export function saveCache(userId: string, tasks: Task[]) {
  write(cacheKey(userId), { tasks, savedAt: new Date().toISOString() });
}

export function loadOutbox(userId: string): TaskOp[] {
  return read<TaskOp[]>(outboxKey(userId)) ?? [];
}

export function saveOutbox(userId: string, ops: TaskOp[]) {
  write(outboxKey(userId), ops);
}

/** Wipe every user's local task data (on sign-out). */
export function clearTaskStorage() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/** Fields the server derives, filled in locally so offline edits look right. */
export function withDerived(patch: Partial<Task>): Partial<Task> {
  const now = new Date().toISOString();
  const out: Partial<Task> = { ...patch, updated_at: now };
  if (patch.status) out.completed_at = patch.status === 'done' ? now : null;
  return out;
}

export function applyOps(tasks: Task[], ops: TaskOp[]): Task[] {
  let out = tasks;
  for (const op of ops) {
    if (op.kind === 'create') {
      out = out.some((t) => t.id === op.task.id) ? out : [op.task, ...out];
    } else if (op.kind === 'update') {
      out = out.map((t) => (t.id === op.id ? { ...t, ...op.patch } : t));
    } else {
      out = out.filter((t) => t.id !== op.id);
    }
  }
  return out;
}

/**
 * Add an op to the queue, folding it into anything still unsent for the same task
 * (edit an unsent task → one create; delete an unsent task → nothing to send).
 */
export function enqueue(ops: TaskOp[], op: TaskOp): TaskOp[] {
  if (op.kind === 'create') return [...ops, op];
  const pendingCreate = ops.find((o) => o.kind === 'create' && o.task.id === op.id);
  if (op.kind === 'delete') {
    const rest = ops.filter((o) => (o.kind === 'create' ? o.task.id : o.id) !== op.id);
    return pendingCreate ? rest : [...rest, op];
  }
  if (pendingCreate && pendingCreate.kind === 'create') {
    return ops.map((o) => (o === pendingCreate ? { kind: 'create', task: { ...o.task, ...op.patch } as Task } : o));
  }
  const pendingUpdate = ops.find((o) => o.kind === 'update' && o.id === op.id);
  if (pendingUpdate && pendingUpdate.kind === 'update') {
    return ops.map((o) => (o === pendingUpdate ? { ...pendingUpdate, patch: { ...pendingUpdate.patch, ...op.patch } } : o));
  }
  return [...ops, op];
}

const EDITABLE = ['title', 'notes', 'assignee_id', 'assignee_name', 'due_date', 'priority', 'status'] as const;

function body(patch: Partial<Task>) {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in patch) out[k] = patch[k] ?? '';
  return out;
}

export type FlushResult = {
  /** Ops still waiting (couldn't reach the server). */
  remaining: TaskOp[];
  /** Server rejected these — dropped, with the reason. */
  rejected: string[];
  /** True if we couldn't reach the server at all. */
  offline: boolean;
};

/** Send queued ops in order. Stops at the first network failure so order is kept. */
export async function flush(ops: TaskOp[]): Promise<FlushResult> {
  const rejected: string[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    let res: Response;
    try {
      if (op.kind === 'create') {
        res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: op.task.id, ...body(op.task) }),
        });
      } else if (op.kind === 'update') {
        res = await fetch('/api/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: op.id, ...body(op.patch) }),
        });
      } else {
        res = await fetch(`/api/tasks?id=${encodeURIComponent(op.id)}`, { method: 'DELETE' });
      }
    } catch {
      return { remaining: ops.slice(i), rejected, offline: true };
    }
    // Signed out or server trouble: keep it for later rather than lose the change.
    if (res.status === 401 || res.status >= 500) return { remaining: ops.slice(i), rejected, offline: false };
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      rejected.push(d.error || `Change couldn't be saved (${res.status})`);
    }
  }
  return { remaining: [], rejected, offline: false };
}
