alter table public.locations
  add column if not exists full_address text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'locations'
      and column_name = 'address'
  ) then
    execute '
      update public.locations
      set full_address = address
      where full_address is null
    ';
  end if;
end
$$;

drop function if exists public.save_home_location(
  uuid, text, double precision, double precision, text, text, text
);

create function public.save_home_location(
  p_user_id uuid,
  p_full_address text,
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
    user_id, label, full_address, latitude, longitude, city, province, barangay, is_default
  )
  values (
    p_user_id, 'Home', p_full_address, p_latitude, p_longitude, p_city, p_province, p_barangay, true
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

revoke all on function public.save_home_location(uuid, text, double precision, double precision, text, text, text)
  from public, anon, authenticated;
grant execute on function public.save_home_location(uuid, text, double precision, double precision, text, text, text)
  to service_role;
