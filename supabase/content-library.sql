-- Content library: project photos shared with the content team (social media and the website).
-- Every project is shared by default; switch it off per project, or hide single photos.
alter table crm_projects add column if not exists content_ok boolean not null default true;
alter table crm_projects add column if not exists content_ok_at timestamptz;
alter table crm_projects add column if not exists content_ok_by uuid references profiles(id);
alter table crm_photos add column if not exists content_hidden boolean not null default false;
create index if not exists crm_photos_content_idx on crm_photos (created_at desc) where content_hidden = false;
