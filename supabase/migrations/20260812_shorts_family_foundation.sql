-- 숏폼(가족) 랭킹형쇼츠 제작 데이터

create table if not exists public.shorts_family_configs (
  project_id bigint primary key references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_code text not null,
  reference_source_id bigint references public.research_sources(id) on delete set null,
  reference_path text,
  korean_title text not null default '',
  japanese_title text not null default '',
  japanese_title_translation text not null default '',
  discovery_results jsonb not null default '[]'::jsonb,
  planning_result jsonb,
  target_duration integer not null default 35 check (target_duration between 20 and 50),
  segment_count integer not null default 5 check (segment_count between 5 and 7),
  output_root text not null default 'C:\Users\withj\Dropbox\해짜_소스모음\05_랭킹형쇼츠_프로젝트',
  status text not null default '기획 중',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_code)
);

create table if not exists public.shorts_family_candidates (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  research_source_id bigint references public.research_sources(id) on delete set null,
  source_title text not null default '',
  source_url text,
  local_path text,
  source_kind text not null default 'library' check (source_kind in ('reference_split', 'library', 'original_found')),
  reference_rank integer,
  clip_start numeric not null default 0,
  clip_end numeric,
  korean_label text not null default '',
  japanese_label text not null default '',
  japanese_translation text not null default '',
  material text not null default '',
  emotion text not null default '',
  viral_cause text not null default '',
  korean_rank integer check (korean_rank between 1 and 5),
  japanese_rank integer check (japanese_rank between 1 and 5),
  flip_korean boolean not null default false,
  flip_japanese boolean not null default false,
  subtitle_strategy text not null default 'auto' check (subtitle_strategy in ('auto', 'crop', 'blur', 'keep')),
  safety_status text not null default '검수 필요',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shorts_family_configs
  add column if not exists japanese_title_translation text not null default '',
  add column if not exists discovery_results jsonb not null default '[]'::jsonb,
  add column if not exists planning_result jsonb;

alter table public.shorts_family_candidates
  add column if not exists japanese_translation text not null default '',
  add column if not exists material text not null default '',
  add column if not exists emotion text not null default '',
  add column if not exists viral_cause text not null default '';

create index if not exists shorts_family_configs_user_idx
  on public.shorts_family_configs(user_id, updated_at desc);

create index if not exists shorts_family_candidates_project_idx
  on public.shorts_family_candidates(project_id, created_at);

alter table public.shorts_family_configs enable row level security;
alter table public.shorts_family_candidates enable row level security;

drop policy if exists "Users manage own shorts family configs" on public.shorts_family_configs;
create policy "Users manage own shorts family configs" on public.shorts_family_configs
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own shorts family candidates" on public.shorts_family_candidates;
create policy "Users manage own shorts family candidates" on public.shorts_family_candidates
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
