create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_info(id) on delete cascade,
  label text not null default 'Home',
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  city text,
  province text,
  barangay text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.locations
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists user_id uuid,
  add column if not exists label text not null default 'Home',
  add column if not exists address text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists barangay text,
  add column if not exists is_default boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists locations_id_idx
  on public.locations(id);

with ranked_defaults as (
  select
    id,
    row_number() over (
      partition by user_id
      order by created_at desc, id desc
    ) as position
  from public.locations
  where is_default = true and user_id is not null
)
update public.locations
set is_default = false
where id in (
  select id from ranked_defaults where position > 1
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'locations_user_id_fkey'
      and conrelid = 'public.locations'::regclass
  ) then
    alter table public.locations
      add constraint locations_user_id_fkey
      foreign key (user_id)
      references public.user_info(id)
      on delete cascade;
  end if;
end
$$;

alter table public.user_info
  add column if not exists home_location_id uuid,
  add column if not exists location_prompt_dismissed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_info_home_location_id_fkey'
      and conrelid = 'public.user_info'::regclass
  ) then
    alter table public.user_info
      add constraint user_info_home_location_id_fkey
      foreign key (home_location_id)
      references public.locations(id)
      on delete set null;
  end if;
end
$$;

create unique index if not exists locations_one_default_per_user
  on public.locations(user_id)
  where is_default = true;

create table if not exists public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text,
  city text,
  province text,
  latitude double precision,
  longitude double precision,
  website_url text,
  facebook_page_url text,
  facebook_page_id text,
  is_verified boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_institutions (
  user_id uuid not null references public.user_info(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, institution_id)
);

create unique index if not exists user_institutions_one_default_per_user
  on public.user_institutions(user_id)
  where is_default = true;

create index if not exists user_institutions_institution_id_idx
  on public.user_institutions(institution_id);

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
    user_id, label, address, latitude, longitude, city, province, barangay, is_default
  )
  values (
    p_user_id, 'Home', p_address, p_latitude, p_longitude, p_city, p_province, p_barangay, true
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

create or replace function public.set_user_institution(
  p_user_id uuid,
  p_institution_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_institutions
  set is_default = false
  where user_id = p_user_id and is_default = true;

  if p_institution_id is not null then
    insert into public.user_institutions (user_id, institution_id, is_default)
    values (p_user_id, p_institution_id, true)
    on conflict (user_id, institution_id)
    do update set is_default = true;
  end if;
end
$$;

revoke all on function public.save_home_location(uuid, text, double precision, double precision, text, text, text)
  from public, anon, authenticated;
grant execute on function public.save_home_location(uuid, text, double precision, double precision, text, text, text)
  to service_role;
revoke all on function public.set_user_institution(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.set_user_institution(uuid, uuid)
  to service_role;

insert into public.institutions
  (name, short_name, city, province, latitude, longitude, website_url, facebook_page_url, facebook_page_id, is_verified)
values
  ('University of San Carlos', 'USC', 'Cebu City', 'Cebu', 10.2958, 123.8997, null, null, null, true),
  ('University of the Philippines Cebu', 'UP Cebu', 'Cebu City', 'Cebu', 10.3237, 123.8989, null, null, null, true),
  ('Cebu Institute of Technology University', 'CIT-U', 'Cebu City', 'Cebu', 10.2932, 123.8817, null, null, null, true),
  ('University of San Jose-Recoletos', 'USJ-R', 'Cebu City', 'Cebu', 10.2927, 123.9007, null, null, null, true),
  ('Cebu Normal University', 'CNU', 'Cebu City', 'Cebu', 10.2977, 123.9006, null, null, null, true)
on conflict (name) do nothing;

alter table public.locations enable row level security;
alter table public.institutions enable row level security;
alter table public.user_institutions enable row level security;

revoke all on public.locations from anon, authenticated;
revoke all on public.institutions from anon, authenticated;
revoke all on public.user_institutions from anon, authenticated;
grant all on public.locations to service_role;
grant all on public.institutions to service_role;
grant all on public.user_institutions to service_role;
