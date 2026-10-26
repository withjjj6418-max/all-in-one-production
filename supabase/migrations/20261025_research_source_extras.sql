-- 소스 게시판(영상소스모음): 링크 종류, 추가원본, 기획방향
-- source_role: 'original'(원본) / 'reference'(레퍼런스) / NULL(미선택 = 연결할 때 용도를 물어봄)
-- extra_sources: 추가원본 주소 목록. 순서대로 추가원본1, 추가원본2 … (최대 19개)
-- plan_direction: 기획방향. 제작실·숏튜디오 프로젝트의 기획 방향(owner_brief)으로 전달
-- 기존 글은 source_role이 NULL(미선택)로 남는다.
-- 메모 칸은 화면에서 없애고 기획방향으로 대신한다. 기존 메모는 기획방향이 비어 있는 글에만 옮기고, memo 값은 지우지 않는다.
-- 여러 번 실행해도 안전하다.

alter table public.research_sources
  add column if not exists source_role text,
  add column if not exists extra_sources jsonb not null default '[]'::jsonb,
  add column if not exists plan_direction text;

alter table public.research_sources
  drop constraint if exists research_sources_source_role_check;
alter table public.research_sources
  add constraint research_sources_source_role_check
  check (source_role is null or source_role in ('original', 'reference'));

alter table public.research_sources
  drop constraint if exists research_sources_extra_sources_check;
alter table public.research_sources
  add constraint research_sources_extra_sources_check
  check (jsonb_typeof(extra_sources) = 'array' and jsonb_array_length(extra_sources) <= 19);

alter table public.research_sources
  drop constraint if exists research_sources_plan_direction_check;
alter table public.research_sources
  add constraint research_sources_plan_direction_check
  check (plan_direction is null or char_length(plan_direction) <= 10000);

-- 기존 메모 → 기획방향 (기획방향이 비어 있는 글만)
update public.research_sources
set plan_direction = memo
where coalesce(btrim(plan_direction), '') = ''
  and coalesce(btrim(memo), '') <> '';
