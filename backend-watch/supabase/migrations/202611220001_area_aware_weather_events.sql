alter table public.hazards
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists title text,
  add column if not exists source_type text,
  add column if not exists source_name text,
  add column if not exists source_url text;

update public.hazards h
set
  city = coalesce(h.city, l.city),
  province = coalesce(h.province, l.province)
from public.locations l
where h.location_id = l.loc_id
  and (h.city is null or h.province is null);

alter table public.pagasa_alerts
  add column if not exists affected_areas text[] not null default '{}',
  add column if not exists area_review_status text not null default 'needs_review',
  add column if not exists notification_announcement_id bigint;

alter table public.announcements
  add column if not exists pagasa_alert_id bigint;

alter table public.pagasa_alerts
  drop constraint if exists pagasa_alerts_area_review_status_check;

alter table public.pagasa_alerts
  add constraint pagasa_alerts_area_review_status_check
  check (area_review_status in ('needs_review', 'matched', 'admin_assigned', 'sent'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pagasa_alerts_notification_announcement_id_fkey'
      and conrelid = 'public.pagasa_alerts'::regclass
  ) then
    alter table public.pagasa_alerts
      add constraint pagasa_alerts_notification_announcement_id_fkey
      foreign key (notification_announcement_id)
      references public.announcements(id)
      on delete set null;
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conname = 'announcements_pagasa_alert_id_fkey'
      and conrelid = 'public.announcements'::regclass
  ) then
    alter table public.announcements
      add constraint announcements_pagasa_alert_id_fkey
      foreign key (pagasa_alert_id)
      references public.pagasa_alerts(id)
      on delete set null;
  end if;
end
$$;

create index if not exists pagasa_alerts_area_review_idx
  on public.pagasa_alerts(area_review_status, published_at desc);

create unique index if not exists pagasa_alerts_notification_announcement_uidx
  on public.pagasa_alerts(notification_announcement_id)
  where notification_announcement_id is not null;

create unique index if not exists announcements_pagasa_alert_id_uidx
  on public.announcements(pagasa_alert_id)
  where pagasa_alert_id is not null;

notify pgrst, 'reload schema';
