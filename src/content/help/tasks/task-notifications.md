---
title: Task notifications and reminders
summary: When the app tells you about a task, from a new one for you or one you set being finished to the morning round-up of what’s due.
order: 60
keywords: task reminder, morning reminder, due today, overdue reminder, notification, new task from, completed a task, round-up, alert
access: tasks
---
Task notifications go in the bell, and to your phone or computer if notifications are on there. See [Notifications and the bell](/admin/help/getting-started/notifications).

## When you’re given a task

When someone gives you a task, reassigns one to you on the Tasks page, or asks Metis to, you get "New task from" their name, with the task:

- From the Tasks page, it shows its deadline too, such as "Due Thu 23 Oct", and opens the Tasks page at that task, which is highlighted.
- Added on a customer’s job (including from a WhatsApp chat), it shows the job’s name instead, and opens the job if you have CRM (the Tasks page if you don’t).
- Made by Metis, it opens the job if it’s on one, otherwise the Tasks page.

You aren’t told about tasks you give yourself. Giving someone a job’s task from that job’s **Tasks** card (**Snooze the task**, then **Whose task**) doesn’t tell them either.

The tasks the app makes by itself (deadlines, survey follow-ups, site and handover) don’t send this. They show on the Tasks page (and in **My day** for the person they’re for), and the ones with a deadline also come in the morning round-up.

## When a task you set is done

When someone else ticks off a task you made, on the Tasks page or the dashboard, you get their name and "completed a task", with its title. You aren’t told when a task on a customer’s job is ticked off on the job’s **Tasks** card or in **My work**.

## The morning round-up

Once a day, each person with open tasks due today or overdue gets one notification listing them, for example "Tasks: 2 due today, 1 overdue", with the first three titles, highest priority first (and "and … more").

- It goes to the person the task is for. A task with nobody on it, or for someone added with **Someone else…**, goes to whoever made it.
- It’s sent from the CRM’s reminder hour (9am unless it’s been changed: **Send at (UK hour)** under **Install & survey reminders (WhatsApp)** on **CRM settings**), and never during the WhatsApp quiet hours.
- A task is in the round-up once a day until it’s done. Changing its deadline puts it back in for the new date.
- Tasks on a job that’s on hold are left out.
- Tap it to open the Tasks page, or the job if all the tasks are on one job.

> **Once switched on:** The morning round-up needs crm-v3.sql.

> **Good to know:** Paperwork deadline tasks are due two working days before the deadline, so the round-up warns you in time. See [Tasks the app makes by itself](/admin/help/tasks/automatic-tasks).
