-- Migration: Automated Weather Hazard Logging & Idempotency
-- Ensures `public.hazards` contains all required hazard logging fields while
-- preserving compatibility with existing user/location alert workflows.

-- 1. Create table if it doesn't exist
create table if not exists public.hazards (
  id uuid primary key default gen_random_uuid(),
  event_type text,
  severity text,
  description text,
  location_lat double precision,
  location_lon double precision,
  area_key text,
  raw_metrics jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  -- Existing compatibility columns
  location_id bigint,
  user_id uuid,
  hazard_type text,
  risk_level text,
  safety_tips text[] not null default '{}',
  explanation text,
  measurements jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 2. Ensure all columns exist before modifying or constraining them
alter table public.hazards
  add column if not exists event_type text,
  add column if not exists severity text,
  add column if not exists description text,
  add column if not exists location_lat double precision,
  add column if not exists location_lon double precision,
  add column if not exists area_key text,
  add column if not exists raw_metrics jsonb not null default '{}'::jsonb,
  add column if not exists detected_at timestamptz not null default now(),
  add column if not exists resolved_at timestamptz,
  add column if not exists location_id bigint,
  add column if not exists user_id uuid,
  add column if not exists hazard_type text,
  add column if not exists risk_level text,
  add column if not exists safety_tips text[] not null default '{}',
  add column if not exists explanation text,
  add column if not exists measurements jsonb not null default '{}'::jsonb,
  add column if not exists observed_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now();

-- 3. Safely drop NOT NULL on user_id if present
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'hazards'
      and column_name = 'user_id'
      and is_nullable = 'NO'
  ) then
    alter table public.hazards alter column user_id drop not null;
  end if;
end $$;

-- 4. Foreign key to user_info if table exists and constraint is not yet present
do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'user_info'
  ) and not exists (
    select 1 from pg_constraint where conname = 'hazards_user_id_fkey' and conrelid = 'public.hazards'::regclass
  ) then
    alter table public.hazards
      add constraint hazards_user_id_fkey
      foreign key (user_id) references public.user_info(id) on delete cascade;
  end if;
end $$;

-- 5. Backfill any existing rows before adding constraints/indexes
update public.hazards
set
  event_type = coalesce(event_type, upper(regexp_replace(coalesce(hazard_type, 'WEATHER_HAZARD'), '[^a-zA-Z0-9]+', '_', 'g'))),
  severity = coalesce(severity, risk_level, 'Warning'),
  description = coalesce(description, explanation, hazard_type, 'Weather threshold breached'),
  location_lat = coalesce(location_lat, 10.3157),
  location_lon = coalesce(location_lon, 123.8854),
  area_key = coalesce(area_key, round(coalesce(location_lat, 10.3157)::numeric, 2)::text || ',' || round(coalesce(location_lon, 123.8854)::numeric, 2)::text),
  raw_metrics = case when raw_metrics = '{}'::jsonb and measurements is not null then measurements else raw_metrics end,
  detected_at = coalesce(detected_at, observed_at, created_at, now())
where event_type is null
   or severity is null
   or description is null
   or location_lat is null
   or location_lon is null
   or area_key is null;

-- 6. Check constraint on severity
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hazards_severity_check'
      and conrelid = 'public.hazards'::regclass
  ) then
    alter table public.hazards
      add constraint hazards_severity_check
      check (severity in ('Advisory', 'Warning', 'Severe', 'Extreme'));
  end if;
end
$$;

-- 7. Prevent duplicate active hazards (resolved_at IS NULL) for the same area and event_type
create unique index if not exists hazards_active_area_event_uidx
  on public.hazards (area_key, event_type)
  where resolved_at is null;

create index if not exists hazards_active_lookup_idx
  on public.hazards (area_key, event_type, detected_at desc)
  where resolved_at is null;

create index if not exists hazards_coords_detected_idx
  on public.hazards (location_lat, location_lon, detected_at desc);

-- 8. Enable RLS and setup permissions
alter table public.hazards enable row level security;
grant all on public.hazards to service_role;
grant select on public.hazards to authenticated;

do $$
begin
  if exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'hazards' and policyname = 'Users read own hazards'
  ) then
    drop policy "Users read own hazards" on public.hazards;
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'hazards' and policyname = 'Users read hazards'
  ) then
    create policy "Users read hazards"
      on public.hazards for select to authenticated
      using (user_id is null or user_id = auth.uid());
  end if;
end $$;

-- 9. Idempotent RPC to insert or update an active hazard within the dedupe window
create or replace function public.upsert_weather_hazard(
  p_event_type text,
  p_severity text,
  p_description text,
  p_location_lat double precision,
  p_location_lon double precision,
  p_raw_metrics jsonb,
  p_detected_at timestamptz default now(),
  p_dedupe_window_minutes integer default 60,
  p_location_id bigint default null,
  p_user_id uuid default null,
  p_safety_tips text[] default '{}'
)
returns table (
  hazard_row public.hazards,
  is_new_or_escalated boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_key text := round(p_location_lat::numeric, 2)::text || ',' || round(p_location_lon::numeric, 2)::text;
  v_existing public.hazards;
  v_saved public.hazards;
  v_risk_level text := case when p_severity = 'Extreme' then 'Severe' else p_severity end;
  v_old_rank integer := 0;
  v_new_rank integer := case p_severity
    when 'Advisory' then 1
    when 'Warning' then 2
    when 'Severe' then 3
    when 'Extreme' then 4
    else 1
  end;
  v_escalated boolean := false;
begin
  select *
  into v_existing
  from public.hazards h
  where h.area_key = v_area_key
    and h.event_type = p_event_type
    and (
      h.resolved_at is null
      or h.detected_at >= (p_detected_at - make_interval(mins => p_dedupe_window_minutes))
    )
  order by h.resolved_at nulls first, h.detected_at desc
  limit 1
  for update;

  if found then
    v_old_rank := case v_existing.severity
      when 'Advisory' then 1
      when 'Warning' then 2
      when 'Severe' then 3
      when 'Extreme' then 4
      else 1
    end;
    v_escalated := v_new_rank > v_old_rank;

    update public.hazards
    set
      severity = case when v_new_rank > v_old_rank then p_severity else v_existing.severity end,
      risk_level = case when v_new_rank > v_old_rank then v_risk_level else v_existing.risk_level end,
      description = p_description,
      explanation = p_description,
      raw_metrics = p_raw_metrics,
      measurements = p_raw_metrics,
      observed_at = p_detected_at,
      resolved_at = null,
      safety_tips = case when array_length(p_safety_tips, 1) > 0 then p_safety_tips else v_existing.safety_tips end
    where id = v_existing.id
    returning * into v_saved;

    return query select v_saved, v_escalated;
  else
    insert into public.hazards (
      event_type,
      hazard_type,
      severity,
      risk_level,
      description,
      explanation,
      location_lat,
      location_lon,
      area_key,
      raw_metrics,
      measurements,
      detected_at,
      observed_at,
      resolved_at,
      location_id,
      user_id,
      safety_tips
    )
    values (
      p_event_type,
      p_event_type,
      p_severity,
      v_risk_level,
      p_description,
      p_description,
      p_location_lat,
      p_location_lon,
      v_area_key,
      p_raw_metrics,
      p_raw_metrics,
      p_detected_at,
      p_detected_at,
      null,
      p_location_id,
      p_user_id,
      coalesce(p_safety_tips, '{}')
    )
    on conflict (area_key, event_type) where resolved_at is null
    do update set
      severity = excluded.severity,
      risk_level = excluded.risk_level,
      description = excluded.description,
      explanation = excluded.explanation,
      raw_metrics = excluded.raw_metrics,
      measurements = excluded.measurements,
      observed_at = excluded.observed_at
    returning * into v_saved;

    return query select v_saved, true;
  end if;
end;
$$;

revoke all on function public.upsert_weather_hazard(
  text, text, text, double precision, double precision, jsonb, timestamptz, integer, bigint, uuid, text[]
) from public, anon, authenticated;
grant execute on function public.upsert_weather_hazard(
  text, text, text, double precision, double precision, jsonb, timestamptz, integer, bigint, uuid, text[]
) to service_role;

notify pgrst, 'reload schema';
