import { createAdminClient } from '@/lib/supabase/admin';
import { installDayList, ukBankHolidays, ukDay } from '@/lib/bank-holidays';
import { crmSession, json } from '@/lib/crm/server';
import { isSurveyType, noSurveyNeeded, SALES_STAGES, surveyTypeFor } from '@/lib/crm/stages';
import { canAccess } from '@/lib/portals';
import { schemaReady } from '@/lib/schema-ready';
import { DUE_GROUPS, dueGroup, plusDays, ukDayStart, type DueGroup } from '@/lib/projects/feed';
import { readAll, withFallback } from '@/lib/projects/server';

export const dynamic = 'force-dynamic';

type Res<T> = { data: T[] | null; error: { code?: string; message?: string } | null };
type Task = {
  id: string;
  title: string;
  due_date: string | null;
  priority: string;
  status: string;
  assignee_id: string | null;
  assignee_name: string | null;
  crm_project_id: string | null;
  completed_at: string | null;
  source_key?: string | null;
};
type Job = {
  id: string;
  enquiry_id: string;
  title: string;
  stage: string;
  postcode: string | null;
  address?: string | null;
  owner_id?: string | null;
  next_step?: string | null;
  next_step_at?: string | null;
  survey_at?: string | null;
  install_at?: string | null;
  install_days?: number | null;
  project_ref?: string | null;
  products?: string[] | null;
  survey_type?: string | null;
};
type JobChip = { id: string; title: string; stage: string; ref: string | null; customer: string; enquiryId: string; postcode: string | null };
type Item = {
  kind: 'task' | 'next_step';
  id: string;
  title: string;
  due: string | null;
  /** next steps: the time it's due (tasks only have a day). */
  at: string | null;
  priority: string;
  assignee: string;
  deadline: boolean;
  job: JobChip | null;
};

const TASK_COLS = 'id, title, due_date, priority, status, assignee_id, assignee_name, crm_project_id, completed_at';
const JOB_COLS = 'id, enquiry_id, title, stage, postcode, address, owner_id, next_step, next_step_at, survey_at, install_at';
const PRIORITY: Record<string, number> = { high: 0, normal: 1, low: 2 };
/** Time of day in the UK ("09:30"), to put today's visits in order (day 2 of an install started on another day). */
const UK_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/**
 * My work on the CRM home (?scope=mine|all): job tasks and opportunities' next steps in UK-day groups
 * (overdue, today, tomorrow, the rest of the week, later, no date), what's been done today, how many
 * leads have no next step, and today's surveys and install days. People with the Tasks portal also get
 * their own tasks that aren't on a job. Ticks, snoozes and new tasks use the existing task and job
 * routes, so this only reads.
 */
export async function GET(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const all = new URL(req.url).searchParams.get('scope') === 'all';
  const me = s.user.id;
  const db = createAdminClient();
  const today = ukDay(Date.now());
  const todayStart = ukDayStart(today);
  const tomorrowStart = ukDayStart(plusDays(today, 1));

  const tasksQ = (cols: string) => {
    let q = db.from('tasks').select(cols).not('crm_project_id', 'is', null).neq('status', 'done');
    if (!all) q = q.eq('assignee_id', me);
    return q.order('due_date', { ascending: true, nullsFirst: false }).limit(500) as unknown as PromiseLike<Res<Task>>;
  };
  const ownQ = (cols: string) =>
    db.from('tasks').select(cols).is('crm_project_id', null).neq('status', 'done').eq('assignee_id', me).limit(200) as unknown as PromiseLike<Res<Task>>;
  const doneQ = (cols: string) => {
    let q = db.from('tasks').select(cols).eq('status', 'done').gte('completed_at', todayStart);
    if (!all) q = q.eq('assignee_id', me);
    return q.order('completed_at', { ascending: false }).limit(50) as unknown as PromiseLike<Res<Task>>;
  };
  const stepsQ = () => {
    let q = db.from('crm_projects').select(JOB_COLS).not('next_step', 'is', null).not('stage', 'in', '(complete,lost)');
    if (!all) q = q.eq('owner_id', me);
    return q.order('next_step_at', { ascending: true, nullsFirst: false }).limit(500);
  };
  const [tasksR, ownR, doneR, stepsR, stepsDone, backlog, surveysToday, installs, schema, hols] = await Promise.all([
    withFallback<Task>(tasksQ, TASK_COLS, 'source_key'),
    canAccess(s.profile, 'tasks') ? withFallback<Task>(ownQ, TASK_COLS, 'source_key') : Promise.resolve({ data: [] as Task[], error: null }),
    doneQ(TASK_COLS),
    stepsQ(),
    // Next steps ticked off today (the job page logs "✓ Done: …").
    (() => {
      let q = db.from('crm_activities').select('id, project_id, body, at, by_id').eq('kind', 'system').like('body', '✓ Done:%').gte('at', todayStart);
      if (!all) q = q.eq('by_id', me);
      return q.order('at', { ascending: false }).limit(50);
    })(),
    db.from('crm_projects').select('id', { count: 'exact', head: true }).in('stage', SALES_STAGES).is('next_step', null),
    // With the survey type (crm-v3.sql), so a home visit (no survey needed) isn't offered a survey form.
    withFallback<Job>(
      (cols) =>
        db
          .from('crm_projects')
          .select(cols)
          .gte('survey_at', todayStart)
          .lt('survey_at', tomorrowStart)
          .neq('stage', 'lost')
          .order('survey_at')
          .limit(50) as unknown as PromiseLike<Res<Job>>,
      `${JOB_COLS}, products`,
      'survey_type'
    ),
    // Installs can run for up to 30 working days, so look back far enough to catch day 30 of one.
    withFallback<Job>(
      (cols) =>
        db
          .from('crm_projects')
          .select(cols)
          .gte('install_at', ukDayStart(plusDays(today, -50)))
          .lt('install_at', tomorrowStart)
          .not('stage', 'in', '(lost,complete)')
          .order('install_at')
          .limit(200) as unknown as PromiseLike<Res<Job>>,
      JOB_COLS,
      'install_days'
    ),
    schemaReady(),
    ukBankHolidays(),
  ]);
  if (tasksR.error) return json({ error: tasksR.error.message }, 500);

  const tasks = [...((tasksR.data ?? []) as Task[]), ...((ownR.data ?? []) as Task[])];
  const steps = (stepsR.data ?? []) as Job[];
  const installToday = ((installs.data ?? []) as Job[]).filter((j) => {
    if (!j.install_at) return false;
    return installDayList(ukDay(j.install_at), Math.max(1, Number(j.install_days) || 1), hols).includes(today);
  });
  const visitJobs = [...((surveysToday.data ?? []) as Job[]), ...installToday];

  // The jobs and customers named on the cards.
  const done = (doneR.data ?? []) as Task[];
  const doneSteps = (stepsDone.data ?? []) as { id: string; project_id: string | null; body: string; at: string }[];
  const jobIds = [...new Set([...tasks, ...done].map((t) => t.crm_project_id).filter((x): x is string => !!x).concat(doneSteps.map((d) => d.project_id ?? '')))];
  const known = new Map([...steps, ...visitJobs].map((j) => [j.id, j]));
  const fetched = await readAll<Job>(
    jobIds.filter((id) => id && !known.has(id)),
    (b, from, to) => db.from('crm_projects').select('id, enquiry_id, title, stage, postcode').in('id', b).order('id').range(from, to)
  );
  for (const j of fetched) known.set(j.id, j);
  const jobs = [...known.values()];
  type Cust = { id: string; name: string };
  type Ref = { id: string; project_ref?: string | null };
  const people = [...new Set([...tasks.map((t) => t.assignee_id), ...steps.map((j) => j.owner_id)].filter((x): x is string => !!x))];
  const [customers, refs, profiles] = await Promise.all([
    readAll<Cust>([...new Set(jobs.map((j) => j.enquiry_id))], (b, from, to) => db.from('enquiries').select('id, name').in('id', b).order('id').range(from, to)),
    // Job refs (crm-v3.sql / customer-refs.sql); none before.
    readAll<Ref>(
      jobs.map((j) => j.id),
      (b, from, to) => db.from('crm_projects').select('id, project_ref').in('id', b).order('id').range(from, to) as unknown as PromiseLike<Res<Ref>>
    ),
    readAll<{ id: string; full_name: string | null; email: string | null }>(people, (b, from, to) =>
      db.from('profiles').select('id, full_name, email').in('id', b).order('id').range(from, to)
    ),
  ]);
  const nameOfCustomer = new Map(customers.map((c) => [c.id, c.name]));
  const refOf = new Map(refs.map((r) => [r.id, r.project_ref ?? null]));
  const nameOf = new Map(profiles.map((p) => [p.id, p.full_name || p.email || '']));
  const chip = (id: string | null | undefined): JobChip | null => {
    const j = id ? known.get(id) : undefined;
    if (!j) return null;
    return { id: j.id, title: j.title, stage: j.stage, ref: refOf.get(j.id) ?? null, customer: nameOfCustomer.get(j.enquiry_id) ?? '', enquiryId: j.enquiry_id, postcode: j.postcode };
  };

  const items: Item[] = [
    ...tasks.map(
      (t): Item => ({
        kind: 'task',
        id: t.id,
        title: t.title,
        due: t.due_date,
        at: null,
        priority: t.priority,
        assignee: t.assignee_id ? (nameOf.get(t.assignee_id) ?? '') : t.assignee_name || '',
        deadline: !!t.source_key?.startsWith('deadline:'),
        job: chip(t.crm_project_id),
      })
    ),
    ...steps.map(
      (j): Item => ({
        kind: 'next_step',
        id: j.id,
        title: j.next_step ?? '',
        due: j.next_step_at ? ukDay(j.next_step_at) : null,
        at: j.next_step_at ?? null,
        priority: 'normal',
        assignee: j.owner_id ? (nameOf.get(j.owner_id) ?? '') : '',
        deadline: false,
        job: chip(j.id),
      })
    ),
  ];
  const groups = Object.fromEntries(DUE_GROUPS.map((g) => [g, [] as Item[]])) as Record<DueGroup, Item[]>;
  for (const i of items) groups[dueGroup(i.due, today)].push(i);
  for (const g of DUE_GROUPS) {
    groups[g].sort(
      (a, b) =>
        (a.due ?? '9999').localeCompare(b.due ?? '9999') ||
        (PRIORITY[a.priority] ?? 1) - (PRIORITY[b.priority] ?? 1) ||
        (a.at ?? '').localeCompare(b.at ?? '') ||
        a.title.localeCompare(b.title)
    );
  }

  const visits = [
    ...((surveysToday.data ?? []) as Job[]).map((j) => {
      const type = isSurveyType(j.survey_type) ? j.survey_type : surveyTypeFor(j.products ?? []);
      return {
        kind: 'survey' as const,
        at: j.survey_at!,
        day: 1,
        days: 1,
        address: j.address ?? null,
        job: chip(j.id),
        // Infrared, an EV charger or LEDs only: a home visit, with no survey form.
        visit: noSurveyNeeded(j),
        // Solar (and solar + heat pump) surveys are done in the app; heat pump only is the SimpliHeat record.
        surveyType: type === 'ashp' ? ('ashp' as const) : ('solar' as const),
      };
    }),
    ...installToday.map((j) => {
      const dates = installDayList(ukDay(j.install_at!), Math.max(1, Number(j.install_days) || 1), hols);
      return { kind: 'install' as const, at: j.install_at!, day: dates.indexOf(today) + 1, days: dates.length, address: j.address ?? null, job: chip(j.id) };
    }),
  ].sort((a, b) => UK_TIME.format(new Date(a.at)).localeCompare(UK_TIME.format(new Date(b.at))));

  // Waiting for you: booking requests to confirm (survey-booking.sql).
  const requests = schema.booking
    ? await db
        .from('survey_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'requested')
        .then(
          (r) => (r.error ? 0 : (r.count ?? 0)),
          () => 0
        )
    : 0;

  return json({
    today,
    scope: all ? 'all' : 'mine',
    groups,
    doneToday: [
      ...done.map((t) => ({ kind: 'task' as const, id: t.id, title: t.title, at: t.completed_at, job: chip(t.crm_project_id) })),
      ...doneSteps.map((d) => ({ kind: 'next_step' as const, id: d.id, title: d.body.replace(/^✓ Done:\s*/, ''), at: d.at, job: chip(d.project_id) })),
    ].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')),
    // Everyone's: the backlog is shared.
    noNextStep: backlog.count ?? 0,
    todayVisits: visits,
    waiting: { bookingRequests: requests },
    schema,
  });
}
