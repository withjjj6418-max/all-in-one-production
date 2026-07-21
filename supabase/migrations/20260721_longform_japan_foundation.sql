-- 롱폼(일본): 원문부터 업로드까지 전용 제작 데이터 기반
-- 20260718_story_studio_foundation.sql 실행 후 적용한다.

create extension if not exists pgcrypto;

create table if not exists public.japan_longform_sources (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_kind text not null default 'youtube' check (source_kind in ('youtube', 'web', 'text')),
  title text not null default '새 원문',
  source_url text,
  korean_transcript text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.japan_longform_scripts (
  project_id bigint primary key references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references public.japan_longform_sources(id) on delete set null,
  adapted_korean text not null default '',
  final_korean text not null default '',
  claude_japanese text not null default '',
  verified_japanese text not null default '',
  verification_notes text not null default '',
  verification_model text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.japan_longform_voice_settings (
  project_id bigint primary key references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  voice_id text not null default '',
  voice_name text not null default '',
  model_id text not null default 'eleven_multilingual_v2',
  voice_settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.japan_longform_voice_segments (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sort_order integer not null default 0,
  text text not null default '',
  audio_url text,
  storage_path text,
  audio_duration numeric,
  alignment jsonb not null default '{}'::jsonb,
  subtitle_srt text not null default '',
  status text not null default 'todo' check (status in ('todo', 'generated', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.japan_longform_voice_runs (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  segment_count integer not null default 0,
  total_duration numeric not null default 0,
  combined_audio_url text,
  combined_storage_path text,
  combined_subtitle_srt text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.japan_longform_visual_assets (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_kind text not null check (asset_kind in ('thumbnail', 'background', 'loop_video')),
  provider text not null default 'manual' check (provider in ('flow', 'grok', 'manual')),
  prompt text not null default '',
  file_name text not null default '',
  storage_path text,
  url text not null default '',
  source_asset_id uuid references public.japan_longform_visual_assets(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.japan_longform_edit_packages (
  project_id bigint primary key references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  edit_notes text not null default '',
  status text not null default 'preparing' check (status in ('preparing', 'ready', 'done')),
  updated_at timestamptz not null default now()
);

create table if not exists public.japan_longform_publish_records (
  project_id bigint primary key references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  final_title text not null default '',
  youtube_url text not null default '',
  uploaded_at date,
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists japan_longform_sources_project_idx on public.japan_longform_sources(project_id, created_at desc);
create index if not exists japan_longform_voice_segments_project_idx on public.japan_longform_voice_segments(project_id, sort_order);
create index if not exists japan_longform_voice_runs_project_idx on public.japan_longform_voice_runs(project_id, created_at desc);
create index if not exists japan_longform_visual_assets_project_idx on public.japan_longform_visual_assets(project_id, asset_kind, created_at desc);

alter table public.japan_longform_sources enable row level security;
alter table public.japan_longform_scripts enable row level security;
alter table public.japan_longform_voice_settings enable row level security;
alter table public.japan_longform_voice_segments enable row level security;
alter table public.japan_longform_voice_runs enable row level security;
alter table public.japan_longform_visual_assets enable row level security;
alter table public.japan_longform_edit_packages enable row level security;
alter table public.japan_longform_publish_records enable row level security;

drop policy if exists "Users manage own Japan longform sources" on public.japan_longform_sources;
create policy "Users manage own Japan longform sources" on public.japan_longform_sources for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own Japan longform scripts" on public.japan_longform_scripts;
create policy "Users manage own Japan longform scripts" on public.japan_longform_scripts for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own Japan longform voice settings" on public.japan_longform_voice_settings;
create policy "Users manage own Japan longform voice settings" on public.japan_longform_voice_settings for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own Japan longform voice segments" on public.japan_longform_voice_segments;
create policy "Users manage own Japan longform voice segments" on public.japan_longform_voice_segments for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own Japan longform voice runs" on public.japan_longform_voice_runs;
create policy "Users manage own Japan longform voice runs" on public.japan_longform_voice_runs for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own Japan longform visual assets" on public.japan_longform_visual_assets;
create policy "Users manage own Japan longform visual assets" on public.japan_longform_visual_assets for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own Japan longform edit packages" on public.japan_longform_edit_packages;
create policy "Users manage own Japan longform edit packages" on public.japan_longform_edit_packages for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own Japan longform publish records" on public.japan_longform_publish_records;
create policy "Users manage own Japan longform publish records" on public.japan_longform_publish_records for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
