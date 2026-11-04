alter table public.user_info
  add column if not exists institution_id uuid references public.institutions(id) on delete set null,
  add column if not exists expo_push_token text,
  add column if not exists notification_prefs jsonb not null default '{"announcements": true, "weather": true}'::jsonb;

alter table public.locations
  add column if not exists full_address text;
update public.locations
set full_address = address
where full_address is null;

update public.user_info as profile
set institution_id = selected.institution_id
from public.user_institutions as selected
where selected.user_id = profile.id
  and selected.is_default = true
  and profile.institution_id is null;

create or replace function public.save_home_location(
  p_user_id uuid,
  p_address text,
  p_latitude double precision,
  p_longitude double precision,
  p_city text,
  p_province text,
  p_barangay text
)
returns public.locations
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_location public.locations;
begin
  update public.locations
  set is_default = false
  where user_id = p_user_id and is_default = true;

  insert into public.locations (
    user_id, label, address, full_address, latitude, longitude, city, province, barangay, is_default
  )
  values (
    p_user_id, 'Home', p_address, p_address, p_latitude, p_longitude, p_city, p_province, p_barangay, true
  )
  returning * into saved_location;

  update public.user_info
  set home_location_id = saved_location.id
  where id = p_user_id;

  if not found then
    raise exception 'Profile not found for user.';
  end if;

  return saved_location;
end
$$;

create index if not exists user_info_institution_id_idx
  on public.user_info(institution_id);

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('lgu_mayor', 'institution', 'barangay')),
  name text not null,
  facebook_page_id text,
  facebook_page_url text,
  website_url text,
  rss_url text,
  city text,
  institution_id uuid references public.institutions(id) on delete set null,
  is_trusted boolean not null default false,
  is_active boolean not null default true,
  last_checked_at timestamptz,
  status text not null default 'active' check (status in ('active', 'degraded')),
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists sources_active_trusted_idx
  on public.sources(is_active, is_trusted, type);
create index if not exists sources_city_idx on public.sources(city);
create index if not exists sources_institution_id_idx on public.sources(institution_id);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.sources(id) on delete set null,
  source_name text not null,
  source_url text,
  source_type text check (source_type in ('lgu_mayor', 'institution', 'barangay')),
  external_post_id text,
  content_hash text not null,
  original_text text not null,
  posted_at timestamptz not null,
  category text check (category in ('class_suspension', 'holiday_no_class', 'weather_update', 'emergency', 'evacuation', 'other')),
  ai_summary text,
  affects_location text,
  effective_date timestamptz,
  scope text check (scope in ('citywide', 'institution', 'specific_levels', 'unknown')),
  confidence double precision check (confidence between 0 and 1),
  status text not null default 'pending_review' check (status in ('pending_review', 'published', 'conflicting', 'rejected')),
  conflict_group_id uuid,
  created_at timestamptz not null default now(),
  unique (source_id, external_post_id),
  unique (source_id, content_hash)
);

create index if not exists announcements_posted_at_idx on public.announcements(posted_at desc);
create index if not exists announcements_source_id_idx on public.announcements(source_id);
create index if not exists announcements_status_posted_idx on public.announcements(status, posted_at desc);

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_info(id) on delete cascade,
  expo_push_token text not null unique,
  device_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_active_idx on public.push_tokens(user_id, is_active);

create table if not exists public.hazards (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references public.locations(id) on delete cascade,
  user_id uuid not null references public.user_info(id) on delete cascade,
  hazard_type text not null,
  risk_level text not null check (risk_level in ('Advisory', 'Warning', 'Severe')),
  safety_tips text[] not null default '{}',
  explanation text,
  measurements jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists hazards_user_created_idx on public.hazards(user_id, created_at desc);
create index if not exists hazards_location_created_idx on public.hazards(location_id, created_at desc);

create table if not exists public.weather_records (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  user_id uuid not null references public.user_info(id) on delete cascade,
  payload jsonb not null,
  risk_level text not null check (risk_level in ('Normal', 'Advisory', 'Warning', 'Severe')),
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (location_id, observed_at)
);
create index if not exists weather_records_location_observed_idx
  on public.weather_records(location_id, observed_at desc);
create index if not exists weather_records_user_observed_idx
  on public.weather_records(user_id, observed_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_info(id) on delete cascade,
  announcement_id uuid references public.announcements(id) on delete cascade,
  hazard_id uuid references public.hazards(id) on delete cascade,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'Sent' check (status in ('Sent', 'Delivered', 'Read', 'Failed')),
  expo_ticket_ids text[],
  sent_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (announcement_id is not null or hazard_id is not null)
);
alter table public.notifications
  add column if not exists expo_ticket_ids text[];
create unique index if not exists notifications_one_announcement_per_user
  on public.notifications(user_id, announcement_id) where announcement_id is not null;
create unique index if not exists notifications_one_hazard_per_user
  on public.notifications(user_id, hazard_id) where hazard_id is not null;
create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

create table if not exists public.alert_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_info(id) on delete cascade,
  notification_id uuid references public.notifications(id) on delete cascade,
  announcement_id uuid references public.announcements(id) on delete cascade,
  hazard_id uuid references public.hazards(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists alert_history_user_created_idx
  on public.alert_history(user_id, created_at desc);

alter table public.sources enable row level security;
alter table public.announcements enable row level security;
alter table public.push_tokens enable row level security;
alter table public.hazards enable row level security;
alter table public.weather_records enable row level security;
alter table public.notifications enable row level security;
alter table public.alert_history enable row level security;

revoke all on public.sources, public.announcements, public.push_tokens,
  public.hazards, public.weather_records, public.notifications, public.alert_history
  from anon, authenticated;
grant all on public.sources, public.announcements, public.push_tokens,
  public.hazards, public.weather_records, public.notifications, public.alert_history
  to service_role;
grant select, update on public.notifications to authenticated;
grant select on public.alert_history, public.hazards, public.weather_records,
  public.push_tokens to authenticated;

create policy "Users read own notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy "Users update own notification read state"
  on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users read own alert history"
  on public.alert_history for select to authenticated
  using (user_id = auth.uid());
create policy "Users read own hazards"
  on public.hazards for select to authenticated
  using (user_id = auth.uid());
create policy "Users read own weather records"
  on public.weather_records for select to authenticated
  using (user_id = auth.uid());
create policy "Users read own push tokens"
  on public.push_tokens for select to authenticated
  using (user_id = auth.uid());
