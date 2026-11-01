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
  if auth.role() is distinct from 'service_role'
    and auth.uid() is distinct from p_user_id then
    raise exception 'Cannot update another user''s institution.'
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
  to authenticated, service_role;

notify pgrst, 'reload schema';
