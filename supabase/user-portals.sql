-- 11. Per-portal access for the main users database (/admin/users).
--     Admins can open every portal; members only the ones listed here.
--     Keys: cms, enquiries, analytics, subcontractors, team, social, rams (see src/lib/portals.ts).
alter table public.profiles
  add column if not exists portals text[] not null default '{}';

-- Keep existing approved members' current access (CMS + enquiries) — only rows never set.
update public.profiles
   set portals = array['cms','enquiries']
 where role = 'member' and status = 'approved' and portals = '{}';
