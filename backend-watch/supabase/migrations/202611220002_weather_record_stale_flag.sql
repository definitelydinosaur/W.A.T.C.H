alter table public.weather_records
  add column if not exists is_stale boolean;

update public.weather_records
set is_stale = true
where is_stale is null;

alter table public.weather_records
  alter column is_stale set default false,
  alter column is_stale set not null;

notify pgrst, 'reload schema';
