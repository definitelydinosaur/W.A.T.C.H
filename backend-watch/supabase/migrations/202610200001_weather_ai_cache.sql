create table if not exists public.weather_cache (
  cache_key text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

create table if not exists public.ai_cache (
  cache_key text primary key,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.weather_cache enable row level security;
alter table public.ai_cache enable row level security;

revoke all on public.weather_cache from anon, authenticated;
revoke all on public.ai_cache from anon, authenticated;
grant all on public.weather_cache to service_role;
grant all on public.ai_cache to service_role;
