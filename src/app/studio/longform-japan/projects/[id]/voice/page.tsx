"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Download, FileAudio, FolderOpen, Loader2, Pause, Play, Plus, RefreshCw, Save, Search, Sparkles, Trash2, Volume2, WandSparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getProjectFolderHandle, saveProjectFolderHandle, writeBlobToFolder } from "@/lib/project-folder";

const AUDIO_BUCKET = "japan-longform-audio";
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
  section_kind: "opening" | "body" | "outro";
  section_title: string;
  text: string;
  audio_url: string | null;
  storage_path: string | null;
  audio_duration: number | null;
  alignment: Alignment;
  subtitle_srt: string;
  status: "todo" | "generated" | "error";
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

function formatSrtTime(seconds: number) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const wholeSeconds = Math.floor((milliseconds % 60000) / 1000);
  const rest = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")},${String(rest).padStart(3, "0")}`;
}

// 이전 정렬문자 기반 생성기는 과거 데이터 비교용으로 남겨둔다.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildCombinedSrtLegacy(segments: Segment[]) {
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

function asWindowsSrt(srt: string) {
  return srt.replace(/\r?\n/g, "\r\n");
}

function encodeWav(buffers: AudioBuffer[]) {
  if (!buffers.length) throw new Error("WAV로 합칠 음성 구간이 없습니다.");
  const sampleRate = buffers[0].sampleRate;
  const channelCount = Math.min(2, Math.max(...buffers.map((buffer) => buffer.numberOfChannels)));
  if (buffers.some((buffer) => buffer.sampleRate !== sampleRate)) throw new Error("음성 구간의 샘플레이트가 서로 다릅니다.");
  const totalFrames = buffers.reduce((sum, buffer) => sum + buffer.length, 0);
  const bytesPerSample = 2;
  const dataSize = totalFrames * channelCount * bytesPerSample;
  const output = new ArrayBuffer(44 + dataSize);
  const view = new DataView(output);
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (const buffer of buffers) {
    const channels = Array.from({ length: channelCount }, (_, channel) => buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1)));
    for (let frame = 0; frame < buffer.length; frame += 1) {
      for (let channel = 0; channel < channelCount; channel += 1) {
        const sample = Math.max(-1, Math.min(1, channels[channel][frame] || 0));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += bytesPerSample;
      }
    }
  }
  return new Blob([output], { type: "audio/wav" });
}

export default function JapanLongformVoicePage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [script, setScript] = useState("");
  const [scriptSnapshot, setScriptSnapshot] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceSearch, setVoiceSearch] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [savedVoiceName, setSavedVoiceName] = useState("");
  const [settings, setSettings] = useState<VoiceSettings>({ stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 });
  const [segments, setSegments] = useState<Segment[]>([]);
  const [latestRun, setLatestRun] = useState<VoiceRun | null>(null);
  const [finalAudioBlob, setFinalAudioBlob] = useState<Blob | null>(null);
  const [finalAudioUrl, setFinalAudioUrl] = useState("");
  const [projectFolder, setProjectFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingSegmentId, setGeneratingSegmentId] = useState("");
  const [finalizing, setFinalizing] = useState(false);
  const [generatingSrt, setGeneratingSrt] = useState(false);
  const [continuousIndex, setContinuousIndex] = useState(0);
  const [continuousPlaying, setContinuousPlaying] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [savingToFolder, setSavingToFolder] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "notice"; text: string } | null>(null);
  const continuousAudioRef = useRef<HTMLAudioElement | null>(null);

  const normalizedScript = script.replace(/\s/g, "");
  const normalizedSections = segments.map((segment) => segment.text).join("").replace(/\s/g, "");
  const sectionsMatchScript = Boolean(segments.length && normalizedScript === (scriptSnapshot ? scriptSnapshot.replace(/\s/g, "") : normalizedSections));
  const pendingGenerationCount = segments.filter((segment) => segment.status !== "generated" || !segment.audio_url).length;
  const continuousAudioUrl = segments[continuousIndex]?.audio_url || "";
  const listedSelectedVoice = voices.find((voice) => voice.voice_id === voiceId) || null;
  const selectedVoice: Voice | null = listedSelectedVoice || (voiceId ? {
    voice_id: voiceId,
    name: savedVoiceName || "저장된 목소리",
    category: "saved",
    description: "이 프로젝트에 저장된 ElevenLabs 목소리",
    preview_url: "",
    labels: {},
    verified_languages: [],
  } : null);
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
      setUserId(user.id);
      const [projectResult, scriptResult, settingsResult, segmentResult, runResult] = await Promise.all([
        supabase.from("projects").select("title").eq("id", projectId).eq("production_type", "longform_japan").maybeSingle(),
        supabase.from("japan_longform_scripts").select("verified_japanese").eq("project_id", projectId).maybeSingle(),
        supabase.from("japan_longform_voice_settings").select("voice_id, voice_name, voice_settings, script_snapshot").eq("project_id", projectId).maybeSingle(),
        supabase.from("japan_longform_voice_segments").select("id, sort_order, section_kind, section_title, text, audio_url, storage_path, audio_duration, alignment, subtitle_srt, status").eq("project_id", projectId).order("sort_order"),
        supabase.from("japan_longform_voice_runs").select("id, segment_count, total_duration, combined_audio_url, combined_storage_path, combined_subtitle_srt, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (!active) return;
      setProjectTitle(projectResult.data?.title || "일본 롱폼 프로젝트");
      setScript(scriptResult.data?.verified_japanese || "");
      const savedVoiceSettings = settingsResult.data?.voice_settings as Partial<VoiceSettings> | null | undefined;
      setVoiceId(settingsResult.data?.voice_id || "");
      setSavedVoiceName(settingsResult.data?.voice_name || "");
      setScriptSnapshot(settingsResult.data?.script_snapshot || "");
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

  useEffect(() => {
    if (!continuousPlaying || !continuousAudioUrl) return;
    const audio = continuousAudioRef.current;
    if (!audio) return;
    audio.src = continuousAudioUrl;
    audio.currentTime = 0;
    audio.play().catch(() => {
      setContinuousPlaying(false);
      setMessage({ kind: "error", text: "전체 이어듣기를 시작하지 못했습니다." });
    });
  }, [continuousAudioUrl, continuousPlaying]);

  async function clearPreviousResults() {
    stopContinuousPreview();
    const paths = [...segments.map((segment) => segment.storage_path), latestRun?.combined_storage_path].filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from(AUDIO_BUCKET).remove(paths);
    await Promise.all([
      supabase.from("japan_longform_voice_runs").delete().eq("project_id", projectId),
      supabase.from("japan_longform_voice_segments").delete().eq("project_id", projectId),
    ]);
    setSegments([]);
    setLatestRun(null);
    setFinalAudioBlob(null);
    setFinalAudioUrl((current) => { if (current) URL.revokeObjectURL(current); return ""; });
  }

  async function invalidateFinalResult() {
    if (latestRun?.combined_storage_path) await supabase.storage.from(AUDIO_BUCKET).remove([latestRun.combined_storage_path]);
    await supabase.from("japan_longform_voice_runs").delete().eq("project_id", projectId);
    setLatestRun(null);
    setFinalAudioBlob(null);
    setFinalAudioUrl((current) => { if (current) URL.revokeObjectURL(current); return ""; });
  }

  async function analyzeScriptSections() {
    if (!script.trim() || analyzing) return;
    if (segments.length && !window.confirm("현재 TTS 구간과 음성을 지우고 수정된 최종 대본을 AI로 다시 나눌까요?")) return;
    setAnalyzing(true);
    setMessage({ kind: "notice", text: "AI가 오프닝·이야기 전환점·아웃트로를 분석하고 있습니다." });
    try {
      const response = await fetch("/api/elevenlabs/segment-script", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const payload = await response.json() as { sections?: Array<Pick<Segment, "sort_order" | "section_kind" | "section_title" | "text">>; error?: string };
      if (!response.ok || !payload.sections?.length) throw new Error(payload.error || "AI가 구간을 만들지 못했습니다.");
      await clearPreviousResults();
      const { data, error } = await supabase.from("japan_longform_voice_segments").insert(payload.sections.map((section) => ({
        project_id: projectId,
        user_id: userId,
        ...section,
        status: "todo",
      }))).select("id, sort_order, section_kind, section_title, text, audio_url, storage_path, audio_duration, alignment, subtitle_srt, status").order("sort_order");
      if (error || !data) throw new Error(error?.message || "분석한 구간을 저장하지 못했습니다. 구간 마이그레이션을 확인해주세요.");
      const { error: snapshotError } = await supabase.from("japan_longform_voice_settings").upsert({
        project_id: projectId,
        user_id: userId,
        script_snapshot: script,
        updated_at: new Date().toISOString(),
      }, { onConflict: "project_id" });
      if (snapshotError) throw new Error(`대본 기준점을 저장하지 못했습니다. (${snapshotError.message})`);
      setSegments(data as Segment[]);
      setScriptSnapshot(script);
      setMessage({ kind: "notice", text: `${data.length}개 내용 구간으로 나눴습니다. 제목과 경계를 확인한 뒤 전체 또는 구간별로 생성하세요.` });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "AI 구간 분석 중 오류가 발생했습니다." });
    } finally {
      setAnalyzing(false);
    }
  }

  async function updateSection(segment: Segment, values: Partial<Pick<Segment, "section_kind" | "section_title" | "text">>) {
    if (typeof values.text === "string") stopContinuousPreview();
    const textChanged = typeof values.text === "string" && (segment.status === "todo" || values.text !== segment.text);
    const next = { ...segment, ...values, ...(textChanged ? { status: "todo" as const } : {}) };
    setSegments((current) => current.map((item) => item.id === segment.id ? next : item));
    const { error } = await supabase.from("japan_longform_voice_segments").update({
      ...values,
      ...(textChanged ? { status: "todo" } : {}),
      updated_at: new Date().toISOString(),
    }).eq("id", segment.id).eq("project_id", projectId);
    if (error) setMessage({ kind: "error", text: `구간 저장에 실패했습니다. (${error.message})` });
    else if (textChanged) await invalidateFinalResult();
  }

  async function persistSectionOrder(next: Segment[]) {
    stopContinuousPreview();
    setSegments(next.map((segment, index) => ({ ...segment, sort_order: index })));
    const results = await Promise.all(next.map((segment, index) => supabase.from("japan_longform_voice_segments").update({ sort_order: index, updated_at: new Date().toISOString() }).eq("id", segment.id)));
    if (results.some((result) => result.error)) setMessage({ kind: "error", text: "구간 순서를 저장하지 못했습니다." });
    await invalidateFinalResult();
  }

  async function moveSection(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= segments.length) return;
    const next = [...segments];
    [next[index], next[target]] = [next[target], next[index]];
    await persistSectionOrder(next);
  }

  async function addSection(afterIndex: number) {
    if (!userId) return;
    const { data, error } = await supabase.from("japan_longform_voice_segments").insert({
      project_id: projectId,
      user_id: userId,
      sort_order: 999999,
      section_kind: "body",
      section_title: "新しい区間",
      text: "",
      status: "todo",
    }).select("id, sort_order, section_kind, section_title, text, audio_url, storage_path, audio_duration, alignment, subtitle_srt, status").single();
    if (error || !data) return setMessage({ kind: "error", text: "새 구간을 추가하지 못했습니다." });
    const next = [...segments];
    next.splice(afterIndex + 1, 0, data as Segment);
    await persistSectionOrder(next);
  }

  async function deleteSection(segment: Segment) {
    if (!window.confirm(`“${segment.section_title || "이 구간"}”을 삭제할까요?`)) return;
    if (segment.storage_path) await supabase.storage.from(AUDIO_BUCKET).remove([segment.storage_path]);
    const { error } = await supabase.from("japan_longform_voice_segments").delete().eq("id", segment.id);
    if (error) return setMessage({ kind: "error", text: "구간을 삭제하지 못했습니다." });
    await persistSectionOrder(segments.filter((item) => item.id !== segment.id));
  }

  async function generateOneSection(segment: Segment, currentSegments = segments) {
    if (!selectedVoice) throw new Error("사용할 목소리를 선택해주세요.");
    if (!segment.text.trim()) throw new Error("구간 대본을 입력해주세요.");
    if (segment.text.length > 4500) throw new Error("구간 대본은 4,500자를 넘을 수 없습니다. 구간을 나눠주세요.");
    const index = currentSegments.findIndex((item) => item.id === segment.id);
    const response = await fetch("/api/elevenlabs/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId,
        segmentId: segment.id,
        text: segment.text,
        voiceId,
        voiceName: selectedVoice.name,
        sortOrder: index,
        previousText: currentSegments[index - 1]?.text || "",
        nextText: currentSegments[index + 1]?.text || "",
        settings,
      }),
    });
    const payload = await response.json() as { segment?: Segment; error?: string };
    if (!response.ok || !payload.segment) throw new Error(payload.error || `${index + 1}번 구간 생성에 실패했습니다.`);
    return payload.segment;
  }

  async function regenerateSection(segment: Segment) {
    if (generating || generatingSegmentId) return;
    stopContinuousPreview();
    setGeneratingSegmentId(segment.id);
    setMessage(null);
    try {
      await invalidateFinalResult();
      const generated = await generateOneSection(segment);
      setSegments((current) => current.map((item) => item.id === segment.id ? generated : item));
      setMessage({ kind: "notice", text: `${segment.section_title || "구간"} 음성을 생성했습니다.` });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "구간 생성에 실패했습니다." });
    } finally {
      setGeneratingSegmentId("");
    }
  }

  function startContinuousPreview() {
    if (!segments.length) return setMessage({ kind: "error", text: "재생할 구간이 없습니다." });
    if (pendingGenerationCount > 0) return setMessage({ kind: "error", text: `이어듣기 전에 ${pendingGenerationCount}개 구간을 생성하거나 재생성해주세요.` });
    setContinuousIndex(0);
    setContinuousPlaying(true);
  }

  function stopContinuousPreview() {
    continuousAudioRef.current?.pause();
    setContinuousPlaying(false);
  }

  function handleContinuousEnded() {
    if (continuousIndex < segments.length - 1) setContinuousIndex((current) => current + 1);
    else {
      setContinuousPlaying(false);
      setContinuousIndex(0);
    }
  }

  async function combineSegmentAudio(sourceSegments: Segment[]) {
    const audioContext = new AudioContext({ sampleRate: 48000 });
    const decodedBuffers: AudioBuffer[] = [];
    try {
      for (const segment of sourceSegments) {
        if (!segment.storage_path) throw new Error("생성된 구간 파일 경로가 없습니다.");
        const { data, error } = await supabase.storage.from(AUDIO_BUCKET).download(segment.storage_path);
        if (error || !data) throw new Error(`생성된 ${segment.sort_order + 1}번 구간 음성을 불러오지 못했습니다.${error?.message ? ` (${error.message})` : ""}`);
        decodedBuffers.push(await audioContext.decodeAudioData(await data.arrayBuffer()));
      }
      return encodeWav(decodedBuffers);
    } finally {
      await audioContext.close();
    }
  }

  async function finalizeSegments(sourceSegments: Segment[]) {
    if (!projectFolder) throw new Error("최종 WAV와 SRT를 저장할 프로젝트 폴더를 먼저 연결해주세요.");
    if (!sectionsMatchScript) throw new Error("최종 일본어 대본과 현재 구간이 다릅니다. AI 구간 나누기를 다시 실행해주세요.");
    if (sourceSegments.some((segment) => segment.status !== "generated" || !segment.audio_url)) throw new Error("아직 생성하지 않았거나 수정된 구간이 있습니다.");
    const combinedAudio = await combineSegmentAudio(sourceSegments);
    const totalDuration = sourceSegments.reduce((sum, segment) => sum + Number(segment.audio_duration || 0), 0);
    const response = await fetch("/api/elevenlabs/finalize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    const payload = await response.json() as { run?: VoiceRun; error?: string };
    if (!response.ok || !payload.run) {
      throw new Error(payload.error || "최종 완료 기록을 저장하지 못했습니다.");
    }
    const japaneseSrt = await requestAiJapaneseSrt();
    await saveFilesToFolder(projectFolder, combinedAudio, japaneseSrt, false);
    setLatestRun({ ...payload.run, combined_subtitle_srt: japaneseSrt });
    setFinalAudioBlob(combinedAudio);
    setFinalAudioUrl((current) => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(combinedAudio); });
    setMessage({ kind: "notice", text: `전체 TTS와 SRT를 ${projectFolder.name} / 사운드 폴더에 저장했습니다. 총 길이 ${formatDuration(totalDuration)}` });
  }

  async function requestAiJapaneseSrt() {
    setGeneratingSrt(true);
    try {
      const response = await fetch("/api/elevenlabs/subtitles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const payload = await response.json() as { srt?: string; error?: string };
      if (!response.ok || !payload.srt) throw new Error(payload.error || "AI 일본어 SRT를 만들지 못했습니다.");
      setLatestRun((current) => current ? { ...current, combined_subtitle_srt: payload.srt! } : current);
      return payload.srt;
    } finally {
      setGeneratingSrt(false);
    }
  }

  async function downloadAiJapaneseSrt() {
    try {
      const japaneseSrt = await requestAiJapaneseSrt();
      const cueCount = japaneseSrt.split(/\n\n+/).filter(Boolean).length;
      downloadBlob(`${safeFileName(projectTitle)}_AI3-4줄_자막.srt`, new Blob(["\ufeff", asWindowsSrt(japaneseSrt)], { type: "text/plain;charset=utf-8" }));
      setMessage({ kind: "notice", text: `긴 쉼을 기준으로 3~4줄씩 묶은 일본어 자막 ${cueCount}개를 저장했습니다.` });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "AI 일본어 SRT 생성에 실패했습니다." });
    }
  }

  async function retryFinalization() {
    if (!segments.length || finalizing) return;
    setFinalizing(true);
    setMessage({ kind: "notice", text: "이미 생성된 구간을 디코딩해 Premiere용 최종 WAV와 SRT로 다시 묶고 있습니다." });
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
    if (!projectFolder) return setMessage({ kind: "error", text: "최종 결과를 저장할 프로젝트 폴더를 먼저 연결해주세요." });
    if (!segments.length) return setMessage({ kind: "error", text: "먼저 AI로 최종 대본을 내용 구간으로 나눠주세요." });
    if (!sectionsMatchScript) return setMessage({ kind: "error", text: "최종 일본어 대본이 구간을 만든 뒤 변경됐습니다. AI 구간 나누기를 다시 실행해주세요." });
    let targets = segments.filter((segment) => segment.status !== "generated" || !segment.audio_url);
    if (!targets.length) {
      if (!window.confirm("모든 구간 음성이 이미 있습니다. 전체 구간을 다시 생성하면 ElevenLabs 사용량이 차감됩니다. 계속할까요?")) return;
      targets = [...segments];
    }
    setGenerating(true);
    setGenerationProgress(0);
    setMessage({ kind: "notice", text: `${targets.length}개 구간의 음성을 순서대로 생성합니다.` });
    try {
      await invalidateFinalResult();
      let current = [...segments];
      for (let index = 0; index < targets.length; index += 1) {
        const target = current.find((segment) => segment.id === targets[index].id) || targets[index];
        const generated = await generateOneSection(target, current);
        current = current.map((segment) => segment.id === generated.id ? generated : segment);
        setSegments(current);
        setGenerationProgress(index + 1);
      }
      setMessage({ kind: "notice", text: `${targets.length}개 구간을 생성했습니다. 구간별로 들어본 뒤 최종 WAV·SRT를 저장하세요.` });
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
      writeBlobToFolder(soundFolder, `${name}_최종TTS.wav`, audio),
      writeBlobToFolder(soundFolder, `${name}_AI3-4줄_자막.srt`, new Blob(["\ufeff", asWindowsSrt(srt)], { type: "text/plain;charset=utf-8" })),
    ]);
    if (showSuccess) setMessage({ kind: "notice", text: `사운드 폴더에 Premiere용 ${name}_최종TTS.wav와 SRT를 저장했습니다.` });
  }

  async function saveFinalToProjectFolder() {
    if (!projectFolder || !latestRun) return;
    setSavingToFolder(true);
    try {
      const audio = finalAudioBlob || await combineSegmentAudio(segments);
      const japaneseSrt = await requestAiJapaneseSrt();
      await saveFilesToFolder(projectFolder, audio, japaneseSrt);
      if (!finalAudioBlob) {
        setFinalAudioBlob(audio);
        setFinalAudioUrl((current) => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(audio); });
      }
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "폴더 저장에 실패했습니다." });
    } finally { setSavingToFolder(false); }
  }

  async function downloadFinalAudio() {
    try {
      const audio = finalAudioBlob || await combineSegmentAudio(segments);
      downloadBlob(`${safeFileName(projectTitle)}_최종TTS.wav`, audio);
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "최종 음성을 내려받지 못했습니다." });
    }
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-sky-700" /></div>;

  return <div className="mx-auto max-w-7xl space-y-5">
    <Link href={`/studio/longform-japan/projects/${projectId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-sky-700"><ArrowLeft size={16} /> 워크벤치</Link>
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm font-bold text-sky-700">{projectTitle}</p><h1 className="mt-1 flex items-center gap-2 text-3xl font-bold"><FileAudio className="text-sky-700" /> 일본어 TTS · SRT</h1><p className="mt-2 text-sm text-muted-foreground">구간별 MP3를 검수한 뒤 Premiere가 전체 길이를 정확히 읽는 48kHz WAV와 자막으로 통합합니다.</p></div><div className="flex flex-wrap gap-2"><button onClick={analyzeScriptSections} disabled={analyzing || generating || !script.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-700 bg-white px-4 py-3 text-sm font-bold text-sky-700 disabled:opacity-40">{analyzing ? <Loader2 size={16} className="animate-spin" /> : <WandSparkles size={16} />} AI 구간 나누기</button><button onClick={generateAll} disabled={generating || analyzing || !script.trim() || !selectedVoice} className="inline-flex min-w-52 items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">{generating ? <><Loader2 size={16} className="animate-spin" /> {generationProgress}개 생성 중</> : <><Sparkles size={16} /> {pendingGenerationCount ? `변경 구간 전체 생성 (${pendingGenerationCount})` : "전체 구간 다시 생성"}</>}</button></div></header>
    {message && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${message.kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{message.text}</div>}

    {!script.trim() ? <section className="rounded-2xl border border-border bg-white p-8 text-center shadow-sm"><p className="font-bold">저장된 최종 일본어 대본이 없습니다.</p><Link href={`/studio/longform-japan/projects/${projectId}/translate`} className="mt-4 inline-flex h-10 items-center rounded-xl bg-sky-700 px-4 text-sm font-bold text-white">대본 번역으로 이동</Link></section> : <>
      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center gap-2"><Volume2 size={19} className="text-sky-700" /><div><h2 className="font-bold">목소리 선택</h2><p className="mt-0.5 text-xs text-muted-foreground">ElevenLabs 계정에 저장된 목소리에서 선택합니다.</p></div></div><label className="mt-4 flex h-11 items-center gap-2 rounded-xl border border-border px-3 focus-within:border-sky-600"><Search size={15} className="text-muted-foreground" /><input value={voiceSearch} onChange={(event) => setVoiceSearch(event.target.value)} placeholder="이름, 성별, 억양, 언어 검색" className="min-w-0 flex-1 outline-none" /><span className="text-xs text-muted-foreground">{filteredVoices.length}</span></label><select value={voiceId} onChange={(event) => { const nextId = event.target.value; setVoiceId(nextId); setSavedVoiceName(voices.find((voice) => voice.voice_id === nextId)?.name || ""); }} className="mt-3 h-12 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold"><option value="">목소리를 선택하세요</option>{selectedVoice && !filteredVoices.some((voice) => voice.voice_id === selectedVoice.voice_id) && <option value={selectedVoice.voice_id}>{selectedVoice.name} · 프로젝트 저장 목소리</option>}{filteredVoices.map((voice) => <option key={voice.voice_id} value={voice.voice_id}>{voice.name}{voice.labels?.gender ? ` · ${voice.labels.gender}` : ""}{voice.labels?.accent ? ` · ${voice.labels.accent}` : ""}</option>)}</select>{selectedVoice && <div className="mt-3 rounded-xl bg-sky-50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-sky-900">{selectedVoice.name}</p><p className="mt-1 text-xs leading-5 text-sky-800">{selectedVoice.description || Object.values(selectedVoice.labels || {}).join(" · ") || "목소리 설명 없음"}</p></div>{selectedVoice.preview_url && <audio controls src={selectedVoice.preview_url} className="h-9 max-w-full" />}</div></div>}</article>

        <article className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6"><h2 className="font-bold">음성 세부 설정</h2><p className="mt-1 text-xs text-muted-foreground">롱폼에 안정적인 Multilingual v2 모델을 사용합니다.</p><div className="mt-5 space-y-4">
          <SettingSlider label="안정성" value={settings.stability} minimum={0} maximum={1} step={0.05} onChange={(value) => setSettings((current) => ({ ...current, stability: value }))} />
          <SettingSlider label="유사도" value={settings.similarity_boost} minimum={0} maximum={1} step={0.05} onChange={(value) => setSettings((current) => ({ ...current, similarity_boost: value }))} />
          <SettingSlider label="스타일 강조" value={settings.style} minimum={0} maximum={1} step={0.05} onChange={(value) => setSettings((current) => ({ ...current, style: value }))} />
          <SettingSlider label="속도" value={settings.speed} minimum={0.7} maximum={1.2} step={0.05} suffix="x" onChange={(value) => setSettings((current) => ({ ...current, speed: value }))} />
          <label className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3 text-sm font-semibold">스피커 부스트<input type="checkbox" checked={settings.use_speaker_boost} onChange={(event) => setSettings((current) => ({ ...current, use_speaker_boost: event.target.checked }))} className="h-4 w-4 accent-sky-700" /></label>
        </div></article>
      </section>

      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-bold">최종 일본어 대본 · 내용 구간</h2><p className="mt-1 text-xs text-muted-foreground">{script.length.toLocaleString()}자 · {segments.length ? `${segments.length}개 내용 구간` : "아직 구간을 만들지 않음"} · 구간당 최대 4,500자</p></div><div className="flex gap-2"><Link href={`/studio/longform-japan/projects/${projectId}/translate`} className="inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-bold">번역 대본 수정</Link><button onClick={analyzeScriptSections} disabled={analyzing || generating} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{analyzing ? <Loader2 size={13} className="animate-spin" /> : <WandSparkles size={13} />} {segments.length ? "AI로 다시 나누기" : "AI로 구간 나누기"}</button></div></div>{segments.length > 0 && !sectionsMatchScript && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">최종 일본어 대본이 구간 생성 후 변경됐습니다. 현재 대본을 기준으로 AI 구간 나누기를 다시 실행해주세요.</div>}<div className="mt-4 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-stone-50 p-4 text-sm leading-7">{script}</div></section>

      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold">내용별 TTS 구간</h2><p className="mt-1 text-xs text-muted-foreground">수정된 구간만 다시 생성할 수 있으며 앞뒤 구간을 문맥으로 함께 전달합니다.</p></div><div className="flex items-center gap-2"><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">생성 필요 {pendingGenerationCount}</span><button onClick={() => addSection(segments.length - 1)} disabled={analyzing || generating} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold"><Plus size={13} /> 구간 추가</button></div></div>
        {segments.length ? <div className="mt-5 space-y-2">{segments.map((segment, index) => {
          const generated = segment.status === "generated" && Boolean(segment.audio_url);
          const tooLong = segment.text.length > 4500;
          const kindLabel = segment.section_kind === "opening" ? "오프닝" : segment.section_kind === "outro" ? "아웃트로" : `본문 ${index}`;
          return <div key={segment.id}><article className={`rounded-xl border p-4 ${generated ? "border-emerald-200" : "border-amber-200"}`}><div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-xs font-bold text-sky-700">{index + 1}</span><div className="min-w-0 flex-1"><div className="grid gap-2 sm:grid-cols-[120px_1fr_auto]"><select value={segment.section_kind} onChange={(event) => updateSection(segment, { section_kind: event.target.value as Segment["section_kind"] })} className="h-10 rounded-lg border border-border bg-white px-2 text-xs font-bold"><option value="opening">오프닝</option><option value="body">본문</option><option value="outro">아웃트로</option></select><input value={segment.section_title} onChange={(event) => setSegments((current) => current.map((item) => item.id === segment.id ? { ...item, section_title: event.target.value } : item))} onBlur={(event) => updateSection(segment, { section_title: event.target.value })} placeholder="구간 제목" className="h-10 min-w-0 rounded-lg border border-border px-3 text-sm font-bold outline-none focus:border-sky-600" /><span className={`self-center text-xs font-bold ${generated ? "text-emerald-700" : "text-amber-700"}`}>{kindLabel} · {generated ? "생성 완료" : "생성 필요"}</span></div><textarea value={segment.text} onChange={(event) => setSegments((current) => current.map((item) => item.id === segment.id ? { ...item, text: event.target.value, status: "todo" } : item))} onBlur={(event) => updateSection(segment, { text: event.target.value })} className={`mt-3 min-h-36 w-full resize-y rounded-xl border bg-stone-50 p-3 text-sm leading-7 outline-none focus:border-sky-600 ${tooLong ? "border-red-400" : "border-border"}`} />
          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center"><p className={`text-xs font-semibold ${tooLong ? "text-red-600" : "text-muted-foreground"}`}>{segment.text.length.toLocaleString()}자{tooLong ? " · 4,500자를 넘었습니다. 구간을 나눠주세요." : generated ? ` · ${formatDuration(Number(segment.audio_duration || 0))}` : ""}</p>{segment.audio_url && <audio controls src={segment.audio_url} className="h-9 min-w-0 flex-1" />}<button onClick={() => regenerateSection(segment)} disabled={generating || Boolean(generatingSegmentId) || !segment.text.trim() || tooLong} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{generatingSegmentId === segment.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} {generated ? "이 구간 재생성" : "이 구간 생성"}</button></div></div><div className="flex flex-col gap-1"><button onClick={() => moveSection(index, -1)} disabled={index === 0 || generating} className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-25"><ArrowUp size={14} /></button><button onClick={() => moveSection(index, 1)} disabled={index === segments.length - 1 || generating} className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-25"><ArrowDown size={14} /></button><button onClick={() => deleteSection(segment)} disabled={generating} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button></div></div></article><div className="flex items-center gap-2 py-2"><div className="h-px flex-1 bg-border" /><button onClick={() => addSection(index)} disabled={generating} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-[11px] font-bold text-muted-foreground"><Plus size={11} /> 여기에 구간 추가</button><div className="h-px flex-1 bg-border" /></div></div>;
        })}</div> : <div className="mt-5 rounded-xl border border-dashed border-border p-10 text-center"><p className="text-sm text-muted-foreground">AI가 이야기 전환점을 찾아 오프닝·본문·아웃트로 구간을 만들 수 있습니다.</p><button onClick={analyzeScriptSections} disabled={analyzing} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white">{analyzing ? <Loader2 size={15} className="animate-spin" /> : <WandSparkles size={15} />} AI로 구간 나누기</button></div>}
      </section>

      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-700"><Play size={19} /></div>
          <div className="min-w-0 flex-1"><h2 className="font-bold">전체 이어듣기</h2><p className="mt-1 text-xs text-muted-foreground">파일을 합치지 않고 오프닝부터 아웃트로까지 현재 구간 순서대로 이어서 재생합니다.</p></div>
          <button onClick={continuousPlaying ? stopContinuousPreview : startContinuousPreview} disabled={!segments.length || pendingGenerationCount > 0 || generating || Boolean(generatingSegmentId)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-100 px-4 py-2.5 text-sm font-bold text-sky-800 disabled:opacity-40">{continuousPlaying ? <Pause size={15} /> : <Play size={15} />}{continuousPlaying ? "재생 중지" : "처음부터 이어듣기"}</button>
        </div>
        <audio ref={continuousAudioRef} onEnded={handleContinuousEnded} className="hidden" />
        {continuousPlaying && segments[continuousIndex] && <div className="mt-4 rounded-xl bg-stone-50 p-4"><div className="flex items-center justify-between gap-3"><p className="shrink-0 text-xs font-bold text-sky-700">재생 중 {continuousIndex + 1} / {segments.length}</p><p className="truncate text-xs text-muted-foreground">{segments[continuousIndex].section_title} · {segments[continuousIndex].text}</p></div><div className="mt-3 flex gap-1">{segments.map((segment, index) => <button type="button" key={segment.id} onClick={() => setContinuousIndex(index)} aria-label={`${index + 1}번 구간 재생`} className={`h-1.5 flex-1 rounded-full transition-colors ${index <= continuousIndex ? "bg-sky-700" : "bg-border"}`} />)}</div></div>}
        {!continuousPlaying && pendingGenerationCount > 0 && segments.length > 0 && <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">생성 또는 재생성이 필요한 {pendingGenerationCount}개 구간을 완료하면 이어듣기가 활성화됩니다.</p>}
      </section>

      <section className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${latestRun ? "border-emerald-200 bg-emerald-50" : "border-border bg-white"}`}><div className="flex flex-col gap-4 lg:flex-row lg:items-center"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${latestRun ? "bg-white text-emerald-700" : "bg-sky-50 text-sky-700"}`}>{latestRun ? <Check size={20} /> : <Play size={20} />}</div><div className="min-w-0 flex-1"><h2 className="font-bold">최종 통합 TTS · SRT</h2><p className="mt-1 text-xs text-muted-foreground">{latestRun ? `${latestRun.segment_count}개 구간 · ${formatDuration(Number(latestRun.total_duration))} · 프로젝트 사운드 폴더 저장 완료` : pendingGenerationCount ? `${pendingGenerationCount}개 구간을 생성하거나 재생성해야 합니다.` : segments.length ? "모든 구간 검수가 끝났다면 프로젝트 사운드 폴더에 최종 WAV와 SRT를 저장하세요." : "먼저 내용 구간과 음성을 생성해주세요."}</p></div>{!latestRun && segments.length > 0 && <button onClick={retryFinalization} disabled={finalizing || generating || !projectFolder || pendingGenerationCount > 0 || !sectionsMatchScript} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">{finalizing ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} 최종 WAV · SRT 저장</button>}{latestRun && <div className="flex flex-wrap gap-2"><button onClick={downloadFinalAudio} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-800"><Download size={13} /> WAV</button><button onClick={downloadAiJapaneseSrt} disabled={generatingSrt} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{generatingSrt ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} AI 일본어 SRT</button></div>}</div>{(finalAudioUrl || latestRun?.combined_audio_url) && <audio controls src={finalAudioUrl || latestRun?.combined_audio_url || undefined} className="mt-4 h-10 w-full" />}
        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-dashed border-border bg-white/80 p-4 sm:flex-row sm:items-center"><FolderOpen size={18} className="shrink-0 text-sky-700" /><div className="min-w-0 flex-1"><p className="text-sm font-bold">프로젝트 폴더의 사운드 폴더</p><p className="mt-1 truncate text-xs text-muted-foreground">{projectFolder ? `${projectFolder.name} / 사운드에 48kHz WAV와 SRT 저장` : "프로젝트 폴더를 한 번 연결하면 다음에도 기억합니다."}</p></div><button onClick={connectProjectFolder} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold"><FolderOpen size={13} /> {projectFolder ? "폴더 변경" : "폴더 연결"}</button><button onClick={saveFinalToProjectFolder} disabled={!projectFolder || !latestRun || savingToFolder} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{savingToFolder ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} 사운드 폴더에 저장</button></div>
      </section>
      {latestRun && <Link href={`/studio/longform-japan/projects/${projectId}/image`} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 text-sm font-bold text-white">이미지 제작으로 <ArrowRight size={16} /></Link>}
    </>}
  </div>;
}

function SettingSlider({ label, value, minimum, maximum, step, suffix = "", onChange }: { label: string; value: number; minimum: number; maximum: number; step: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="block text-xs font-bold text-muted-foreground"><span className="flex items-center justify-between"><span>{label}</span><span className="text-foreground">{value.toFixed(2)}{suffix}</span></span><input type="range" min={minimum} max={maximum} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full accent-sky-700" /></label>;
}
