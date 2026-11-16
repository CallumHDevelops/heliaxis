'use client';

import { REMIND_LABEL, TASK_REMINDS, type TaskRemind } from '@/lib/tasks';

/**
 * A task's time of day (optional) and, once there's a time, which reminders it gets: 30 and 15 minutes before, one of them, or none.
 * Quick times first, because most are "this afternoon". Used wherever a task is made or changed.
 */
const QUICK = ['09:00', '12:00', '14:00', '16:00'];

export function TaskTime({ id, time, remind, onTime, onRemind, disabled }: { id: string; time: string; remind: TaskRemind; onTime: (t: string) => void; onRemind: (r: TaskRemind) => void; disabled?: boolean }) {
  return (
    <div className="crm-tasktime">
      <label className="crm-label" htmlFor={`${id}-time`}>
        Time <span className="crm-muted">(optional)</span>
      </label>
      <div className="crm-tasktime__row">
        <input id={`${id}-time`} className="crm-input" type="time" step={300} value={time} disabled={disabled} onChange={(e) => onTime(e.target.value)} />
        {QUICK.map((q) => (
          <button key={q} type="button" className={`crm-chipbtn${time === q ? ' on' : ''}`} disabled={disabled} onClick={() => onTime(time === q ? '' : q)}>
            {q}
          </button>
        ))}
      </div>
      {time && (
        <>
          <label className="crm-label" htmlFor={`${id}-remind`}>
            Remind me
          </label>
          <select id={`${id}-remind`} className="crm-input" value={remind} disabled={disabled} onChange={(e) => onRemind(e.target.value as TaskRemind)}>
            {TASK_REMINDS.map((r) => (
              <option key={r} value={r}>
                {REMIND_LABEL[r]}
              </option>
            ))}
          </select>
          <p className="crm-muted crm-small">It goes in your Outlook calendar too, so your phone pops it up.</p>
        </>
      )}
    </div>
  );
}
