create table if not exists public.weather_alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null check (alert_type in ('extreme_heat','unhealthy_air','heavy_rain','pagasa_weather')),
  city text not null,
  province text,
  area_key text not null,
  severity text not null,
  measurement jsonb not null default '{}'::jsonb,
  measured_at timestamptz not null,
  sustained_since timestamptz not null,
  title text not null,
  ai_summary text not null,
  safety jsonb not null default '{}'::jsonb,
  source text not null check (source in ('weather_auto','pagasa')),
  source_name text not null,
  source_url text,
  status text not null default 'active'::text check (status in ('active','resolved')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  notified_count integer not null default 0
);

create unique index if not exists weather_alert_events_one_active_uidx
  on public.weather_alert_events(alert_type, area_key)
  where status = 'active';

create index if not exists weather_alert_events_feed_idx
  on public.weather_alert_events(status, measured_at desc);

alter table public.weather_alert_events enable row level security;

drop policy if exists "weather_alert_events_authenticated_read" on public.weather_alert_events;
create policy "weather_alert_events_authenticated_read"
  on public.weather_alert_events
  for select
  to authenticated
  using (true);

notify pgrst, 'reload schema';
