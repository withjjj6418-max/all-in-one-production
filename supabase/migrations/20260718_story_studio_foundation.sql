-- 제작 유형 분리 1단계
-- 기존 데이터는 모두 숏폼(사연)으로 간주한다.
-- Supabase SQL Editor에서 검토 후 실행할 것.

alter table if exists public.projects
  add column if not exists production_type text not null default 'shorts_story';

alter table if exists public.channels
  add column if not exists production_type text not null default 'shorts_story';

alter table if exists public.research_sources
  add column if not exists production_type text not null default 'shorts_story';

alter table if exists public.post_sounds
  add column if not exists production_type text not null default 'shorts_story';

alter table if exists public.post_images
  add column if not exists production_type text not null default 'shorts_story';

alter table if exists public.post_edits
  add column if not exists production_type text not null default 'shorts_story';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_production_type_check') then
    alter table public.projects add constraint projects_production_type_check
      check (production_type in ('shorts_story', 'shorts_haejja', 'longform_japan', 'longform_movie'));
  end if;
end $$;

create index if not exists projects_user_production_type_idx
  on public.projects (user_id, production_type, updated_at desc);

create index if not exists channels_user_production_type_idx
  on public.channels (user_id, production_type);

create index if not exists research_sources_user_production_type_idx
  on public.research_sources (user_id, production_type, created_at desc);
