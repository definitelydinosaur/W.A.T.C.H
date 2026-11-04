alter table public.institutions enable row level security;

grant select on public.institutions to anon, authenticated;

drop policy if exists "Institutions are searchable" on public.institutions;
create policy "Institutions are searchable"
  on public.institutions
  for select
  to anon, authenticated
  using (true);

notify pgrst, 'reload schema';
