-- 30. Ad spend in reports: which Meta ad, ad set and campaign each lead came from, by Meta's own
--     ids, so CRM → Reports can put an ad's spend beside its leads and sales even when two ads
--     share a name or one is renamed (src/lib/meta-ads.ts). Filled in for new lead-form leads and
--     WhatsApp ad chats from now on; Enquiries → Import fills them in for leads already brought in.
--     Older leads keep matching by ad name. Safe to run twice.
alter table public.enquiries add column if not exists meta_ad_id text;
alter table public.enquiries add column if not exists meta_adset_id text;
alter table public.enquiries add column if not exists meta_campaign_id text;
-- Click-to-WhatsApp click id from a WhatsApp ad's referral, for sending conversions back to Meta.
alter table public.enquiries add column if not exists meta_ctwa_clid text;

create index if not exists enquiries_meta_ad_id_idx on public.enquiries (meta_ad_id) where meta_ad_id is not null;
create index if not exists enquiries_meta_adset_id_idx on public.enquiries (meta_adset_id) where meta_adset_id is not null;
create index if not exists enquiries_meta_campaign_id_idx on public.enquiries (meta_campaign_id) where meta_campaign_id is not null;
