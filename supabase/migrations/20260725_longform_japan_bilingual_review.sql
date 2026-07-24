-- 일본 롱폼: 영상 편집용 한일 대조 대본

alter table if exists public.japan_longform_scripts
  add column if not exists bilingual_review_text text not null default '';
