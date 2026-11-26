do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    if to_regclass('public.notifications') is not null
      and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'notifications'
      )
    then
      execute 'alter publication supabase_realtime add table public.notifications';
    end if;

    if to_regclass('public.user_reports') is not null
      and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'user_reports'
      )
    then
      execute 'alter publication supabase_realtime add table public.user_reports';
    end if;
  end if;
end
$$;
