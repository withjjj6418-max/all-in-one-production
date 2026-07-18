"use client";
/* eslint-disable @next/next/no-img-element -- Supabase 프로젝트별 동적 URL을 원본 PNG로 내려받아야 합니다. */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, Check, Download, FileAudio, FileText, Film, ImageIcon,
  Loader2, PackageCheck, Save, Trash2, Upload, Video,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type TtsGeneration = {
  id: string;
  voice_name: string;
  audio_format: string;
  audio_url: string;
  audio_duration: number;
  subtitle_srt: string;
  created_at: string;
};

type CharacterCue = {
  id: string;
  sort_order: number;
  character_name: string;
  dialogue_excerpt: string;
  image_url: string | null;
};

type BackgroundAsset = {
  id: string;
  title: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  url: string;
  created_at: string;
};

type PackageStatus = "preparing" | "ready" | "done";

type VoiceCast = { id: string; character_name: string; voice_name: string };
type VoiceSegment = {
  id: string;
  cast_id: string | null;
  sort_order: number;
  text: string;
  audio_url: string | null;
  audio_duration: number | null;
  status: string;
};
type VoiceRun = { id: string; combined_subtitle_srt: string; combined_audio_url: string | null; total_duration: number; created_at: string };

function downloadText(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim() || "사연_프로젝트";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatDuration(seconds: number) {
  const minute = Math.floor(seconds / 60);
  const second = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${minute}:${second}`;
}

export default function StoryEditingPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState("사연 프로젝트");
  const [script, setScript] = useState("");
  const [generations, setGenerations] = useState<TtsGeneration[]>([]);
  const [characters, setCharacters] = useState<CharacterCue[]>([]);
  const [backgrounds, setBackgrounds] = useState<BackgroundAsset[]>([]);
  const [voiceCasts, setVoiceCasts] = useState<VoiceCast[]>([]);
  const [voiceSegments, setVoiceSegments] = useState<VoiceSegment[]>([]);
  const [voiceRun, setVoiceRun] = useState<VoiceRun | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [status, setStatus] = useState<PackageStatus>("preparing");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schemaReady, setSchemaReady] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const latestTts = generations[0] ?? null;
  const completedCharacters = characters.filter((item) => item.image_url);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active || !user) return;
      setUserId(user.id);
      const [projectRes, scriptRes, ttsRes, characterRes, backgroundRes, packageRes, voiceCastsRes, voiceSegmentsRes, voiceRunRes] = await Promise.all([
        supabase.from("projects").select("title").eq("id", projectId).single(),
        supabase.from("scripts").select("content").eq("project_id", projectId).maybeSingle(),
        supabase.from("story_tts_generations").select("id, voice_name, audio_format, audio_url, audio_duration, subtitle_srt, created_at").eq("project_id", projectId).order("created_at", { ascending: false }),
        supabase.from("story_character_cues").select("id, sort_order, character_name, dialogue_excerpt, image_url").eq("project_id", projectId).order("sort_order"),
        supabase.from("story_background_assets").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
        supabase.from("story_edit_packages").select("edit_notes, status").eq("project_id", projectId).maybeSingle(),
        supabase.from("story_voice_casts").select("id, character_name, voice_name").eq("project_id", projectId).order("sort_order"),
        supabase.from("story_voice_segments").select("id, cast_id, sort_order, text, audio_url, audio_duration, status").eq("project_id", projectId).eq("status", "generated").order("sort_order"),
        supabase.from("story_voice_runs").select("id, combined_subtitle_srt, combined_audio_url, total_duration, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (!active) return;
      const schemaMissing = [backgroundRes.error, packageRes.error].some((item) => item?.code === "42P01" || item?.code === "PGRST205");
      if (schemaMissing) setSchemaReady(false);
      else if (backgroundRes.error || packageRes.error) setError("편집 패키지를 불러오지 못했습니다.");
      setProjectTitle(projectRes.data?.title || "사연 프로젝트");
      setScript(scriptRes.data?.content || "");
      setGenerations((ttsRes.data ?? []) as TtsGeneration[]);
      setCharacters((characterRes.data ?? []) as CharacterCue[]);
      setBackgrounds((backgroundRes.data ?? []) as BackgroundAsset[]);
      setVoiceCasts((voiceCastsRes.data ?? []) as VoiceCast[]);
      setVoiceSegments((voiceSegmentsRes.data ?? []) as VoiceSegment[]);
      setVoiceRun((voiceRunRes.data as VoiceRun | null) ?? null);
      setEditNotes(packageRes.data?.edit_notes || "");
      setStatus((packageRes.data?.status as PackageStatus | undefined) || "preparing");
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [projectId, supabase]);

  const savePackage = async (nextStatus: PackageStatus = status) => {
    if (!userId) return;
    setSaving(true); setError(null); setNotice(null);
    const { error: saveError } = await supabase.from("story_edit_packages").upsert({
      project_id: projectId,
      user_id: userId,
      edit_notes: editNotes,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (saveError) return setError("편집 메모 저장에 실패했습니다.");
    setStatus(nextStatus);
    setNotice(nextStatus === "ready" ? "편집 준비 완료로 표시했습니다." : "편집 패키지를 저장했습니다.");
  };

  const uploadBackgrounds = async (files: FileList | null) => {
    if (!files?.length || !userId) return;
    setUploading(true); setError(null); setNotice(null);
    const uploaded: BackgroundAsset[] = [];
    try {
      for (const file of Array.from(files)) {
        if (file.size > 500 * 1024 * 1024) throw new Error(`${file.name}: 500MB 이하 파일만 올릴 수 있습니다.`);
        const extension = file.name.split(".").pop()?.toLowerCase() || "mp4";
        const storagePath = `${userId}/${projectId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("story-backgrounds").upload(storagePath, file, { contentType: file.type || "video/mp4" });
        if (uploadError) throw new Error(`${file.name} 업로드에 실패했습니다.`);
        const { data: publicUrl } = supabase.storage.from("story-backgrounds").getPublicUrl(storagePath);
        const { data, error: insertError } = await supabase.from("story_background_assets").insert({
          project_id: projectId,
          user_id: userId,
          title: file.name.replace(/\.[^.]+$/, ""),
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || "video/mp4",
          storage_path: storagePath,
          url: publicUrl.publicUrl,
        }).select("*").single();
        if (insertError || !data) {
          await supabase.storage.from("story-backgrounds").remove([storagePath]);
          throw new Error(`${file.name} 정보 저장에 실패했습니다.`);
        }
        uploaded.push(data as BackgroundAsset);
      }
      setBackgrounds((current) => [...uploaded, ...current]);
      setNotice(`${uploaded.length}개의 배경영상을 저장했습니다.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "배경영상 업로드 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const deleteBackground = async (asset: BackgroundAsset) => {
    if (!window.confirm(`'${asset.title}' 배경영상을 삭제할까요?`)) return;
    const { error: storageError } = await supabase.storage.from("story-backgrounds").remove([asset.storage_path]);
    if (storageError) return setError("배경영상 파일 삭제에 실패했습니다.");
    const { error: deleteError } = await supabase.from("story_background_assets").delete().eq("id", asset.id);
    if (deleteError) return setError("배경영상 정보 삭제에 실패했습니다.");
    setBackgrounds((current) => current.filter((item) => item.id !== asset.id));
  };

  const downloadManifest = () => {
    const lines = [
      `[프로젝트] ${projectTitle}`,
      `[내레이션] ${voiceSegments.length ? `캐릭터별 ${voiceSegments.length}개 구간` : latestTts ? `${latestTts.voice_name} / ${formatDuration(Number(latestTts.audio_duration))}` : "없음"}`,
      ...voiceSegments.map((item, index) => { const cast = voiceCasts.find((voiceCast) => voiceCast.id === item.cast_id); return `  ${index + 1}. ${cast?.character_name || "미지정"} — ${item.text}`; }),
      `[자막] ${voiceRun?.combined_subtitle_srt || latestTts?.subtitle_srt ? "SRT 있음" : "없음"}`,
      `[배경영상] ${backgrounds.length}개`,
      ...backgrounds.map((item, index) => `  ${index + 1}. ${item.file_name}`),
      `[캐릭터 이미지] ${completedCharacters.length}개`,
      ...completedCharacters.map((item, index) => `  ${index + 1}. ${item.character_name} — ${item.dialogue_excerpt}`),
      "",
      "[편집 메모]",
      editNotes || "메모 없음",
    ];
    downloadText(`${safeFileName(projectTitle)}_편집목록.txt`, lines.join("\n"));
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-brand-olive" /></div>;
  if (!schemaReady) return <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-7 shadow-sm"><h1 className="text-lg font-bold">편집 패키지 설정이 필요합니다</h1><p className="mt-3 text-sm text-muted-foreground">Supabase에서 `20260718_story_editing.sql`을 실행해주세요.</p><Link href={`/studio/shorts-story/projects/${projectId}`} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-brand-olive"><ArrowLeft size={15} /> 워크벤치</Link></div>;

  const checklist = [
    { label: "확정 대본", done: Boolean(script) },
    { label: "TTS 음성", done: Boolean(latestTts?.audio_url || voiceRun?.combined_audio_url) },
    { label: "SRT 자막", done: Boolean(latestTts?.subtitle_srt || voiceRun?.combined_subtitle_srt) },
    { label: "배경영상", done: backgrounds.length > 0 },
    { label: "캐릭터 이미지", done: completedCharacters.length > 0 },
  ];

  return <div className="mx-auto max-w-7xl space-y-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><Link href={`/studio/shorts-story/projects/${projectId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-brand-olive"><ArrowLeft size={15} /> 워크벤치</Link><h1 className="mt-3 text-2xl font-bold sm:text-3xl">Premiere 편집 패키지</h1><p className="mt-1 text-sm text-muted-foreground">{projectTitle} · 편집에 필요한 파일을 한곳에서 준비합니다.</p></div><button onClick={() => savePackage(status === "ready" ? "preparing" : "ready")} disabled={saving} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${status === "ready" ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-brand-olive text-white"}`}>{saving ? <Loader2 size={15} className="animate-spin" /> : status === "ready" ? <Check size={15} /> : <PackageCheck size={15} />}{status === "ready" ? "편집 준비 완료됨" : "편집 준비 완료"}</button></div>
    {(error || notice) && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{error || notice}</div>}

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{checklist.map((item) => <div key={item.label} className={`rounded-xl border p-4 ${item.done ? "border-emerald-200 bg-emerald-50" : "border-border bg-white"}`}><div className="flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded-full ${item.done ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"}`}>{item.done ? <Check size={13} /> : <span className="text-[10px]">—</span>}</span><span className="text-xs font-bold">{item.label}</span></div></div>)}</section>

    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><FileAudio size={18} className="text-brand-olive" /><h2 className="font-bold">음성 · 자동 자막</h2></div><div className="flex gap-3"><Link href={`/studio/shorts-story/projects/${projectId}/voice`} className="text-xs font-bold text-brand-olive">단일 TTS</Link><Link href={`/studio/shorts-story/projects/${projectId}/voice/cast`} className="text-xs font-bold text-brand-olive">캐릭터별 TTS</Link></div></div>
          {voiceRun?.combined_audio_url && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><p className="text-sm font-bold">최종 통합 TTS · SRT</p><p className="mt-1 text-xs text-muted-foreground">{formatDuration(Number(voiceRun.total_duration))} · 검수 완료 결과</p></div><audio controls src={voiceRun.combined_audio_url} className="h-9 max-w-full lg:w-72" /><div className="flex gap-2"><a href={voiceRun.combined_audio_url} download className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-800"><Download size={13} /> 최종 WAV</a><button onClick={() => downloadText(`${safeFileName(projectTitle)}_자막.srt`, voiceRun.combined_subtitle_srt)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white"><Download size={13} /> 최종 SRT</button></div></div></div>}
          {voiceSegments.length > 0 && <div className="mt-4 rounded-xl border border-brand-olive/20 bg-brand-cream/40 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold">캐릭터별 음성 {voiceSegments.length}개</p><p className="mt-1 text-xs text-muted-foreground">구간 순서대로 프리미어에 배치하세요.</p></div>{voiceRun?.combined_subtitle_srt && <button onClick={() => downloadText(`${safeFileName(projectTitle)}_통합자막.srt`, voiceRun.combined_subtitle_srt)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-pink px-3 py-2 text-xs font-bold"><Download size={13} /> 통합 SRT</button>}</div><div className="mt-3 space-y-2">{voiceSegments.map((segment, index) => { const cast = voiceCasts.find((item) => item.id === segment.cast_id); return <div key={segment.id} className="flex flex-col gap-2 rounded-lg bg-white p-3 lg:flex-row lg:items-center"><span className="text-xs font-extrabold text-brand-olive">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><p className="text-xs font-bold">{cast?.character_name || "미지정"} · {cast?.voice_name || "목소리"}</p><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{segment.text}</p></div><audio controls src={segment.audio_url || undefined} className="h-8 max-w-full lg:w-56" /><a href={segment.audio_url || "#"} download={`${String(index + 1).padStart(2, "0")}_${cast?.character_name || "화자"}.mp3`} className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2.5 py-2 text-[11px] font-bold"><Download size={11} /> 음성</a></div>; })}</div></div>}
          {latestTts ? <div className="mt-4 rounded-xl bg-stone-50 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><p className="text-sm font-bold">단일 내레이션 · {latestTts.voice_name} · {formatDuration(Number(latestTts.audio_duration))}</p><p className="mt-1 text-xs text-muted-foreground">가장 최근에 생성한 {latestTts.audio_format.toUpperCase()} 파일</p></div><audio controls src={latestTts.audio_url} className="h-9 max-w-full lg:w-72" /><div className="flex gap-2"><a href={latestTts.audio_url} download className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs font-bold"><Download size={13} /> 음성</a><button onClick={() => downloadText(`${safeFileName(projectTitle)}_자막.srt`, latestTts.subtitle_srt)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-pink px-3 py-2 text-xs font-bold"><Download size={13} /> SRT</button></div></div></div> : voiceSegments.length === 0 && <p className="mt-4 rounded-xl bg-muted/40 p-7 text-center text-sm text-muted-foreground">아직 생성된 TTS가 없습니다.</p>}
        </section>

        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><Video size={18} className="text-brand-olive" /><div><h2 className="font-bold">배경영상</h2><p className="mt-0.5 text-xs text-muted-foreground">MP4·MOV·WEBM, 파일당 최대 500MB</p></div></div><label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-olive px-3 py-2 text-xs font-bold text-white"><input ref={fileInputRef} type="file" accept="video/mp4,video/quicktime,video/webm" multiple className="hidden" onChange={(event) => uploadBackgrounds(event.target.files)} />{uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}{uploading ? "업로드 중" : "영상 추가"}</label></div>{backgrounds.length ? <div className="mt-4 divide-y divide-border">{backgrounds.map((asset) => <div key={asset.id} className="flex items-center gap-3 py-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-cream text-brand-olive"><Film size={17} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{asset.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{formatBytes(Number(asset.file_size))} · {asset.mime_type}</p></div><a href={asset.url} download={asset.file_name} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-brand-olive" aria-label="다운로드"><Download size={15} /></a><button onClick={() => deleteBackground(asset)} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600" aria-label="삭제"><Trash2 size={15} /></button></div>)}</div> : <p className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">직접 촬영한 배경영상을 이 프로젝트에 올려주세요.</p>}</section>

        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><ImageIcon size={18} className="text-brand-olive" /><h2 className="font-bold">캐릭터 이미지</h2><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{completedCharacters.length}</span></div><Link href={`/studio/shorts-story/projects/${projectId}/characters`} className="text-xs font-bold text-brand-olive">캐릭터 작업 열기</Link></div>{completedCharacters.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{completedCharacters.map((item, index) => <div key={item.id} className="overflow-hidden rounded-xl border border-border"><img src={item.image_url!} alt={item.character_name} className="aspect-video w-full bg-stone-50 object-contain" /><div className="p-3"><p className="text-xs font-bold">{index + 1}. {item.character_name}</p><p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{item.dialogue_excerpt || "연결된 대본 구절 없음"}</p><a href={item.image_url!} download className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-brand-olive"><Download size={11} /> 이미지 받기</a></div></div>)}</div> : <p className="mt-4 rounded-xl bg-muted/40 p-7 text-center text-sm text-muted-foreground">완성된 캐릭터 이미지가 없습니다.</p>}</section>
      </div>

      <aside className="space-y-5">
        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><FileText size={18} className="text-brand-olive" /><h2 className="font-bold">편집 메모</h2></div><textarea value={editNotes} onChange={(event) => setEditNotes(event.target.value)} placeholder="예: 첫 3초 확대, 12초에 캐릭터 등장, 배경음 -18dB…" className="mt-4 min-h-64 w-full resize-y rounded-xl border border-border bg-stone-50 p-3 text-sm leading-6 outline-none focus:border-brand-olive" /><button onClick={() => savePackage()} disabled={saving} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-olive px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} 메모 저장</button></section>
        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm"><h2 className="font-bold">내보내기</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">대용량 배경영상은 위 목록에서 개별 다운로드하고, 나머지 파일과 삽입 순서는 편집 목록으로 확인하세요.</p><div className="mt-4 space-y-2"><button onClick={downloadManifest} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-pink px-4 py-2.5 text-sm font-bold"><Download size={15} /> 편집 목록 TXT</button>{script && <button onClick={() => downloadText(`${safeFileName(projectTitle)}_대본.txt`, script)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold"><Download size={15} /> 확정 대본 TXT</button>}</div></section>
      </aside>
    </div>
  </div>;
}
