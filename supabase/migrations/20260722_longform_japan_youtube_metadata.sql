-- 일본 롱폼: Premiere 패키지의 YouTube 업로드 정보

alter table public.japan_longform_edit_packages
  add column if not exists title_candidates jsonb not null default '[]'::jsonb;
alter table public.japan_longform_edit_packages
  add column if not exists selected_title text not null default '';
alter table public.japan_longform_edit_packages
  add column if not exists youtube_description text not null default '';
alter table public.japan_longform_edit_packages
  add column if not exists youtube_tags text[] not null default '{}'::text[];
alter table public.japan_longform_edit_packages
  add column if not exists timeline_text text not null default '';
alter table public.japan_longform_edit_packages
  add column if not exists metadata_generated_at timestamptz;
