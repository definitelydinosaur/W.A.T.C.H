create extension if not exists pg_trgm;
set search_path = public, extensions;

alter table public.institutions enable row level security;
revoke all on public.institutions from anon, authenticated;
grant all on public.institutions to service_role;

create table if not exists public.user_institutions (
  user_id uuid not null references public.user_info(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, institution_id)
);

alter table public.user_institutions
  add column if not exists is_default boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists user_institutions_one_default_per_user
  on public.user_institutions(user_id)
  where is_default = true;
create index if not exists user_institutions_institution_id_idx
  on public.user_institutions(institution_id);

alter table public.user_institutions enable row level security;
revoke all on public.user_institutions from anon, authenticated;
grant all on public.user_institutions to service_role;
grant select on public.user_institutions to authenticated;

drop policy if exists "Users read own institution links"
  on public.user_institutions;
create policy "Users read own institution links"
  on public.user_institutions for select to authenticated
  using (user_id = auth.uid());

create or replace function public.search_institutions(
  p_query text,
  p_result_limit integer default 20
)
returns setof public.institutions
language sql
stable
set search_path = public, extensions
as $$
  select institution.*
  from public.institutions as institution
  where institution.name ilike '%' || p_query || '%'
     or institution.short_name ilike '%' || p_query || '%'
     or institution.city ilike '%' || p_query || '%'
     or institution.province ilike '%' || p_query || '%'
     or institution.name % p_query
     or institution.short_name % p_query
  order by
    greatest(
      similarity(institution.name, p_query),
      similarity(coalesce(institution.short_name, ''), p_query),
      similarity(coalesce(institution.city, ''), p_query),
      similarity(coalesce(institution.province, ''), p_query)
    ) desc,
    institution.is_verified desc,
    institution.name
  limit greatest(1, least(coalesce(p_result_limit, 20), 20))
$$;

revoke all on function public.search_institutions(text, integer)
  from public, anon, authenticated;
grant execute on function public.search_institutions(text, integer)
  to service_role;

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
  if coalesce(auth.role(), '') <> 'service_role'
     and auth.uid() is distinct from p_user_id then
    raise exception 'Not authorized to update this institution selection.'
      using errcode = '42501';
  end if;

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

revoke all on function public.set_user_institution(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.set_user_institution(uuid, uuid)
  to service_role;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_info(id) on delete cascade,
  announcement_id bigint,
  hazard_id uuid,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'Sent'
    check (status in ('Sent', 'Delivered', 'Read', 'Failed')),
  expo_ticket_ids text[],
  sent_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (announcement_id is not null or hazard_id is not null)
);

alter table public.notifications
  add column if not exists announcement_id bigint,
  add column if not exists hazard_id uuid,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists status text not null default 'Sent',
  add column if not exists expo_ticket_ids text[],
  add column if not exists sent_at timestamptz not null default now(),
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

do $$
declare
  announcement_id_type text;
  has_existing_ids boolean;
begin
  select format_type(attribute.atttypid, attribute.atttypmod)
  into announcement_id_type
  from pg_attribute as attribute
  where attribute.attrelid = 'public.notifications'::regclass
    and attribute.attname = 'announcement_id'
    and not attribute.attisdropped;

  if announcement_id_type <> 'bigint' then
    execute
      'select exists (select 1 from public.notifications where announcement_id is not null)'
    into has_existing_ids;

    if has_existing_ids then
      raise exception
        'notifications.announcement_id is %, and contains data; migrate those references before converting it to bigint.',
        announcement_id_type;
    end if;

    alter table public.notifications
      alter column announcement_id type bigint
      using null::bigint;
  end if;
end
$$;

do $$
declare
  hazard_id_type text;
begin
  if to_regclass('public.hazards') is null then
    return;
  end if;

  select format_type(attribute.atttypid, attribute.atttypmod)
  into hazard_id_type
  from pg_attribute as attribute
  where attribute.attrelid = 'public.hazards'::regclass
    and attribute.attname = 'id'
    and not attribute.attisdropped;

  if hazard_id_type is null then
    alter table public.hazards
      add column id uuid default gen_random_uuid();
  elsif hazard_id_type <> 'uuid' then
    raise exception
      'public.hazards.id must be uuid for notifications, but is currently %.',
      hazard_id_type;
  end if;

  alter table public.hazards
    alter column id set default gen_random_uuid();

  update public.hazards
  set id = gen_random_uuid()
  where id is null;

  alter table public.hazards
    alter column id set not null;
end
$$;

create unique index if not exists hazards_id_unique_idx
  on public.hazards(id);

do $$
begin
  if to_regclass('public.announcements') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'notifications_announcement_id_fkey'
         and conrelid = 'public.notifications'::regclass
     ) then
    alter table public.notifications
      add constraint notifications_announcement_id_fkey
      foreign key (announcement_id)
      references public.announcements(id)
      on delete cascade;
  end if;

  if to_regclass('public.hazards') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'notifications_hazard_id_fkey'
         and conrelid = 'public.notifications'::regclass
     ) then
    alter table public.notifications
      add constraint notifications_hazard_id_fkey
      foreign key (hazard_id)
      references public.hazards(id)
      on delete cascade;
  end if;
end
$$;

create unique index if not exists notifications_one_announcement_per_user
  on public.notifications(user_id, announcement_id)
  where announcement_id is not null;
create unique index if not exists notifications_one_hazard_per_user
  on public.notifications(user_id, hazard_id)
  where hazard_id is not null;
create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant all on public.notifications to service_role;
grant select, update on public.notifications to authenticated;

drop policy if exists "Users read own notifications"
  on public.notifications;
create policy "Users read own notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users update own notification read state"
  on public.notifications;
create policy "Users update own notification read state"
  on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

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
  if coalesce(auth.role(), '') <> 'service_role'
     and auth.uid() is distinct from p_user_id then
    raise exception 'Not authorized to update this home location.'
      using errcode = '42501';
  end if;

  update public.locations
  set is_default = false
  where user_id = p_user_id and is_default = true;

  insert into public.locations (
    user_id,
    label,
    address,
    full_address,
    latitude,
    longitude,
    city,
    province,
    barangay,
    is_default
  )
  values (
    p_user_id,
    'Home',
    p_address,
    p_address,
    p_latitude,
    p_longitude,
    p_city,
    p_province,
    p_barangay,
    true
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

revoke all on function public.save_home_location(
  uuid,
  text,
  double precision,
  double precision,
  text,
  text,
  text
) from public, anon;
grant execute on function public.save_home_location(
  uuid,
  text,
  double precision,
  double precision,
  text,
  text,
  text
) to service_role, authenticated;

notify pgrst, 'reload schema';
