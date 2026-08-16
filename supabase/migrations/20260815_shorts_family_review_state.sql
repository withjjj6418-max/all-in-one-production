-- 랭킹형 발굴·원본 추적 단계의 검색/검수 상태를 새로고침 후에도 유지하기 위한 컬럼

alter table public.shorts_family_configs
  add column if not exists discovery_review jsonb not null default '{}'::jsonb,
  add column if not exists source_matches jsonb not null default '{}'::jsonb,
  add column if not exists source_review jsonb not null default '{}'::jsonb,
  add column if not exists downloaded_paths jsonb not null default '{}'::jsonb;
