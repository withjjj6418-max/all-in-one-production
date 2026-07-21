"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Download, FileAudio, FolderOpen, Loader2, Play, Save, Search, Sparkles, Volume2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getProjectFolderHandle, saveProjectFolderHandle, writeBlobToFolder } from "@/lib/project-folder";

const AUDIO_BUCKET = "japan-longform-audio";
const CHUNK_LIMIT = 4500;

type Voice = {
  voice_id: string;
  name: string;
  category: string;
  description: string;
  preview_url: string;
  labels: Record<string, string>;
  verified_languages: Array<{ language?: string; locale?: string; accent?: string }>;
};

type Alignment = {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
};

type VoiceSettings = {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
  speed: number;
};

type Segment = {
  id: string;
  sort_order: number;
  text: string;
  audio_url: string | null;
  storage_path: string | null;
  audio_duration: number | null;
  alignment: Alignment;
  subtitle_srt: string;
  status: string;
};

type VoiceRun = {
  id: string;
  segment_count: number;
  total_duration: number;
  combined_audio_url: string | null;
  combined_storage_path: string | null;
  combined_subtitle_srt: string;
  created_at: string;
};

type WritableDirectoryHandle = FileSystemDirectoryHandle & {
  requestPermission: (options?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
};

function splitScript(script: string, maximum = CHUNK_LIMIT) {
  const chunks: string[] = [];
  let remaining = script.trim();
  while (remaining.length > maximum) {
    const sample = remaining.slice(0, maximum + 1);
    const candidates = [sample.lastIndexOf("\n\n"), sample.lastIndexOf("。"), sample.lastIndexOf("！"), sample.lastIndexOf("？"), sample.lastIndexOf("\n")];
    const best = Math.max(...candidates);
    const cut = best >= Math.floor(maximum * 0.55) ? best + (sample[best] === "\n" ? 1 : 1) : maximum;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function formatSrtTime(seconds: number) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const wholeSeconds = Math.floor((milliseconds % 60000) / 1000);
  const rest = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")},${String(rest).padStart(3, "0")}`;
}

function buildCombinedSrt(segments: Segment[]) {
  let offset = 0;
  let cueNumber = 1;
  const blocks: string[] = [];
  for (const segment of segments) {
    const characters = segment.alignment?.characters || [];
    const starts = segment.alignment?.character_start_times_seconds || [];
    const ends = segment.alignment?.character_end_times_seconds || [];
    let cueText = "";
    let cueStart = 0;
    let cueEnd = 0;
    for (let index = 0; index < characters.length; index += 1) {
      const character = characters[index] || "";
      if (!cueText) cueStart = Number(starts[index] || cueEnd);
      cueText += character;
      cueEnd = Number(ends[index] || starts[index] || cueEnd);
      if (/[。！？!?\n]/.test(character) || cueText.trim().length >= 28) {
        if (cueText.trim()) {
          blocks.push(`${cueNumber}\n${formatSrtTime(offset + cueStart)} --> ${formatSrtTime(offset + cueEnd)}\n${cueText.trim()}`);
          cueNumber += 1;
        }
        cueText = "";
      }
    }
    if (cueText.trim()) {
      blocks.push(`${cueNumber}\n${formatSrtTime(offset + cueStart)} --> ${formatSrtTime(offset + cueEnd)}\n${cueText.trim()}`);
      cueNumber += 1;
    }
    offset += Number(segment.audio_duration || ends.at(-1) || 0);
  }
  return blocks.join("\n\n");
}

function safeFileName(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "일본롱폼";
}

function formatDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const rest = rounded % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function JapanLongformVoicePage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const supabase = useMemo(() => createClient(), []);
  const [projectTitle, setProjectTitle] = useState("");
  const [script, setScript] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceSearch, setVoiceSearch] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [settings, setSettings] = useState<VoiceSettings>({ stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 });
  const [segments, setSegments] = useState<Segment[]>([]);
  const [latestRun, setLatestRun] = useState<VoiceRun | null>(null);
  const [projectFolder, setProjectFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [savingToFolder, setSavingToFolder] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "notice"; text: string } | null>(null);

  const chunks = useMemo(() => splitScript(script), [script]);
  const selectedVoice = voices.find((voice) => voice.voice_id === voiceId) || null;
  const filteredVoices = useMemo(() => {
    const query = voiceSearch.trim().toLocaleLowerCase();
    return voices.filter((voice) => {
      const labels = Object.values(voice.labels || {}).join(" ");
      const languages = (voice.verified_languages || []).map((item) => `${item.language || ""} ${item.locale || ""} ${item.accent || ""}`).join(" ");
      return !query || `${voice.name} ${voice.description} ${labels} ${languages}`.toLocaleLowerCase().includes(query);
    });
  }, [voiceSearch, voices]);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) { setMessage({ kind: "error", text: "로그인이 필요합니다." }); setLoading(false); return; }
      const [projectResult, scriptResult, settingsResult, segmentResult, runResult] = await Promise.all([
        supabase.from("projects").select("title").eq("id", projectId).eq("production_type", "longform_japan").maybeSingle(),
        supabase.from("japan_longform_scripts").select("verified_japanese").eq("project_id", projectId).maybeSingle(),
        supabase.from("japan_longform_voice_settings").select("voice_id, voice_settings").eq("project_id", projectId).maybeSingle(),
        supabase.from("japan_longform_voice_segments").select("id, sort_order, text, audio_url, storage_path, audio_duration, alignment, subtitle_srt, status").eq("project_id", projectId).order("sort_order"),
        supabase.from("japan_longform_voice_runs").select("id, segment_count, total_duration, combined_audio_url, combined_storage_path, combined_subtitle_srt, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (!active) return;
      setProjectTitle(projectResult.data?.title || "일본 롱폼 프로젝트");
      setScript(scriptResult.data?.verified_japanese || "");
      const savedVoiceSettings = settingsResult.data?.voice_settings as Partial<VoiceSettings> | null | undefined;
      setVoiceId(settingsResult.data?.voice_id || "");
      if (savedVoiceSettings) setSettings((current) => ({ ...current, ...savedVoiceSettings }));
      setSegments((segmentResult.data || []) as Segment[]);
      setLatestRun((runResult.data as VoiceRun | null) || null);
      if (projectResult.error || scriptResult.error) setMessage({ kind: "error", text: "TTS 작업 데이터를 불러오지 못했습니다." });
      try { setProjectFolder(await getProjectFolderHandle(projectId)); } catch { /* IndexedDB를 지원하지 않는 환경 */ }
      try {
        const response = await fetch("/api/elevenlabs/voices", { cache: "no-store" });
        const payload = await response.json() as { voices?: Voice[]; error?: string };
        if (!response.ok) setMessage({ kind: "error", text: payload.error || "ElevenLabs 목소리를 불러오지 못했습니다." });
        else {
          const loadedVoices = payload.voices || [];
          setVoices(loadedVoices);
          if (!settingsResult.data?.voice_id && loadedVoices.length) {
            const japanese = loadedVoices.find((voice) => voice.verified_languages?.some((item) => item.language === "ja" || item.locale?.startsWith("ja")));
            setVoiceId((japanese || loadedVoices[0]).voice_id);
          }
        }
      } catch { setMessage({ kind: "error", text: "ElevenLabs 연결에 실패했습니다." }); }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [projectId, supabase]);

  async function clearPreviousResults() {
    const paths = [...segments.map((segment) => segment.storage_path), latestRun?.combined_storage_path].filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from(AUDIO_BUCKET).remove(paths);
    await Promise.all([
      supabase.from("japan_longform_voice_runs").delete().eq("project_id", projectId),
      supabase.from("japan_longform_voice_segments").delete().eq("project_id", projectId),
    ]);
    setSegments([]);
    setLatestRun(null);
  }

  async function finalizeSegments(sourceSegments: Segment[]) {
    const audioParts: BlobPart[] = [];
    for (const segment of sourceSegments) {
      if (!segment.storage_path) throw new Error("생성된 구간 파일 경로가 없습니다.");
      const { data, error } = await supabase.storage.from(AUDIO_BUCKET).download(segment.storage_path);
      if (error || !data) throw new Error(`생성된 ${segment.sort_order + 1}번 구간 음성을 불러오지 못했습니다.${error?.message ? ` (${error.message})` : ""}`);
      audioParts.push(await data.arrayBuffer());
    }

    const combinedAudio = new Blob(audioParts, { type: "audio/mpeg" });
    const combinedSrt = buildCombinedSrt(sourceSegments);
    const totalDuration = sourceSegments.reduce((sum, segment) => sum + Number(segment.audio_duration || 0), 0);
    const response = await fetch("/api/elevenlabs/finalize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    const payload = await response.json() as { run?: VoiceRun; error?: string };
    if (!response.ok || !payload.run) {
      let folderSaved = false;
      if (projectFolder) {
        try {
          await saveFilesToFolder(projectFolder, combinedAudio, combinedSrt, false);
          folderSaved = true;
        } catch { /* 아래 오류에 저장 실패 내용을 함께 표시 */ }
      }
      const size = `${(combinedAudio.size / 1024 / 1024).toFixed(1)}MB`;
      throw new Error(`${payload.error || "최종 통합 음성을 클라우드에 저장하지 못했습니다."} (${size})${folderSaved ? " 다만 연결한 사운드 폴더에는 MP3와 SRT를 저장했습니다." : ""}`);
    }
    setLatestRun(payload.run);
    setMessage({ kind: "notice", text: `전체 TTS와 SRT를 만들었습니다. 총 길이 ${formatDuration(totalDuration)}` });
    if (projectFolder) {
      try {
        await saveFilesToFolder(projectFolder, combinedAudio, combinedSrt, false);
        setMessage({ kind: "notice", text: `전체 TTS와 SRT를 만들고 ${projectFolder.name} / 사운드 폴더에도 저장했습니다.` });
      } catch {
        setMessage({ kind: "notice", text: "전체 TTS와 SRT를 만들었습니다. 폴더 권한이 만료됐다면 아래 저장 버튼을 눌러주세요." });
      }
    }
  }

  async function retryFinalization() {
    if (!segments.length || finalizing) return;
    setFinalizing(true);
    setMessage({ kind: "notice", text: "이미 생성된 구간을 사용해 최종 MP3와 SRT를 다시 묶고 있습니다." });
    try {
      await finalizeSegments(segments);
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "최종 통합 중 오류가 발생했습니다." });
    } finally {
      setFinalizing(false);
    }
  }

  async function generateAll() {
    if (!script.trim()) return setMessage({ kind: "error", text: "먼저 최종 일본어 대본을 저장해주세요." });
    if (!selectedVoice) return setMessage({ kind: "error", text: "사용할 목소리를 선택해주세요." });
    if ((segments.length || latestRun) && !window.confirm("기존 TTS 결과를 지우고 현재 대본과 설정으로 다시 만들까요?")) return;
    setGenerating(true);
    setGenerationProgress(0);
    setMessage({ kind: "notice", text: `긴 대본을 ${chunks.length}개 구간으로 나눠 생성합니다.` });
    try {
      await clearPreviousResults();
      const created: Segment[] = [];
      for (let index = 0; index < chunks.length; index += 1) {
        const response = await fetch("/api/elevenlabs/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectId, text: chunks[index], voiceId, voiceName: selectedVoice.name, sortOrder: index, settings }),
        });
        const payload = await response.json() as { segment?: Segment; error?: string };
        if (!response.ok || !payload.segment) throw new Error(payload.error || `${index + 1}번 구간 생성에 실패했습니다.`);
        created.push(payload.segment);
        setSegments([...created]);
        setGenerationProgress(index + 1);
      }

      await finalizeSegments(created);
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "TTS 생성 중 오류가 발생했습니다." });
    } finally {
      setGenerating(false);
    }
  }

  async function connectProjectFolder() {
    try {
      const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
      if (!picker) throw new Error("이 브라우저는 폴더 연결을 지원하지 않습니다.");
      const handle = await picker({ id: `japan-longform-${projectId}`, mode: "readwrite" });
      await saveProjectFolderHandle(projectId, handle);
      setProjectFolder(handle);
      setMessage({ kind: "notice", text: `${handle.name} 폴더를 연결했습니다.` });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage({ kind: "error", text: "프로젝트 폴더를 연결하지 못했습니다. Chrome 또는 Edge에서 다시 시도해주세요." });
    }
  }

  async function saveFilesToFolder(folder: FileSystemDirectoryHandle, audio: Blob, srt: string, showSuccess = true) {
    const permission = await (folder as WritableDirectoryHandle).requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error("프로젝트 폴더 쓰기 권한이 필요합니다.");
    const soundFolder = await folder.getDirectoryHandle("사운드", { create: true });
    const name = safeFileName(projectTitle);
    await Promise.all([
      writeBlobToFolder(soundFolder, `${name}_최종TTS.mp3`, audio),
      writeBlobToFolder(soundFolder, `${name}_자막.srt`, new Blob(["\ufeff", srt], { type: "text/plain;charset=utf-8" })),
    ]);
    if (showSuccess) setMessage({ kind: "notice", text: `사운드 폴더에 ${name}_최종TTS.mp3와 SRT를 저장했습니다.` });
  }

  async function saveFinalToProjectFolder() {
    if (!projectFolder || !latestRun?.combined_storage_path) return;
    setSavingToFolder(true);
    try {
      const { data, error } = await supabase.storage.from(AUDIO_BUCKET).download(latestRun.combined_storage_path);
      if (error || !data) throw new Error("최종 음성을 내려받지 못했습니다.");
      await saveFilesToFolder(projectFolder, data, latestRun.combined_subtitle_srt);
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "폴더 저장에 실패했습니다." });
    } finally { setSavingToFolder(false); }
  }

  async function downloadFinalAudio() {
    if (!latestRun?.combined_storage_path) return;
    const { data, error } = await supabase.storage.from(AUDIO_BUCKET).download(latestRun.combined_storage_path);
    if (error || !data) return setMessage({ kind: "error", text: "최종 음성을 내려받지 못했습니다." });
    downloadBlob(`${safeFileName(projectTitle)}_최종TTS.mp3`, data);
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-sky-700" /></div>;

  return <div className="mx-auto max-w-7xl space-y-5">
    <Link href={`/studio/longform-japan/projects/${projectId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-sky-700"><ArrowLeft size={16} /> 워크벤치</Link>
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm font-bold text-sky-700">{projectTitle}</p><h1 className="mt-1 flex items-center gap-2 text-3xl font-bold"><FileAudio className="text-sky-700" /> 일본어 TTS · SRT</h1><p className="mt-2 text-sm text-muted-foreground">최종 일본어 대본을 한 목소리로 생성하고 전체 MP3와 자막을 함께 만듭니다.</p></div><button onClick={generateAll} disabled={generating || !script.trim() || !selectedVoice} className="inline-flex min-w-52 items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">{generating ? <><Loader2 size={16} className="animate-spin" /> {generationProgress}/{chunks.length} 생성 중</> : <><Sparkles size={16} /> 전체 TTS · SRT 만들기</>}</button></header>
    {message && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${message.kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{message.text}</div>}

    {!script.trim() ? <section className="rounded-2xl border border-border bg-white p-8 text-center shadow-sm"><p className="font-bold">저장된 최종 일본어 대본이 없습니다.</p><Link href={`/studio/longform-japan/projects/${projectId}/translate`} className="mt-4 inline-flex h-10 items-center rounded-xl bg-sky-700 px-4 text-sm font-bold text-white">대본 번역으로 이동</Link></section> : <>
      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center gap-2"><Volume2 size={19} className="text-sky-700" /><div><h2 className="font-bold">목소리 선택</h2><p className="mt-0.5 text-xs text-muted-foreground">ElevenLabs 계정에 저장된 목소리에서 선택합니다.</p></div></div><label className="mt-4 flex h-11 items-center gap-2 rounded-xl border border-border px-3 focus-within:border-sky-600"><Search size={15} className="text-muted-foreground" /><input value={voiceSearch} onChange={(event) => setVoiceSearch(event.target.value)} placeholder="이름, 성별, 억양, 언어 검색" className="min-w-0 flex-1 outline-none" /><span className="text-xs text-muted-foreground">{filteredVoices.length}</span></label><select value={voiceId} onChange={(event) => setVoiceId(event.target.value)} className="mt-3 h-12 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold"><option value="">목소리를 선택하세요</option>{filteredVoices.map((voice) => <option key={voice.voice_id} value={voice.voice_id}>{voice.name}{voice.labels?.gender ? ` · ${voice.labels.gender}` : ""}{voice.labels?.accent ? ` · ${voice.labels.accent}` : ""}</option>)}</select>{selectedVoice && <div className="mt-3 rounded-xl bg-sky-50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-sky-900">{selectedVoice.name}</p><p className="mt-1 text-xs leading-5 text-sky-800">{selectedVoice.description || Object.values(selectedVoice.labels || {}).join(" · ") || "목소리 설명 없음"}</p></div>{selectedVoice.preview_url && <audio controls src={selectedVoice.preview_url} className="h-9 max-w-full" />}</div></div>}</article>

        <article className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6"><h2 className="font-bold">음성 세부 설정</h2><p className="mt-1 text-xs text-muted-foreground">롱폼에 안정적인 Multilingual v2 모델을 사용합니다.</p><div className="mt-5 space-y-4">
          <SettingSlider label="안정성" value={settings.stability} minimum={0} maximum={1} step={0.05} onChange={(value) => setSettings((current) => ({ ...current, stability: value }))} />
          <SettingSlider label="유사도" value={settings.similarity_boost} minimum={0} maximum={1} step={0.05} onChange={(value) => setSettings((current) => ({ ...current, similarity_boost: value }))} />
          <SettingSlider label="스타일 강조" value={settings.style} minimum={0} maximum={1} step={0.05} onChange={(value) => setSettings((current) => ({ ...current, style: value }))} />
          <SettingSlider label="속도" value={settings.speed} minimum={0.7} maximum={1.2} step={0.05} suffix="x" onChange={(value) => setSettings((current) => ({ ...current, speed: value }))} />
          <label className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3 text-sm font-semibold">스피커 부스트<input type="checkbox" checked={settings.use_speaker_boost} onChange={(event) => setSettings((current) => ({ ...current, use_speaker_boost: event.target.checked }))} className="h-4 w-4 accent-sky-700" /></label>
        </div></article>
      </section>

      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-bold">생성할 최종 일본어 대본</h2><p className="mt-1 text-xs text-muted-foreground">{script.length.toLocaleString()}자 · 자동 분할 {chunks.length}구간 · 구간당 최대 {CHUNK_LIMIT.toLocaleString()}자</p></div><Link href={`/studio/longform-japan/projects/${projectId}/translate`} className="text-xs font-bold text-sky-700">번역 대본 수정</Link></div><div className="mt-4 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-stone-50 p-4 text-sm leading-7">{script}</div></section>

      {segments.length > 0 && <section className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center justify-between"><div><h2 className="font-bold">생성 구간 미리듣기</h2><p className="mt-1 text-xs text-muted-foreground">긴 대본을 나눈 내부 구간입니다. 최종 파일에서는 이어집니다.</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{segments.length}구간</span></div><div className="mt-4 space-y-3">{segments.map((segment, index) => <article key={segment.id} className="rounded-xl border border-border p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-xs font-bold text-sky-700">{index + 1}</span><p className="line-clamp-2 min-w-0 flex-1 text-xs leading-5 text-muted-foreground">{segment.text}</p><span className="text-xs font-bold text-muted-foreground">{formatDuration(Number(segment.audio_duration || 0))}</span><audio controls src={segment.audio_url || undefined} className="h-9 max-w-full lg:w-80" /></div></article>)}</div></section>}

      <section className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${latestRun ? "border-emerald-200 bg-emerald-50" : "border-border bg-white"}`}><div className="flex flex-col gap-4 lg:flex-row lg:items-center"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${latestRun ? "bg-white text-emerald-700" : "bg-sky-50 text-sky-700"}`}>{latestRun ? <Check size={20} /> : <Play size={20} />}</div><div className="min-w-0 flex-1"><h2 className="font-bold">최종 통합 TTS · SRT</h2><p className="mt-1 text-xs text-muted-foreground">{latestRun ? `${latestRun.segment_count}개 구간 · ${formatDuration(Number(latestRun.total_duration))} · 전체 파일 생성 완료` : segments.length ? "구간 음성은 보존되어 있습니다. API를 다시 사용하지 않고 최종 통합만 재시도할 수 있습니다." : "전체 생성이 끝나면 이어 듣기와 다운로드가 열립니다."}</p></div>{!latestRun && segments.length > 0 && <button onClick={retryFinalization} disabled={finalizing || generating} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">{finalizing ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} 최종 통합만 다시 시도</button>}{latestRun && <div className="flex flex-wrap gap-2"><button onClick={downloadFinalAudio} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-800"><Download size={13} /> MP3</button><button onClick={() => downloadBlob(`${safeFileName(projectTitle)}_자막.srt`, new Blob(["\ufeff", latestRun.combined_subtitle_srt], { type: "text/plain;charset=utf-8" }))} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white"><Download size={13} /> SRT</button></div>}</div>{latestRun?.combined_audio_url && <audio controls src={latestRun.combined_audio_url} className="mt-4 h-10 w-full" />}
        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-dashed border-border bg-white/80 p-4 sm:flex-row sm:items-center"><FolderOpen size={18} className="shrink-0 text-sky-700" /><div className="min-w-0 flex-1"><p className="text-sm font-bold">프로젝트 폴더의 사운드 폴더</p><p className="mt-1 truncate text-xs text-muted-foreground">{projectFolder ? `${projectFolder.name} / 사운드에 MP3와 SRT 저장` : "프로젝트 폴더를 한 번 연결하면 다음에도 기억합니다."}</p></div><button onClick={connectProjectFolder} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold"><FolderOpen size={13} /> {projectFolder ? "폴더 변경" : "폴더 연결"}</button><button onClick={saveFinalToProjectFolder} disabled={!projectFolder || !latestRun || savingToFolder} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{savingToFolder ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} 사운드 폴더에 저장</button></div>
      </section>
      {latestRun && <Link href={`/studio/longform-japan/projects/${projectId}/image`} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 text-sm font-bold text-white">이미지 제작으로 <ArrowRight size={16} /></Link>}
    </>}
  </div>;
}

function SettingSlider({ label, value, minimum, maximum, step, suffix = "", onChange }: { label: string; value: number; minimum: number; maximum: number; step: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="block text-xs font-bold text-muted-foreground"><span className="flex items-center justify-between"><span>{label}</span><span className="text-foreground">{value.toFixed(2)}{suffix}</span></span><input type="range" min={minimum} max={maximum} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full accent-sky-700" /></label>;
}
