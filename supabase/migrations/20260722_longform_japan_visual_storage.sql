-- 일본 롱폼: Flow 이미지와 Gemini 루프 영상 저장소

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'japan-longform-visuals',
  'japan-longform-visuals',
  true,
  524288000,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload own Japan longform visuals" on storage.objects;
create policy "Users upload own Japan longform visuals" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'japan-longform-visuals'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users update own Japan longform visuals" on storage.objects;
create policy "Users update own Japan longform visuals" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'japan-longform-visuals'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete own Japan longform visuals" on storage.objects;
create policy "Users delete own Japan longform visuals" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'japan-longform-visuals'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
