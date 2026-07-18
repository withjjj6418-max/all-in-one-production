-- 숏폼(사연): 수동 YouTube 업로드 결과 보관

create table if not exists public.story_publish_records (
  project_id bigint primary key references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  final_title text not null default '',
  youtube_url text not null default '',
  uploaded_at date,
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists story_publish_records_user_updated_idx
  on public.story_publish_records(user_id, updated_at desc);

alter table public.story_publish_records enable row level security;

drop policy if exists "Users manage own story publish records" on public.story_publish_records;
create policy "Users manage own story publish records" on public.story_publish_records
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
