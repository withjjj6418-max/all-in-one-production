-- 숏폼(사연): Premiere 편집 패키지와 배경영상 보관함

create table if not exists public.story_edit_packages (
  project_id bigint primary key references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  edit_notes text not null default '',
  status text not null default 'preparing' check (status in ('preparing', 'ready', 'done')),
  updated_at timestamptz not null default now()
);

create table if not exists public.story_background_assets (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  file_name text not null,
  file_size bigint not null default 0,
  mime_type text not null default 'video/mp4',
  storage_path text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create index if not exists story_background_assets_project_created_idx
  on public.story_background_assets(project_id, created_at desc);

alter table public.story_edit_packages enable row level security;
alter table public.story_background_assets enable row level security;

drop policy if exists "Users manage own story edit packages" on public.story_edit_packages;
create policy "Users manage own story edit packages" on public.story_edit_packages
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own story background assets" on public.story_background_assets;
create policy "Users manage own story background assets" on public.story_background_assets
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'story-backgrounds',
  'story-backgrounds',
  true,
  524288000,
  array['video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload own story backgrounds" on storage.objects;
create policy "Users upload own story backgrounds" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'story-backgrounds' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update own story backgrounds" on storage.objects;
create policy "Users update own story backgrounds" on storage.objects
  for update to authenticated
  using (bucket_id = 'story-backgrounds' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete own story backgrounds" on storage.objects;
create policy "Users delete own story backgrounds" on storage.objects
  for delete to authenticated
  using (bucket_id = 'story-backgrounds' and (storage.foldername(name))[1] = auth.uid()::text);
