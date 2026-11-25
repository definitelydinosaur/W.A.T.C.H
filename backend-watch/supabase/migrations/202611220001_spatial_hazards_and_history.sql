-- Migration: Spatial Map Hazards, Official Source Attribution, and Historical Range RPC
-- Extends `public.hazards` so official spatial hazards (flood polygons, road closures,
-- cautions) and multi-day historical events are persisted alongside weather alerts.
-- Additive and idempotent; existing weather and alert columns remain intact.

alter table public.hazards
  -- Shared compatibility columns across earlier migrations
  add column if not exists event_type text,
  add column if not exists hazard_type text,
  add column if not exists severity text,
  add column if not exists risk_level text,
  add column if not exists explanation text,
  add column if not exists location_lat double precision,
  add column if not exists location_lon double precision,
  add column if not exists area_key text,
  add column if not exists user_id uuid,
  add column if not exists ai_summary text,
  add column if not exists detected_at timestamptz not null default now(),
  add column if not exists observed_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists raw_metrics jsonb not null default '{}'::jsonb,
  add column if not exists measurements jsonb not null default '{}'::jsonb,
  add column if not exists safety_tips jsonb not null default '{"do":[],"prepare":[],"avoid":[]}'::jsonb,
  -- Spatial & historical map hazard columns
  add column if not exists map_category text,
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists barangay text,
  add column if not exists city text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists polygon jsonb,
  add column if not exists path jsonb,
  add column if not exists radius_m integer,
  add column if not exists source_type text,
  add column if not exists source_name text,
  add column if not exists source_url text,
  add column if not exists external_event_id text,
  add column if not exists incident_group text,
  add column if not exists started_at timestamptz not null default now(),
  add column if not exists resolved_at timestamptz;

-- Normalize legacy text[] safety_tips column (from 202611040001) to structured jsonb
do $$
declare
  tips_type text;
begin
  select data_type into tips_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'hazards'
    and column_name = 'safety_tips';
  if tips_type = 'ARRAY' then
    alter table public.hazards
      alter column safety_tips drop default;
    alter table public.hazards
      alter column safety_tips type jsonb
      using jsonb_build_object(
        'do', to_jsonb(safety_tips),
        'prepare', '[]'::jsonb,
        'avoid', '[]'::jsonb
      );
    alter table public.hazards
      alter column safety_tips set default '{"do":[],"prepare":[],"avoid":[]}'::jsonb;
  end if;
end
$$;

alter table public.hazards
  drop constraint if exists hazards_map_category_check,
  drop constraint if exists hazards_source_type_check;

alter table public.hazards
  add constraint hazards_map_category_check
    check (map_category is null or map_category in ('flood', 'closure', 'caution')),
  add constraint hazards_source_type_check
    check (
      source_type is null or
      source_type in ('pagasa', 'project_noah', 'ndrrmc_ocd', 'lgu_official', 'weather_auto')
    );

-- Backfill coordinates, start timestamps, and default source_type on legacy rows
update public.hazards
set
  latitude = coalesce(latitude, location_lat),
  longitude = coalesce(longitude, location_lon),
  started_at = coalesce(started_at, detected_at, observed_at, created_at, now()),
  source_type = coalesce(source_type, 'weather_auto')
where latitude is null
   or longitude is null
   or started_at is null
   or source_type is null;

-- Performance indexes for live map polling, historical snapshots, and disaster playback
create index if not exists hazards_resolved_started_idx
  on public.hazards (resolved_at, started_at desc);

create index if not exists hazards_active_spatial_started_idx
  on public.hazards (started_at desc)
  where resolved_at is null and map_category is not null;

create index if not exists hazards_city_category_idx
  on public.hazards (city, map_category)
  where map_category is not null;

create index if not exists hazards_incident_group_idx
  on public.hazards (incident_group)
  where incident_group is not null;

create unique index if not exists hazards_source_external_event_uidx
  on public.hazards (source_type, external_event_id)
  where external_event_id is not null;

-- Historical range query RPC for calendar day snapshots and playback
drop function if exists public.get_map_hazards_by_range(timestamptz, timestamptz, boolean, text);

create function public.get_map_hazards_by_range(
  p_start timestamptz,
  p_end timestamptz,
  p_include_active boolean default true,
  p_city text default null
)
returns setof public.hazards
language sql
stable
security invoker
set search_path = public
as $$
  select h.*
  from public.hazards as h
  where h.map_category is not null
    and h.started_at <= p_end
    and (
      (h.resolved_at is null and p_include_active)
      or (h.resolved_at is not null and h.resolved_at >= p_start)
    )
    and (p_city is null or lower(h.city) = lower(p_city))
  order by
    case h.severity
      when 'Extreme' then 4
      when 'Severe' then 3
      when 'Warning' then 2
      when 'Advisory' then 1
      else 0
    end desc,
    h.started_at desc;
$$;

revoke all on function public.get_map_hazards_by_range(timestamptz, timestamptz, boolean, text)
  from public;
grant execute on function public.get_map_hazards_by_range(timestamptz, timestamptz, boolean, text)
  to anon, authenticated, service_role;

-- Enforce read-only client access and service_role-only writes via RLS
alter table public.hazards enable row level security;

revoke insert, update, delete on public.hazards from public, anon, authenticated;
grant select on public.hazards to anon, authenticated;
grant all on public.hazards to service_role;

drop policy if exists "Authenticated users read hazards" on public.hazards;
drop policy if exists "Users read hazards" on public.hazards;
drop policy if exists "Public read spatial hazards" on public.hazards;

create policy "Public read spatial hazards"
  on public.hazards for select to anon
  using (user_id is null);

create policy "Authenticated users read hazards"
  on public.hazards for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));

notify pgrst, 'reload schema';

