-- 숏폼(사연): Typecast TTS 설정, 생성 기록, 오디오 저장소

create table if not exists public.story_tts_settings (
  project_id bigint primary key references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  voice_id text,
  voice_name text,
  model text not null default 'ssfm-v30',
  emotion text not null default 'normal',
  audio_format text not null default 'mp3' check (audio_format in ('mp3', 'wav')),
  tempo numeric not null default 1.0,
  pitch integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.story_tts_generations (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  script_snapshot text not null,
  voice_id text not null,
  voice_name text not null,
  model text not null,
  emotion text not null,
  audio_format text not null,
  audio_url text not null,
  audio_duration numeric not null,
  subtitle_srt text not null,
  timestamps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists story_tts_generations_project_created_idx
  on public.story_tts_generations(project_id, created_at desc);

alter table public.story_tts_settings enable row level security;
alter table public.story_tts_generations enable row level security;

drop policy if exists "Users manage own story TTS settings" on public.story_tts_settings;
create policy "Users manage own story TTS settings" on public.story_tts_settings
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own story TTS generations" on public.story_tts_generations;
create policy "Users manage own story TTS generations" on public.story_tts_generations
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('story-audio', 'story-audio', true)
on conflict (id) do update set public = true;

drop policy if exists "Users upload own story audio" on storage.objects;
create policy "Users upload own story audio" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'story-audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update own story audio" on storage.objects;
create policy "Users update own story audio" on storage.objects
  for update to authenticated
  using (bucket_id = 'story-audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete own story audio" on storage.objects;
create policy "Users delete own story audio" on storage.objects
  for delete to authenticated
  using (bucket_id = 'story-audio' and (storage.foldername(name))[1] = auth.uid()::text);
