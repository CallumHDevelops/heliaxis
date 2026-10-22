---
title: Tasks the app makes by itself
summary: The paperwork deadline, survey follow-up, site and handover tasks the app adds for you, and who gets them.
order: 50
keywords: automatic tasks, auto tasks, deadline tasks, paperwork, MCS, G98, G99, Building Regs, BUS voucher, guarantee, survey follow-up, drawings, electricity bill, Metis tasks
where: Team › Tasks
path: /admin/tasks
access: tasks
---
Some tasks appear without anyone typing them. They’re ordinary tasks: they’re on the Tasks page with the customer’s job beside them (**Job:** …, for people with CRM), on the job itself, and in **My day** for the person they’re for. Tick them off like any other.

Each one is only made once per job, so they don’t pile up. The paperwork, survey, site and handover tasks below don’t send a "New task from" notification; the ones with a deadline come in the morning round-up instead (see [Task notifications and reminders](/admin/help/tasks/task-notifications)).

## Paperwork deadlines

When a deadline starts to apply to a job (for example once the system has been commissioned), the app adds a **High** priority task for whoever looks after the job (unassigned if nobody does), due 2 working days before the deadline (14 days before, for the BUS voucher, and never earlier than today):

- "Register the MCS certificate (deadline …)"
- "Tell the DNO (G98) about the new system (deadline …)"
- "Notify Building Regs (NICEIC / NAPIT) (deadline …)"
- "Buy the insurance-backed guarantee (deadline …)"
- "Redeem the BUS voucher (it expires …)"
- "Chase the DNO about the G99 application (deadline …)"

Each task’s notes say what the rule is. If a deadline’s date changes, a new task is made for the new date, and the old one is left for you to close. See [Paperwork deadlines at a glance](/admin/help/projects/deadlines).

> **Once switched on:** Deadline tasks need crm-v3.sql.

## After a solar survey

When a solar survey is finished, the app adds:

- "Book a SimpliHeat heat pump survey for …", if they said they’re interested in a heat pump and there’s no heat pump survey on the job yet.
- "Finish the drawings for …’s survey (roof layout, cable routes)", for the surveyor, if drawings were left to do. It ticks itself off once the drawings are done.
- "Get …’s electricity bill (yearly use in kWh)", "Get …’s supplier and tariff", or anything else they said they’d send.

The heat pump and "Get …" tasks go to whoever looks after the job (or the surveyor, if nobody does). They have no deadline.

## On site and at handover

When trades sign off, the electrician finishes and the handover pack goes, the app adds tasks such as reviewing a trade’s sign-off or a put-right, chasing scaffold strike photos that still haven’t come in after the scaffold came down, telling or chasing the DNO, setting up monitoring remotely, the handover call, uploading documents into the handover pack, and sending the final invoice. They’re listed in [Tasks and next steps on a job](/admin/help/projects/tasks-and-next-steps).

## From Metis

Ask Metis to remind you or someone else of something and she can create a task. Its notes end "Added by Metis for" your name. If it’s for someone else, they get a "New task from" notification. See [What Metis can do](/admin/help/metis/what-metis-can-do).

> **Good to know:** A **Call-back reminder** set from a WhatsApp chat isn’t a task: it becomes the job’s next step, shows under **My day** as a follow-up, and sends a notification when it’s due. See [Add a task from a job or a WhatsApp chat](/admin/help/tasks/from-a-job-or-chat).
