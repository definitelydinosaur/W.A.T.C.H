-- Repair: bring a pre-existing public.announcements table in line with the schema
-- the backend expects (see 202610290002_local_alerts_notifications.sql, whose
-- "create table if not exists" skipped creation because the table already existed).
-- Additive and idempotent: it only adds what is missing and never drops data.

alter table public.announcements
  add column if not exists source_id uuid references public.sources(id) on delete set null,
  add column if not exists source_name text,
  add column if not exists source_url text,
  add column if not exists source_type text,
  add column if not exists external_post_id text,
  add column if not exists content_hash text,
  add column if not exists original_text text,
  add column if not exists posted_at timestamptz,
  add column if not exists category text,
  add column if not exists ai_summary text,
  add column if not exists affects_location text,
  add column if not exists effective_date timestamptz,
  add column if not exists scope text,
  add column if not exists confidence double precision,
  add column if not exists status text not null default 'pending_review',
  add column if not exists conflict_group_id uuid,
  add column if not exists created_at timestamptz not null default now();

-- Backfill so existing rows are valid for the app.
update public.announcements set source_name = coalesce(source_name, 'Unknown source') where source_name is null;
update public.announcements set original_text = coalesce(original_text, ai_summary, '') where original_text is null;
update public.announcements set posted_at = coalesce(posted_at, created_at, now()) where posted_at is null;
update public.announcements
  set content_hash = coalesce(content_hash, md5(coalesce(original_text, '') || id::text))
  where content_hash is null;

alter table public.announcements
  alter column source_name set not null,
  alter column original_text set not null,
  alter column posted_at set not null,
  alter column content_hash set not null;

create index if not exists announcements_posted_at_idx on public.announcements(posted_at desc);
create index if not exists announcements_source_id_idx on public.announcements(source_id);
create index if not exists announcements_status_posted_idx on public.announcements(status, posted_at desc);

notify pgrst, 'reload schema';

