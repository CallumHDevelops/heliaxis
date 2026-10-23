---
title: Surveys to do, started and finished
summary: The To do, Drafts and Done tabs: every survey by day, what state it’s in, and the button to open it.
order: 90
keywords: survey list, to do, drafts, done, finished surveys, started surveys, booked surveys, new survey, offline, no signal
where: CRM › Surveys and diary › To do
path: /admin/surveys/todo
access: crm
---
Three tabs on the Surveys and diary page list the surveys themselves:

- **To do** ("Surveys to do"): booked and started surveys, grouped **Earlier, not finished**, **Today**, **Tomorrow**, **Later** and **Not dated**.
- **Drafts** ("Started surveys"): surveys someone has started but not finished.
- **Done** ("Finished surveys"): finished surveys, newest first, with who did each one.

A survey appears under **To do** by itself once it’s booked through the Diary or by the customer. A survey date typed on the job by hand shows up from the day before, once someone on the CRM has the app open with signal.

## Each row

The time (and the date, where needed), the customer, their postcode, **Solar** or **Heat pump**, the job reference, and a status:

| Status | Means |
|---|---|
| Booked | Not started yet |
| Started | Someone has started it |
| Started (changes on this phone) | Answers on this phone are still to upload |
| Finished, uploading | Finished on site, still sending answers or photos |
| Not finished: … | Finishing failed. Open it to see why |
| Finished | Done |
| Finished, drawings to do | Done, but the roof layout or cable route drawings are still to do |

**⚑ 2 red flags** after the status means the survey found problems: see [Red flags and warnings](/admin/help/surveys/red-flags).

The button on the right is **Start**, **Continue**, **Open** or **Report**. A finished solar survey with drawings still to do also has **✎ Draw**.

## Start a survey that isn’t listed

1. On **To do** or **Drafts**, tap **+ New survey**.
2. Search for the customer by name, postcode or phone.
3. Tap one of their jobs, or **+ New opportunity for …** to start a new one.
4. Under **What kind of survey?**, pick **Solar and battery** or **Heat pump (SimpliHeat)**.
5. Tap **Start survey**.

If the customer isn’t there, add them in the CRM first. **+ New survey** needs signal.

## With no signal

The lists still open, showing the surveys saved on the phone: "No signal: showing the surveys saved on this phone." Surveys booked for today and tomorrow are copied to the phone whenever the app is open with signal. See [Start a solar survey on your phone](/admin/help/surveys/start-a-survey).

> **Once switched on:** Surveys appear once surveys.sql has been run.
