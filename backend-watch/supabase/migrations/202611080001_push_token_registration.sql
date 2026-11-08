alter table public.user_info
  add column if not exists expo_push_token text,
  add column if not exists notification_prefs jsonb not null
    default '{"announcements": true, "weather": true}'::jsonb;

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_info(id) on delete cascade,
  expo_push_token text not null unique,
  device_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_active_idx
  on public.push_tokens(user_id, is_active);

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;
grant all on public.push_tokens to service_role;
grant select on public.push_tokens to authenticated;

drop policy if exists "Users read own push tokens" on public.push_tokens;
create policy "Users read own push tokens"
  on public.push_tokens for select to authenticated
  using (user_id = auth.uid());

notify pgrst, 'reload schema';
