-- 30. Makes the CRM home's Latest notes load faster: the newest timeline entries across every job.
--     (Each customer's own timeline already has its index, crm_activities_enquiry_idx in crm.sql.)
--     Optional: run it any time; nothing depends on it, and the notes work without it. Safe to re-run.

create index if not exists crm_activities_at_idx on public.crm_activities (at desc);

notify pgrst, 'reload schema';
