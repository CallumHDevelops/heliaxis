-- ProspectPV · server-side functions
--
-- The public landing route (/r/[code]) never touches tables directly. It calls
-- these security definer functions, each scoped to one short code, using the
-- service role from server code. Execute is granted to service_role only.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.pv_setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select value from public.pv_settings where key = p_key;
$$;

-- Normalises a code from a URL. Returns null if it can't be a valid code,
-- so lookups on junk input are cheap and uniform.
create or replace function public.pv_normalise_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when upper(btrim(p_code)) ~ '^[2-9A-HJ-NP-Z]{8}$' then upper(btrim(p_code))
    else null
  end;
$$;

-- Fixed-window rate limiter. Returns true if the call is allowed.
-- Bucket is e.g. 'landing:ip:203.0.113.4'.
create or replace function public.pv_rate_limit_hit(p_bucket text, p_window_seconds int, p_max int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits int;
begin
  insert into public.pv_rate_limits as r (bucket, window_start, hits)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update set
    hits = case
      when r.window_start < now() - make_interval(secs => p_window_seconds) then 1
      else r.hits + 1 end,
    window_start = case
      when r.window_start < now() - make_interval(secs => p_window_seconds) then now()
      else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;

-- ---------------------------------------------------------------------------
-- Landing page
-- ---------------------------------------------------------------------------

-- Opens a landing page for one code: records the scan, returns everything the
-- page needs, or null for unknown / expired / returned codes.
-- Figures come from printed_values, so they always match the letter.
create or replace function public.pv_landing_open(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code   text := public.pv_normalise_code(p_code);
  v_letter public.pv_letters%rowtype;
  v_first  boolean;
begin
  if v_code is null then
    return null;
  end if;

  select * into v_letter
  from public.pv_letters
  where short_code = v_code
    and expires_at > now()
    and status <> 'returned';

  if not found then
    return null;
  end if;

  v_first := v_letter.first_viewed_at is null;

  update public.pv_letters
  set view_count      = view_count + 1,
      first_viewed_at = coalesce(first_viewed_at, now()),
      last_viewed_at  = now()
  where id = v_letter.id;

  insert into public.pv_responses (letter_id, uprn, type, payload)
  values (v_letter.id, v_letter.uprn, 'qr_scan', jsonb_build_object('first_view_at', now()))
  on conflict (letter_id) where type = 'qr_scan' do nothing;

  return jsonb_build_object(
    'letterCode',   v_letter.short_code,
    'templateKey',  v_letter.template_key,
    'firstView',    v_first,
    'printed',      v_letter.printed_values,
    'extras', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', e.key, 'name', e.name, 'description', e.description,
               'price', e.price, 'effect', e.effect)
             order by e.display_order, e.name)
      from public.pv_extras e
      where e.active), '[]'::jsonb),
    'settings', coalesce((
      select jsonb_object_agg(s.key, s.value)
      from public.pv_settings s
      where s.key in ('calc.assumptions','calc.coefficients','calc.inputs',
                      'battery','finance','company','landing')), '{}'::jsonb)
  );
end;
$$;

-- Stores a booking against a code. The caller (server route) validates the
-- payload and recomputes the quoted total before calling this.
create or replace function public.pv_submit_booking(p_code text, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_letter public.pv_letters%rowtype;
  v_id     uuid;
begin
  select * into v_letter
  from public.pv_letters
  where short_code = public.pv_normalise_code(p_code)
    and expires_at > now()
    and status <> 'returned';

  if not found then
    return null;
  end if;

  if coalesce((p_payload ->> 'consent')::boolean, false) is not true then
    raise exception 'consent required' using errcode = '22023';
  end if;

  insert into public.pv_responses (letter_id, uprn, type, payload)
  values (v_letter.id, v_letter.uprn, 'booking', p_payload)
  returning id into v_id;

  return v_id;
end;
$$;

-- "Stop letters to this address". Works for expired codes too: anyone holding
-- a letter must always be able to opt out.
create or replace function public.pv_opt_out(p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_letter public.pv_letters%rowtype;
  v_prop   public.pv_properties%rowtype;
begin
  select * into v_letter
  from public.pv_letters
  where short_code = public.pv_normalise_code(p_code);

  if not found then
    return false;
  end if;

  select * into v_prop from public.pv_properties where uprn = v_letter.uprn;

  insert into public.pv_suppression (uprn, address, reason)
  values (
    v_letter.uprn,
    concat_ws(', ', v_prop.address_line1, v_prop.address_line2, v_prop.town, v_prop.postcode),
    'landing_opt_out')
  on conflict (uprn) do nothing;

  insert into public.pv_responses (letter_id, uprn, type, payload)
  values (v_letter.id, v_letter.uprn, 'opt_out', jsonb_build_object('source', 'landing'));

  return true;
end;
$$;


-- Pricing context for a booking: what the landing page showed, without
-- counting a view. The booking route recomputes the quoted total from this
-- rather than trusting the browser.
create or replace function public.pv_booking_context(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'letterCode', l.short_code,
    'printed',    l.printed_values,
    'extras', coalesce((
      select jsonb_agg(jsonb_build_object('key', e.key, 'name', e.name, 'description', e.description,
                                          'price', e.price, 'effect', e.effect))
      from public.pv_extras e where e.active), '[]'::jsonb),
    'battery', public.pv_setting('battery'),
    'landing', public.pv_setting('landing'),
    'inputs',  public.pv_setting('calc.inputs')
  )
  from public.pv_letters l
  where l.short_code = public.pv_normalise_code(p_code)
    and l.expires_at > now()
    and l.status <> 'returned';
$$;

-- ---------------------------------------------------------------------------
-- Pipeline guards (used by scans and letter generation)
-- ---------------------------------------------------------------------------

-- True if a letter may be generated for this UPRN now: not suppressed, and no
-- letter within the re-mail window (settings 'letters'.remail_window_months).
create or replace function public.pv_can_mail(p_uprn bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.pv_suppression s where s.uprn = p_uprn)
     and not exists (
       select 1 from public.pv_letters l
       where l.uprn = p_uprn
         and l.created_at > now() - make_interval(months =>
               coalesce((public.pv_setting('letters') ->> 'remail_window_months')::int, 6))
     );
$$;

-- Estimated API spend in the current calendar month (UK time), for the spend cap.
create or replace function public.pv_month_api_spend(p_provider text default null)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(est_cost), 0)
  from public.pv_api_log
  where created_at >= (date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London')
    and (p_provider is null or provider = p_provider);
$$;

-- Per-template results for a campaign (split testing dashboard).
create or replace function public.pv_campaign_template_stats(p_campaign_id uuid)
returns table (template_key smallint, letters bigint, scanned bigint, bookings bigint, booking_rate numeric)
language sql
stable
set search_path = ''
as $$
  select l.template_key,
         count(*)                                                     as letters,
         count(*) filter (where l.first_viewed_at is not null)        as scanned,
         count(distinct b.letter_id)                                  as bookings,
         round(100.0 * count(distinct b.letter_id) / nullif(count(*), 0), 2) as booking_rate
  from public.pv_letters l
  left join public.pv_responses b on b.letter_id = l.id and b.type = 'booking'
  where l.campaign_id = p_campaign_id
  group by l.template_key
  order by l.template_key;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function
  public.pv_setting(text),
  public.pv_rate_limit_hit(text, int, int),
  public.pv_landing_open(text),
  public.pv_submit_booking(text, jsonb),
  public.pv_opt_out(text),
  public.pv_booking_context(text),
  public.pv_can_mail(bigint),
  public.pv_month_api_spend(text)
from public, anon, authenticated;

grant execute on function
  public.pv_setting(text),
  public.pv_rate_limit_hit(text, int, int),
  public.pv_landing_open(text),
  public.pv_submit_booking(text, jsonb),
  public.pv_opt_out(text),
  public.pv_booking_context(text),
  public.pv_can_mail(bigint),
  public.pv_month_api_spend(text)
to service_role;

-- Staff screens may check these directly.
grant execute on function public.pv_can_mail(bigint), public.pv_month_api_spend(text) to authenticated;
grant execute on function public.pv_campaign_template_stats(uuid) to authenticated;
