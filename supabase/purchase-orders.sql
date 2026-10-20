-- 31. Purchase orders against jobs: suppliers, purchase orders (PO-0001, PO-0002 …) and their lines.
--     Kit for a job is ordered from a supplier on a PO, emailed to them as a PDF from the shared
--     mailbox (or downloaded and marked as sent), then confirmed, delivered and invoiced.
--     Money is in pence (whole numbers); each line's unit cost is ex VAT, with its own VAT rate.
--     Run after crm-v3.sql. Safe to run twice. Server-only tables (RLS on, no policies).

-- Job references (project_ref) come from crm-v3.sql, and the PO screens show them.
do $$ begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'crm_projects' and column_name = 'project_ref') then
    raise exception 'Run crm-v3.sql first, then this file.';
  end if;
end $$;

-- Who we buy from. Archived ones are hidden from the picker but kept for the orders that used them.
create table if not exists public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) between 1 and 120),
  contact_name    text,
  email           text,                          -- where purchase orders are emailed
  phone           text,
  account_number  text,                          -- our account number with them
  address         text,
  notes           text,
  archived_at     timestamptz,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- One live supplier per name ("CEF" and "cef " are the same supplier).
create unique index if not exists suppliers_live_name_key on public.suppliers (lower(btrim(name))) where archived_at is null;

create sequence if not exists public.purchase_order_seq;

create table if not exists public.purchase_orders (
  id                      uuid primary key default gen_random_uuid(),
  po_number               text not null unique,  -- PO-0001, set by the trigger below
  project_id              uuid not null references public.crm_projects(id) on delete cascade,
  supplier_id             uuid not null references public.suppliers(id) on delete restrict,
  status                  text not null default 'draft' check (status in ('draft','sent','confirmed','delivered','cancelled')),
  deliver_to              text not null default 'site' check (deliver_to in ('site','office','collect')),
  deliver_address         text,                  -- the address it was saved with (the site's or the office's); none for collect
  deliver_postcode        text,
  required_by             date,
  notes                   text,                  -- to the supplier: printed on the PO
  internal_note           text,                  -- for us only: never on the PO
  net_pence               bigint not null default 0 check (net_pence >= 0),   -- the lines' totals, saved with them
  vat_pence               bigint not null default 0 check (vat_pence >= 0),   -- (src/lib/purchase-orders/money.ts)
  gross_pence             bigint not null default 0 check (gross_pence >= 0),
  sent_at                 timestamptz,           -- the last time it went to the supplier
  sent_to                 text,                  -- the email address, or how it went ("Marked as sent")
  sent_by                 uuid references public.profiles(id) on delete set null,
  changed_since_sent      boolean not null default false,   -- edited after it went: send it again
  confirmed_at            timestamptz,
  delivered_at            timestamptz,
  cancelled_at            timestamptz,
  supplier_invoice_ref    text,
  supplier_invoice_pence  bigint check (supplier_invoice_pence >= 0),         -- their invoice total, inc. VAT
  paid_on                 date,
  created_by              uuid references public.profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists purchase_orders_project_idx  on public.purchase_orders (project_id, created_at desc);
create index if not exists purchase_orders_supplier_idx on public.purchase_orders (supplier_id);
create index if not exists purchase_orders_status_idx   on public.purchase_orders (status, required_by);

create table if not exists public.purchase_order_lines (
  id                 uuid primary key default gen_random_uuid(),
  purchase_order_id  uuid not null references public.purchase_orders(id) on delete cascade,
  position           int not null check (position >= 0),
  description        text not null check (length(btrim(description)) between 1 and 300),
  part_number        text,
  qty                numeric(12,3) not null check (qty > 0),
  unit_cost_pence    bigint check (unit_cost_pence >= 0),   -- ex VAT; empty = not priced yet (it can't be sent like that)
  vat_rate           int not null default 20 check (vat_rate in (20, 5, 0)),
  received_qty       numeric(12,3) check (received_qty >= 0),
  unique (purchase_order_id, position)
);

-- PO-0001 … PO-9999, then PO-10000: never reused, even when a draft is deleted.
create or replace function public.purchase_orders_number() returns trigger
language plpgsql set search_path = public as $$
declare n bigint;
begin
  if new.po_number is null or btrim(new.po_number) = '' then
    n := nextval('public.purchase_order_seq');
    new.po_number := 'PO-' || lpad(n::text, greatest(4, length(n::text)), '0');
  end if;
  return new;
end $$;
drop trigger if exists purchase_orders_number on public.purchase_orders;
create trigger purchase_orders_number before insert on public.purchase_orders
  for each row execute function public.purchase_orders_number();

-- Replace an order's lines and their totals in one go, so a failed save never leaves half a list.
create or replace function public.purchase_order_save_lines(p_order uuid, p_lines jsonb, p_net bigint, p_vat bigint, p_gross bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.purchase_order_lines where purchase_order_id = p_order;
  insert into public.purchase_order_lines (purchase_order_id, position, description, part_number, qty, unit_cost_pence, vat_rate, received_qty)
  select p_order,
         (l->>'position')::int,
         l->>'description',
         nullif(l->>'part_number', ''),
         (l->>'qty')::numeric,
         (l->>'unit_cost_pence')::bigint,
         (l->>'vat_rate')::int,
         (l->>'received_qty')::numeric
    from jsonb_array_elements(p_lines) as l;
  update public.purchase_orders
     set net_pence = p_net, vat_pence = p_vat, gross_pence = p_gross, updated_at = now()
   where id = p_order;
end $$;

revoke execute on function public.purchase_order_save_lines(uuid, jsonb, bigint, bigint, bigint) from public, anon, authenticated;
grant  execute on function public.purchase_order_save_lines(uuid, jsonb, bigint, bigint, bigint) to service_role;

alter table public.suppliers            enable row level security;
alter table public.purchase_orders      enable row level security;
alter table public.purchase_order_lines enable row level security;

notify pgrst, 'reload schema';
