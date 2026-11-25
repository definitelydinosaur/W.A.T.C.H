-- Allow the existing Facebook source pipeline to collect PAGASA Visayas posts.
alter table public.school_sources
  drop constraint if exists school_sources_source_type_check;
alter table public.school_sources
  add constraint school_sources_source_type_check
  check (source_type in ('lgu', 'institution', 'pagasa'));

alter table public.announcements
  drop constraint if exists announcements_source_type_check;
alter table public.announcements
  add constraint announcements_source_type_check
  check (source_type in ('lgu', 'institution', 'manual', 'pagasa'));

insert into public.school_sources (
  school_name,
  facebook_url,
  is_active,
  source_type,
  city,
  province
)
values (
  'PAGASA Visayas',
  'https://www.facebook.com/pagasa.visayas.prsd',
  true,
  'pagasa',
  null,
  null
)
on conflict (facebook_url) do update
set
  school_name = excluded.school_name,
  is_active = true,
  source_type = 'pagasa';
