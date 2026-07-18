-- 숏폼(사연): 원문 수집, 각색 지침, 각색 버전
-- 20260718_story_studio_foundation.sql 실행 후 적용한다.

create extension if not exists pgcrypto;

create table if not exists public.story_sources (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_kind text not null default 'text'
    check (source_kind in ('youtube', 'web', 'screenshot', 'text')),
  title text not null default '새 원문',
  source_url text,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.story_project_settings (
  project_id bigint primary key references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  adaptation_instruction text not null default '',
  preferred_model text not null default 'claude-sonnet-5',
  updated_at timestamptz not null default now()
);

create table if not exists public.story_adaptations (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null references public.projects(id) on delete cascade,
  source_id uuid references public.story_sources(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_title text not null default '',
  source_snapshot text not null,
  instruction_snapshot text not null,
  content text not null,
  model text not null,
  created_at timestamptz not null default now()
);

create index if not exists story_sources_project_created_idx
  on public.story_sources(project_id, created_at desc);

create index if not exists story_adaptations_project_created_idx
  on public.story_adaptations(project_id, created_at desc);

alter table public.story_sources enable row level security;
alter table public.story_project_settings enable row level security;
alter table public.story_adaptations enable row level security;

drop policy if exists "Users manage own story sources" on public.story_sources;
create policy "Users manage own story sources" on public.story_sources
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own story settings" on public.story_project_settings;
create policy "Users manage own story settings" on public.story_project_settings
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own story adaptations" on public.story_adaptations;
create policy "Users manage own story adaptations" on public.story_adaptations
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
