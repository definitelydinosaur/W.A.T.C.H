-- Keep the announcement-to-institution relationship explicit for PostgREST.
-- Re-run this migration in Supabase if the FK is missing after a branch merge.
alter table public.announcements
  add column if not exists institution_id uuid,
  add column if not exists ai_scope text,
  add column if not exists is_class_suspension boolean not null default false,
  add column if not exists suspension_reason text,
  add column if not exists affected_levels text,
  add column if not exists ai_key_points jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'announcements_institution_id_fkey'
      and conrelid = 'public.announcements'::regclass
  ) then
    alter table public.announcements
      add constraint announcements_institution_id_fkey
      foreign key (institution_id)
      references public.institutions(id)
      on delete set null;
  end if;
end
$$;

create index if not exists announcements_institution_id_idx
  on public.announcements(institution_id);

with matches as (
  select
    a.id,
    count(distinct s.institution_id) as institution_count,
    min(s.institution_id::text)::uuid as matched_institution_id
  from public.announcements a
  join public.school_sources s
    on s.institution_id is not null
   and (
     lower(trim(a.source_name)) = lower(trim(s.school_name))
     or lower(trim(a.source_name)) = lower(trim(s.facebook_url))
     or lower(trim(coalesce(a.source_url, ''))) = lower(trim(s.facebook_url))
   )
  where a.institution_id is null
  group by a.id
)
update public.announcements a
set institution_id = matches.matched_institution_id
from matches
where a.id = matches.id
  and matches.institution_count = 1;

do $$
declare
  matched_count bigint;
  unmatched_count bigint;
begin
  select
    count(*) filter (where institution_id is not null),
    count(*) filter (where institution_id is null)
  into matched_count, unmatched_count
  from public.announcements;
  raise notice 'Announcement institution backfill: % matched, % unmatched (includes local/PAGASA rows and ambiguous names).',
    matched_count, unmatched_count;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'announcements_ai_scope_check'
      and conrelid = 'public.announcements'::regclass
  ) then
    alter table public.announcements
      add constraint announcements_ai_scope_check
      check (ai_scope is null or ai_scope in ('institution', 'local', 'weather'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'announcements_suspension_reason_check'
      and conrelid = 'public.announcements'::regclass
  ) then
    alter table public.announcements
      add constraint announcements_suspension_reason_check
      check (
        suspension_reason is null
        or suspension_reason in ('weather', 'unhealthy_air', 'extreme_heat', 'flood', 'other')
      );
  end if;
end
$$;

alter table public.notifications
  add column if not exists data jsonb not null default '{}'::jsonb;

alter table public.notifications
  drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in (
    'announcement_local',
    'announcement_institution',
    'weather_hazard',
    'institution',
    'local',
    'weather',
    'safety_tip'
  ));

-- A hazard still has one initial alert per user, but can have separate,
-- deduplicated safety-tip rows.
drop index if exists public.notifications_one_hazard_per_user;
create unique index if not exists notifications_one_hazard_per_user
  on public.notifications(user_id, hazard_id)
  where hazard_id is not null and kind <> 'safety_tip';
create unique index if not exists notifications_safety_tip_key_uidx
  on public.notifications(user_id, hazard_id, (data ->> 'tip_key'))
  where hazard_id is not null
    and kind = 'safety_tip'
    and data ? 'tip_key';

comment on column public.announcements.institution_id is
  'Required PostgREST relationship for institution embeds; leave NULL for local/PAGASA announcements.';

notify pgrst, 'reload schema';
