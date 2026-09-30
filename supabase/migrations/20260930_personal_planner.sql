create table if not exists public.personal_planner (
 user_id uuid primary key references auth.users(id) on delete cascade,
 payload jsonb not null,
 revision integer not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.personal_planner enable row level security;
revoke all on public.personal_planner from anon;
grant select, insert, update on public.personal_planner to authenticated;
create policy "planner owner read" on public.personal_planner for select to authenticated using (auth.uid() = user_id);
create policy "planner owner insert" on public.personal_planner for insert to authenticated with check (auth.uid() = user_id);
create policy "planner owner update" on public.personal_planner for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
