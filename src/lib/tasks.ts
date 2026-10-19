/** Shared to-do list (/admin/tasks). Safe to import from server and client code. */

export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export const TASK_PRIORITIES = ['low', 'normal', 'high'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
};

export type Task = {
  id: string;
  title: string;
  notes: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  due_date: string | null; // YYYY-MM-DD
  priority: TaskPriority;
  status: TaskStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  /** The CRM job the task belongs to (opportunity tasks, deadline and survey follow-ups). */
  crm_project_id?: string | null;
};

/** The job a task belongs to, for the "Job: HX-0042 / Jane Smith" chip. */
export type TaskJob = { ref: string | null; name: string };

/** Someone a task can be assigned to (an approved account). */
export type Assignee = { id: string; name: string };

export const TASK_COLUMNS =
  'id, title, notes, assignee_id, assignee_name, due_date, priority, status, created_by, created_at, updated_at, completed_at, crm_project_id';

/** Today as YYYY-MM-DD in UK time — due dates are plain dates, so compare as strings. */
export function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

export function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Clean the editable fields from a request body. Only keys present in the body are
 * returned, so the same function serves create (all fields) and partial updates.
 */
export function cleanTaskInput(body: Record<string, unknown>) {
  const out: Partial<Pick<Task, 'title' | 'notes' | 'assignee_id' | 'assignee_name' | 'due_date' | 'priority' | 'status'>> = {};
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  if ('title' in body) out.title = str(body.title).slice(0, 300);
  if ('notes' in body) out.notes = str(body.notes).slice(0, 5000) || null;
  if ('assignee_id' in body) out.assignee_id = str(body.assignee_id) || null;
  if ('assignee_name' in body) out.assignee_name = str(body.assignee_name).slice(0, 120) || null;
  if ('due_date' in body) {
    const d = str(body.due_date);
    out.due_date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  }
  if ('priority' in body && (TASK_PRIORITIES as readonly string[]).includes(str(body.priority))) {
    out.priority = str(body.priority) as TaskPriority;
  }
  if ('status' in body && (TASK_STATUSES as readonly string[]).includes(str(body.status))) {
    out.status = str(body.status) as TaskStatus;
  }
  return out;
}
