-- 일본 롱폼: ElevenLabs 음성과 최종 통합 파일 저장소

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'japan-longform-audio',
  'japan-longform-audio',
  true,
  104857600,
  array['audio/mpeg', 'audio/mp3']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload own Japan longform audio" on storage.objects;
create policy "Users upload own Japan longform audio" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'japan-longform-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users update own Japan longform audio" on storage.objects;
create policy "Users update own Japan longform audio" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'japan-longform-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete own Japan longform audio" on storage.objects;
create policy "Users delete own Japan longform audio" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'japan-longform-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
