-- 롱폼(일본): 주요 장면 일러스트 기획과 작품 공통 스타일

create table if not exists public.japan_longform_scene_settings (
  project_id bigint primary key references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  style_prompt text not null default '',
  safety_prompt text not null default '',
  target_scene_count integer not null default 5 check (target_scene_count between 3 and 8),
  updated_at timestamptz not null default now()
);

create table if not exists public.japan_longform_story_scenes (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sort_order integer not null default 0,
  scene_title text not null default '새 장면',
  source_excerpt text not null default '',
  insertion_seconds integer not null default 0 check (insertion_seconds >= 0),
  characters text[] not null default array[]::text[],
  location text not null default '',
  scene_action text not null default '',
  camera_direction text not null default '',
  horror_level integer not null default 2 check (horror_level between 1 and 3),
  safety_status text not null default 'safe' check (safety_status in ('safe', 'review', 'replace')),
  safety_note text not null default '',
  scene_prompt text not null default '',
  status text not null default 'draft' check (status in ('draft', 'approved', 'generated')),
  image_url text,
  storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists japan_longform_story_scenes_project_sort_idx
  on public.japan_longform_story_scenes(project_id, sort_order);

alter table public.japan_longform_scene_settings enable row level security;
alter table public.japan_longform_story_scenes enable row level security;

drop policy if exists "Users manage own Japan longform scene settings" on public.japan_longform_scene_settings;
create policy "Users manage own Japan longform scene settings" on public.japan_longform_scene_settings
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own Japan longform story scenes" on public.japan_longform_story_scenes;
create policy "Users manage own Japan longform story scenes" on public.japan_longform_story_scenes
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
