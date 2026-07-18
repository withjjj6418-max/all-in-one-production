-- 숏폼(사연): 검수가 끝난 최종 통합 음성과 SRT 확정 결과

alter table if exists public.story_voice_runs
  add column if not exists combined_audio_url text;

alter table if exists public.story_voice_runs
  add column if not exists combined_audio_storage_path text;

alter table if exists public.story_voice_runs
  add column if not exists finalized_at timestamptz;
