-- 숏폼(사연): 캐릭터별 Typecast 배역, 대사 구간, 생성 실행 기록

create table if not exists public.story_voice_casts (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sort_order integer not null default 0,
  character_name text not null,
  voice_id text not null,
  voice_name text not null,
  emotion text not null default 'normal',
  tempo numeric not null default 1.0,
  pitch integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.story_voice_segments (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cast_id uuid references public.story_voice_casts(id) on delete set null,
  sort_order integer not null default 0,
  text text not null default '',
  audio_url text,
  storage_path text,
  audio_duration numeric,
  subtitle_srt text not null default '',
  timestamps jsonb not null default '[]'::jsonb,
  status text not null default 'todo' check (status in ('todo', 'generated', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.story_voice_runs (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  segment_count integer not null default 0,
  total_duration numeric not null default 0,
  combined_subtitle_srt text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists story_voice_casts_project_sort_idx
  on public.story_voice_casts(project_id, sort_order);
create index if not exists story_voice_segments_project_sort_idx
  on public.story_voice_segments(project_id, sort_order);
create index if not exists story_voice_runs_project_created_idx
  on public.story_voice_runs(project_id, created_at desc);

alter table public.story_voice_casts enable row level security;
alter table public.story_voice_segments enable row level security;
alter table public.story_voice_runs enable row level security;

drop policy if exists "Users manage own story voice casts" on public.story_voice_casts;
create policy "Users manage own story voice casts" on public.story_voice_casts
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own story voice segments" on public.story_voice_segments;
create policy "Users manage own story voice segments" on public.story_voice_segments
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own story voice runs" on public.story_voice_runs;
create policy "Users manage own story voice runs" on public.story_voice_runs
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
