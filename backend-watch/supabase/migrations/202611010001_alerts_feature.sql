alter table public.announcements
  add column if not exists source_type text,
  add column if not exists source_id bigint,
  add column if not exists facebook_post_id bigint,
  add column if not exists source_url text,
  add column if not exists category text,
  add column if not exists affects_location text,
  add column if not exists effective_date date,
  add column if not exists scope text,
  add column if not exists confidence numeric,
  add column if not exists status text not null default 'published',
  add column if not exists city text,
  add column if not exists institution_id uuid,
  add column if not exists conflict_flag boolean not null default false;

alter table public.announcements
  drop constraint if exists announcements_source_type_check,
  drop constraint if exists announcements_scope_check,
  drop constraint if exists announcements_status_check;

update public.announcements
set source_type = 'lgu'
where source_type = 'lgu_mayor';

update public.announcements
set status = 'pending_review'
where status = 'conflicting';

alter table public.announcements
  add constraint announcements_source_type_check
    check (source_type in ('lgu', 'institution', 'manual')),
  add constraint announcements_scope_check
    check (scope is null or scope in ('citywide', 'institution', 'specific_levels', 'unknown')),
  add constraint announcements_status_check
    check (status in ('published', 'pending_review', 'rejected'));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'announcements_source_id_fkey'
      and conrelid = 'public.announcements'::regclass
  ) then
    alter table public.announcements
      add constraint announcements_source_id_fkey
      foreign key (source_id) references public.school_sources(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'announcements_facebook_post_id_fkey'
      and conrelid = 'public.announcements'::regclass
  ) then
    alter table public.announcements
      add constraint announcements_facebook_post_id_fkey
      foreign key (facebook_post_id) references public.facebook_posts(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'announcements_institution_id_fkey'
      and conrelid = 'public.announcements'::regclass
  ) then
    alter table public.announcements
      add constraint announcements_institution_id_fkey
      foreign key (institution_id) references public.institutions(id) on delete set null;
  end if;
end
$$;

create unique index if not exists announcements_facebook_post_id_uidx
  on public.announcements(facebook_post_id)
  where facebook_post_id is not null;
create index if not exists announcements_city_published_idx
  on public.announcements(city, published_at desc)
  where status = 'published';
create index if not exists announcements_institution_published_idx
  on public.announcements(institution_id, published_at desc)
  where status = 'published';

alter table public.school_sources
  add column if not exists source_type text not null default 'institution',
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists institution_id uuid,
  add column if not exists last_checked_at timestamptz,
  add column if not exists is_degraded boolean not null default false,
  add column if not exists facebook_page_id text,
  add column if not exists website_url text,
  add column if not exists rss_url text;

alter table public.school_sources
  drop constraint if exists school_sources_source_type_check;
update public.school_sources
set source_type = 'lgu'
where source_type = 'lgu_mayor';
alter table public.school_sources
  add constraint school_sources_source_type_check
    check (source_type in ('lgu', 'institution'));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'school_sources_institution_id_fkey'
      and conrelid = 'public.school_sources'::regclass
  ) then
    alter table public.school_sources
      add constraint school_sources_institution_id_fkey
      foreign key (institution_id) references public.institutions(id) on delete set null;
  end if;
end
$$;

insert into public.school_sources (
  school_name, facebook_url, is_active, source_type, city, province
)
values (
  'PLACEHOLDER - Cebu City Mayor/LGU official Facebook page',
  'https://www.facebook.com/REPLACE_WITH_CEBU_CITY_OFFICIAL_PAGE',
  false,
  'lgu',
  'Cebu City',
  'Cebu'
)
on conflict (facebook_url) do nothing;

alter table public.facebook_posts
  add column if not exists source_id bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'facebook_posts_source_id_fkey'
      and conrelid = 'public.facebook_posts'::regclass
  ) then
    alter table public.facebook_posts
      add constraint facebook_posts_source_id_fkey
      foreign key (source_id) references public.school_sources(id) on delete set null;
  end if;
end
$$;

create unique index if not exists facebook_posts_source_external_id_uidx
  on public.facebook_posts(source_id, external_post_id)
  where source_id is not null and external_post_id is not null;

alter table public.notifications
  add column if not exists kind text not null default 'announcement_local',
  add column if not exists source_name text,
  add column if not exists source_url text,
  add column if not exists deleted_at timestamptz;

alter table public.notifications
  drop constraint if exists notifications_kind_check;
update public.notifications as notification
set kind = case
  when notification.hazard_id is not null then 'weather_hazard'
  when announcement.source_type = 'institution' then 'announcement_institution'
  else 'announcement_local'
end
from public.announcements as announcement
where notification.announcement_id = announcement.id
  and notification.kind = 'announcement';
update public.notifications
set kind = 'weather_hazard'
where hazard_id is not null and kind = 'announcement';
update public.notifications
set kind = 'announcement_local'
where kind = 'announcement';
alter table public.notifications
  alter column kind set default 'announcement_local';
alter table public.notifications
  add constraint notifications_kind_check
    check (kind in ('announcement_local', 'announcement_institution', 'weather_hazard'));

create unique index if not exists notifications_one_announcement_per_user
  on public.notifications(user_id, announcement_id)
  where announcement_id is not null;
create unique index if not exists notifications_one_hazard_per_user
  on public.notifications(user_id, hazard_id)
  where hazard_id is not null;
create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

alter table public.hazards
  add column if not exists location_id bigint,
  add column if not exists hazard_type text,
  add column if not exists risk_level text,
  add column if not exists safety_tips jsonb not null
    default '{"do":[],"prepare":[],"avoid":[]}'::jsonb,
  add column if not exists expires_at timestamptz,
  add column if not exists dedupe_key text;

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
  end if;
end
$$;

alter table public.hazards
  alter column safety_tips set default
    '{"do":[],"prepare":[],"avoid":[]}'::jsonb;

update public.hazards
set hazard_type = coalesce(hazard_type, category),
    risk_level = coalesce(risk_level, severity);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'hazards_location_id_fkey'
      and conrelid = 'public.hazards'::regclass
  ) then
    alter table public.hazards
      add constraint hazards_location_id_fkey
      foreign key (location_id) references public.locations(loc_id) on delete set null;
  end if;
end
$$;

create unique index if not exists hazards_dedupe_key_uidx
  on public.hazards(dedupe_key)
  where dedupe_key is not null;

alter table public.weather_records
  add column if not exists recorded_at timestamptz not null default now(),
  add column if not exists humidity double precision,
  add column if not exists heat_index double precision,
  add column if not exists uv_index double precision,
  add column if not exists aqi double precision,
  add column if not exists is_stale boolean not null default false;

create index if not exists weather_records_location_recorded_idx
  on public.weather_records(location_id, recorded_at desc);

alter table public.announcements enable row level security;
alter table public.school_sources enable row level security;
alter table public.notifications enable row level security;
alter table public.locations enable row level security;
alter table public.user_info enable row level security;
alter table public.hazards enable row level security;
alter table public.weather_records enable row level security;

grant select on public.announcements, public.school_sources, public.hazards
  to authenticated;
grant select, update on public.notifications to authenticated;
grant select, insert, update on public.locations to authenticated;
grant select, update on public.user_info to authenticated;
grant select on public.weather_records to authenticated;
grant all on public.announcements, public.school_sources, public.notifications,
  public.hazards, public.weather_records to service_role;

drop policy if exists "Authenticated users read announcements"
  on public.announcements;
create policy "Authenticated users read announcements"
  on public.announcements for select to authenticated using (true);

drop policy if exists "Authenticated users read school sources"
  on public.school_sources;
create policy "Authenticated users read school sources"
  on public.school_sources for select to authenticated using (true);

drop policy if exists "Authenticated users read hazards"
  on public.hazards;
create policy "Authenticated users read hazards"
  on public.hazards for select to authenticated using (true);

drop policy if exists "Users read own notifications"
  on public.notifications;
create policy "Users read own notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users update own notifications"
  on public.notifications;
create policy "Users update own notifications"
  on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users read own locations"
  on public.locations;
create policy "Users read own locations"
  on public.locations for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users create own locations"
  on public.locations;
create policy "Users create own locations"
  on public.locations for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users update own locations"
  on public.locations;
create policy "Users update own locations"
  on public.locations for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users read own profile"
  on public.user_info;
create policy "Users read own profile"
  on public.user_info for select to authenticated
  using (id = auth.uid());

drop policy if exists "Users update own profile"
  on public.user_info;
create policy "Users update own profile"
  on public.user_info for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "Users read own weather records"
  on public.weather_records;
create policy "Users read own weather records"
  on public.weather_records for select to authenticated
  using (
    exists (
      select 1 from public.locations
      where locations.loc_id = weather_records.location_id
        and locations.user_id = auth.uid()
    )
  );

drop function if exists public.save_home_location(
  uuid, text, double precision, double precision, text, text, text
);

create function public.save_home_location(
  p_user_id uuid,
  p_address text,
  p_latitude double precision,
  p_longitude double precision,
  p_city text,
  p_province text,
  p_barangay text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_location_id bigint;
begin
  if auth.uid() is distinct from p_user_id
     and auth.role() is distinct from 'service_role' then
    raise exception 'Cannot save a location for another user.'
      using errcode = '42501';
  end if;

  perform 1 from public.user_info where id = p_user_id for update;
  if not found then
    raise exception 'Profile not found for user.';
  end if;

  update public.locations
  set is_default = false
  where user_id = p_user_id and is_default = true;

  insert into public.locations (
    user_id, label, full_address, latitude, longitude, city, province,
    barangay, is_default
  )
  values (
    p_user_id, 'Home', p_address, p_latitude, p_longitude, p_city,
    p_province, p_barangay, true
  )
  returning loc_id into saved_location_id;

  update public.user_info
  set home_location_id = saved_location_id
  where id = p_user_id;

  return saved_location_id;
end
$$;

revoke all on function public.save_home_location(
  uuid, text, double precision, double precision, text, text, text
) from public, anon, authenticated;
grant execute on function public.save_home_location(
  uuid, text, double precision, double precision, text, text, text
) to authenticated, service_role;

notify pgrst, 'reload schema';
