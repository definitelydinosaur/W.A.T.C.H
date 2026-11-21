alter table public.announcements
  add column if not exists system_details jsonb not null default '{}'::jsonb;

alter table public.announcements
  drop constraint if exists announcements_ai_scope_check;
alter table public.announcements
  add constraint announcements_ai_scope_check
  check (ai_scope is null or ai_scope in ('institution', 'local', 'weather', 'system'));

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
    'safety_tip',
    'system'
  ));
alter table public.notifications
  add column if not exists delivery_error text;

create table if not exists public.system_announcement_drafts (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.user_info(id),
  raw_text text not null,
  ai_json jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'publishing', 'published', 'discarded')),
  version_history jsonb not null default '[]'::jsonb,
  published_announcement_id bigint references public.announcements(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists system_announcement_drafts_admin_updated_idx
  on public.system_announcement_drafts(admin_id, updated_at desc);

create unique index if not exists notifications_system_user_announcement_uidx
  on public.notifications(user_id, announcement_id)
  where kind = 'system' and announcement_id is not null;

create unique index if not exists announcements_system_draft_uidx
  on public.announcements((system_details ->> 'draft_id'))
  where source = 'admin_system' and system_details ? 'draft_id';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_info
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.system_announcement_drafts enable row level security;
grant select, insert, update, delete
  on public.system_announcement_drafts to authenticated;
drop policy if exists "Admins manage system announcement drafts"
  on public.system_announcement_drafts;
create policy "Admins manage system announcement drafts"
  on public.system_announcement_drafts
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

comment on column public.announcements.system_details is
  'Structured AI-reviewed schedule, impact, action, and missing-information fields for system announcements.';

notify pgrst, 'reload schema';
