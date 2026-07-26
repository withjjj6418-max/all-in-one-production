-- 일본 롱폼: AI 추천 일본어 제목의 한국어 번역

alter table if exists public.japan_longform_edit_packages
  add column if not exists title_translations jsonb not null default '[]'::jsonb;
