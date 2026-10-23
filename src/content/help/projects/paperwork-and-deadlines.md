---
title: Paperwork and deadlines
summary: Record the DNO route, MCS, EIC, Building Regs and guarantees, download the ENA photos, and keep the paperwork deadlines.
order: 110
keywords: MCS certificate number, G98, G99, DNO route, ENA application, main cut-out, meter photo, Building Regs, NICEIC, NAPIT, EIC, BUS grant, guarantee, insurance-backed guarantee, warranties, Smart Export Guarantee, overdue, Save paperwork
where: Operations › Projects › a job › Overview › Paperwork
access: crm
---
The **Paperwork** card is on a job’s Overview.

![The Paperwork card after switch-on, with deadlines, DNO route, the ENA photos and the paperwork fields.](/help/projects/s09-paperwork-deadlines.jpg "Paperwork after switch-on: deadlines (MCS done, G98, Building Regs, guarantee), DNO route, the ENA photos and the fields.")

1. Open **Paperwork**. It’s open already on a computer, and shows an **Overdue** tag when something’s late.
2. Check the deadlines. Each appears once the thing it runs from has happened:
   - from commissioning: **Register the MCS certificate** (10 working days), **Tell the DNO (G98) about the new system** (28 days, G98 jobs) and **Notify Building Regs (NICEIC / NAPIT)** (30 days);
   - from the MCS **Registered** date: **Buy the insurance-backed guarantee** (7 days);
   - from when the G99 application went in: **Chase the DNO about the G99 application** (45 working days);
   - from when the BUS voucher was issued: the voucher, before it expires (heat pumps).

   Each shows something like “Due Tue 17 Nov · in 26 days”, “Due today”, “2 days late” or **Done ✓**. Each becomes a task 2 working days before it’s due (the BUS voucher: 14 days before).
3. Choose the **DNO route**: **Not decided**, **G98 (tell the DNO after)**, **G99 (apply first)**, **Demand only** or **Not needed**.
4. Under **For the ENA application**, press **⬇ Download** for the main cut-out and meter photos from the latest finished solar survey. The files are named after the job, such as HX-0042-main-cut-out.jpg.
5. Fill in **MCS** (**Certificate number**, **Registered**), **Electrical** (**EIC done**), **BUS grant** for heat pumps, **Building Regs** (**Reference**, **Notified**) and **Guarantees** (provider, guarantee reference and date, **Warranties registered**, **Smart Export Guarantee guidance sent**).
6. Press **Save paperwork**.

> **Good to know:** Typing the MCS number, the Building Regs reference and so on here is what ticks the checklist and closes the deadline.

> **Once switched on:** The paperwork and deadlines need crm-v3.sql. The photos under **For the ENA application** need surveys.sql.

For each deadline and what closes it, see [Paperwork deadlines at a glance](/admin/help/projects/deadlines). The MCS certificate, warranty insurance and Building Regulations certificate also go into the handover pack: see [Who makes each handover document](/admin/help/handover/who-makes-each-document).
