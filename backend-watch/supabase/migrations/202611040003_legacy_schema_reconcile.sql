-- Repair #2: reconcile legacy columns/tables with what the backend inserts.
-- Based on the live column list: the announcements repair already applied, but
-- legacy NOT NULL columns and an entirely different weather_records shape remain.
-- Additive and idempotent; no data is dropped.

-- announcements: legacy NOT NULL columns the backend never sets.
alter table public.announcements
  alter column published_at set default now(),
  alter column conflict_flag set default false;

-- notifications: legacy NOT NULL "kind" is never written by PushService.
-- Make it optional rather than guess at its allowed values.
alter table public.notifications
  alter column kind drop not null;

-- weather_records: backend writes/reads location_id, user_id, payload,
-- risk_level, observed_at, created_at. Keep the legacy columns for old data.
alter table public.weather_records
  add column if not exists user_id uuid references public.user_info(id) on delete cascade,
  add column if not exists payload jsonb,
  add column if not exists risk_level text,
  add column if not exists observed_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now(),
  alter column recorded_at set default now();

create index if not exists weather_records_location_observed_idx
  on public.weather_records(location_id, observed_at desc);
create index if not exists weather_records_user_observed_idx
  on public.weather_records(user_id, observed_at desc);

grant all on public.weather_records to service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'weather_records'
      and policyname = 'Users read own weather records'
  ) then
    create policy "Users read own weather records"
      on public.weather_records for select to authenticated
      using (user_id = auth.uid());
  end if;
end $$;

notify pgrst, 'reload schema';

