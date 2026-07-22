-- 일본 롱폼: 루프영상 제작자를 Grok에서 Gemini로 변경

alter table public.japan_longform_visual_assets
  drop constraint if exists japan_longform_visual_assets_provider_check;

alter table public.japan_longform_visual_assets
  add constraint japan_longform_visual_assets_provider_check
  check (provider in ('flow', 'grok', 'gemini', 'manual'));
