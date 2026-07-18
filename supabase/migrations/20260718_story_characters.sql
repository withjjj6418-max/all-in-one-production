-- 숏폼(사연): 캐릭터 삽입 작업과 생성 이미지 저장

create table if not exists public.story_character_cues (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sort_order integer not null default 0,
  character_name text not null default '등장인물',
  dialogue_excerpt text not null default '',
  emotion text not null default '무표정',
  pose text not null default '',
  insert_note text not null default '',
  built_in_character_id text,
  expression_id text,
  image_url text,
  status text not null default 'todo' check (status in ('todo', 'ready', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists story_character_cues_project_sort_idx
  on public.story_character_cues(project_id, sort_order, created_at);

alter table public.story_character_cues enable row level security;
drop policy if exists "Users manage own story character cues" on public.story_character_cues;
create policy "Users manage own story character cues" on public.story_character_cues
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table if exists public.post_images add column if not exists url text;
alter table if exists public.post_images add column if not exists cue_id uuid references public.story_character_cues(id) on delete set null;
alter table if exists public.post_images add column if not exists memo text;

insert into storage.buckets (id, name, public)
values ('story-images', 'story-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Users upload own story images" on storage.objects;
create policy "Users upload own story images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'story-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update own story images" on storage.objects;
create policy "Users update own story images" on storage.objects
  for update to authenticated
  using (bucket_id = 'story-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete own story images" on storage.objects;
create policy "Users delete own story images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'story-images' and (storage.foldername(name))[1] = auth.uid()::text);
