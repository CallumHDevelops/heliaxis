-- Answers to document templates (src/lib/templates), one record per project and form: the heat pump
-- commissioning record, the cylinder record, the handover certificate. Entered in HAP or arriving from
-- SimpliHeat; each answer keeps who entered it, when and from where. Server-only (service role); RLS on with no
-- policies, like the other tables. Additive and safe to re-run: nothing is dropped.
-- Run after crm-v3.sql. supabase/template-documents-rollback.sql undoes it.
--
-- A record is a draft until it is signed. A signed record is the record: its answers cannot change, it cannot be
-- deleted, and the only thing that can happen to it is being superseded by a revision (a new record, revision + 1,
-- starting from its answers). A draft can be deleted. A signed record can still gain a signature.

create table if not exists public.template_documents (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.crm_projects(id) on delete cascade,
  -- Heliaxis's own code for the template: HX-HP-02.
  template_code text not null check (template_code ~ '^HX-[A-Z]{2,4}-[0-9]{2}$'),
  -- The template's issue when this record was started, kept so a record signed last year still reads as it did.
  issue         text not null default 'Issue 1',
  revision      integer not null default 1 check (revision >= 1),
  status        text not null default 'draft' check (status in ('draft','signed','superseded')),
  -- By field key: text and numbers as typed, yes/no as 'yes' | 'no' | 'na'.
  answers       jsonb not null default '{}'::jsonb,
  -- By field key: { by, at, source: 'hap' | 'simpliheat', confirmed } for the answer now held.
  provenance    jsonb not null default '{}'::jsonb,
  -- By signature line: { name, at, source: 'device' | 'remote' | 'hap', image } (image: a PNG data URL).
  signed        jsonb not null default '{}'::jsonb,
  signed_at     timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  updated_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (project_id, template_code, revision)
);
-- One live (not superseded) record per project and form.
create unique index if not exists template_documents_live on public.template_documents (project_id, template_code) where status <> 'superseded';
create index if not exists template_documents_project_idx on public.template_documents (project_id);
alter table public.template_documents enable row level security;

-- A signed record is the record: its answers and the signatures already on it cannot change. It can still gain a
-- signature (the customer signing later, through a link), but never lose or alter one.
create or replace function public.template_documents_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'A % record is part of the record and cannot be deleted (%).', old.status, old.template_code using errcode = '23001';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'superseded' then
      raise exception 'This revision of % has been superseded and cannot be changed.', old.template_code using errcode = '23001';
    end if;
    if old.status = 'signed' then
      if new.status = 'draft' then
        raise exception 'A signed % record cannot be reopened: revise it.', old.template_code using errcode = '23001';
      end if;
      if new.answers is distinct from old.answers or new.provenance is distinct from old.provenance
         or new.template_code is distinct from old.template_code or new.project_id is distinct from old.project_id
         or new.revision is distinct from old.revision
         or exists (select 1 from jsonb_each(old.signed) e where new.signed -> e.key is distinct from e.value) then
        raise exception 'This % record is signed: revise it to change it.', old.template_code using errcode = '23001';
      end if;
    end if;
    if new.status = 'signed' and old.status = 'draft' then
      new.signed_at := coalesce(new.signed_at, now());
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists template_documents_guard on public.template_documents;
create trigger template_documents_guard before update or delete on public.template_documents
  for each row execute function public.template_documents_guard();

-- Revising a signed record, in one step: the signed one is superseded and revision + 1 starts as a draft from its
-- answers. Done here so it either happens whole or not at all (a superseded record cannot be put back).
create or replace function public.revise_template_document(p_id uuid, p_by uuid) returns uuid
language plpgsql set search_path = public as $$
declare old public.template_documents; new_id uuid;
begin
  select * into old from public.template_documents where id = p_id for update;
  if not found then raise exception 'No such record.' using errcode = 'P0002'; end if;
  if old.status <> 'signed' then raise exception 'Only a signed record is revised (this one is %).', old.status using errcode = '23001'; end if;
  update public.template_documents set status = 'superseded' where id = p_id;
  insert into public.template_documents (project_id, template_code, issue, revision, answers, provenance, created_by, updated_by)
    values (old.project_id, old.template_code, old.issue, old.revision + 1, old.answers, old.provenance, p_by, p_by)
    returning id into new_id;
  return new_id;
end $$;
-- Server-only: nobody calls this through the API.
do $$
begin
  revoke execute on function public.revise_template_document(uuid, uuid) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke execute on function public.revise_template_document(uuid, uuid) from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke execute on function public.revise_template_document(uuid, uuid) from authenticated; end if;
end $$;

notify pgrst, 'reload schema';
