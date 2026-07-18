-- Typecast 목소리 즐겨찾기: 프로젝트와 무관하게 사용자별로 보관

create table if not exists public.typecast_voice_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  voice_id text not null,
  voice_name text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, voice_id)
);

create index if not exists typecast_voice_favorites_user_created_idx
  on public.typecast_voice_favorites(user_id, created_at desc);

alter table public.typecast_voice_favorites enable row level security;

drop policy if exists "Users manage own Typecast voice favorites" on public.typecast_voice_favorites;
create policy "Users manage own Typecast voice favorites" on public.typecast_voice_favorites
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
