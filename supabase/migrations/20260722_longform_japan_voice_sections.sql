-- 일본 롱폼: 내용 단위 TTS 구간 메타데이터

alter table if exists public.japan_longform_voice_segments
  add column if not exists section_kind text not null default 'body';

alter table if exists public.japan_longform_voice_segments
  add column if not exists section_title text not null default '';

alter table if exists public.japan_longform_voice_settings
  add column if not exists script_snapshot text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'japan_longform_voice_segments_section_kind_check'
  ) then
    alter table public.japan_longform_voice_segments
      add constraint japan_longform_voice_segments_section_kind_check
      check (section_kind in ('opening', 'body', 'outro'));
  end if;
end $$;

update public.japan_longform_voice_segments
set section_title = '본문 ' || (sort_order + 1)::text
where section_title = '';
