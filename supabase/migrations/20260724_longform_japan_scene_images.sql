-- 일본 롱폼: 한 장면에 여러 일러스트 저장
-- 20260723_longform_japan_story_scenes.sql 실행 후 적용한다.

create table if not exists public.japan_longform_scene_images (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.japan_longform_story_scenes(id) on delete cascade,
  project_id bigint not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sort_order integer not null default 0,
  file_name text not null default '',
  storage_path text,
  url text not null,
  created_at timestamptz not null default now()
);

create index if not exists japan_longform_scene_images_scene_sort_idx
  on public.japan_longform_scene_images(scene_id, sort_order, created_at);

create index if not exists japan_longform_scene_images_project_idx
  on public.japan_longform_scene_images(project_id, created_at);

alter table public.japan_longform_scene_images enable row level security;

drop policy if exists "Users manage own Japan longform scene images" on public.japan_longform_scene_images;
create policy "Users manage own Japan longform scene images" on public.japan_longform_scene_images
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 기존 단일 이미지가 있으면 각 장면의 1번 이미지로 한 번만 이관한다.
insert into public.japan_longform_scene_images (
  scene_id,
  project_id,
  user_id,
  sort_order,
  file_name,
  storage_path,
  url
)
select
  scene.id,
  scene.project_id,
  scene.user_id,
  0,
  '기존_장면이미지',
  scene.storage_path,
  scene.image_url
from public.japan_longform_story_scenes as scene
where scene.image_url is not null
  and scene.image_url <> ''
  and not exists (
    select 1
    from public.japan_longform_scene_images as image
    where image.scene_id = scene.id
  );
