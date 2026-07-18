"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowDown, ArrowLeft, ArrowUp, Download, FileAudio, FileText, FolderOpen, ImageIcon, Loader2, Pause, Play, Plus, RefreshCw, Save, Search,
  Sparkles, Star, Trash2, Users, WandSparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { srtToScript, wordsToSrt, type WordTimestamp } from "@/lib/subtitles";
import { getProjectFolderHandle, saveProjectFolderHandle, writeBlobToFolder } from "@/lib/project-folder";

type Voice = {
  voice_id: string;
  voice_name: string;
  models: Array<{ version: string; emotions: string[] }>;
  gender: "male" | "female" | null;
  age: string | null;
  use_cases?: string[];
};

type Cast = {
  id: string;
  sort_order: number;
  character_name: string;
  voice_id: string;
  voice_name: string;
  emotion: string;
  tempo: number;
  pitch: number;
};

type Segment = {
  id: string;
  cast_id: string | null;
  sort_order: number;
  text: string;
  audio_url: string | null;
  storage_path: string | null;
  audio_duration: number | null;
  subtitle_srt: string;
  timestamps: WordTimestamp[];
  status: "todo" | "generated" | "error";
};

type VoiceRun = {
  id: string;
  segment_count: number;
  total_duration: number;
  combined_subtitle_srt: string;
  combined_audio_url: string | null;
  combined_audio_storage_path: string | null;
  finalized_at: string | null;
  created_at: string;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
};

type TypecastResult = {
  audio?: string;
  audio_format?: "mp3" | "wav";
  audio_duration?: number;
  words?: WordTimestamp[] | null;
  error?: string;
};

const emotionLabels: Record<string, string> = {
  normal: "기본", happy: "기쁨", sad: "슬픔", angry: "화남",
  whisper: "속삭임", toneup: "밝게", tonedown: "차분하게",
};

const ageLabels: Record<string, string> = {
  child: "어린이", teenager: "청소년", young_adult: "청년", middle_age: "중년", elder: "노년",
};

function voiceGenderLabel(gender: Voice["gender"]) {
  return gender === "female" ? "여성" : gender === "male" ? "남성" : "기타";
}

function voiceSearchText(voice: Voice) {
  const genderAliases = voice.gender === "female" ? "여성 여자 여" : voice.gender === "male" ? "남성 남자 남" : "기타";
  const ageAliases: Record<string, string> = {
    child: "어린이 아이 아동", teenager: "청소년 십대", young_adult: "청년 젊은 성인",
    middle_age: "중년", elder: "노년 노인",
  };
  return [voice.voice_name, genderAliases, ageAliases[voice.age || ""] || voice.age, ...(voice.use_cases || [])].join(" ").toLocaleLowerCase("ko-KR");
}

function voiceOptionLabel(voice: Voice) {
  const age = ageLabels[voice.age || ""] || "연령 미상";
  return `${voice.voice_name} · ${voiceGenderLabel(voice.gender)} · ${age}`;
}

function base64ToBlob(value: string, format: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: format === "mp3" ? "audio/mpeg" : "audio/wav" });
}

function downloadText(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim() || "사연_프로젝트";
}

function formatDuration(value: number) {
  const minutes = Math.floor(value / 60);
  return `${minutes}:${String(Math.round(value % 60)).padStart(2, "0")}`;
}

function splitScript(script: string) {
  const paragraphs = script.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  if (paragraphs.length > 1) return paragraphs;
  return (script.match(/[^.!?。！？]+[.!?。！？]?/g) ?? [script]).map((item) => item.trim()).filter(Boolean);
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

async function mergeAudioToWav(urls: string[], gapSeconds = 0.15) {
  const audioContext = new AudioContext();
  try {
    const buffers = await Promise.all(urls.map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("음성 파일을 불러오지 못했습니다.");
      return audioContext.decodeAudioData(await response.arrayBuffer());
    }));
    if (!buffers.length) throw new Error("합칠 음성 파일이 없습니다.");
    const sampleRate = buffers[0].sampleRate;
    const gapSamples = Math.round(sampleRate * gapSeconds);
    const totalSamples = buffers.reduce((sum, buffer) => sum + buffer.length, 0) + gapSamples * Math.max(0, buffers.length - 1);
    const wav = new ArrayBuffer(44 + totalSamples * 2);
    const view = new DataView(wav);
    writeAscii(view, 0, "RIFF"); view.setUint32(4, 36 + totalSamples * 2, true);
    writeAscii(view, 8, "WAVE"); writeAscii(view, 12, "fmt "); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    writeAscii(view, 36, "data"); view.setUint32(40, totalSamples * 2, true);
    let outputIndex = 0;
    for (let bufferIndex = 0; bufferIndex < buffers.length; bufferIndex += 1) {
      const buffer = buffers[bufferIndex];
      for (let sampleIndex = 0; sampleIndex < buffer.length; sampleIndex += 1) {
        let sample = 0;
        for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) sample += buffer.getChannelData(channel)[sampleIndex];
        sample = Math.max(-1, Math.min(1, sample / buffer.numberOfChannels));
        view.setInt16(44 + outputIndex * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        outputIndex += 1;
      }
      if (bufferIndex < buffers.length - 1) outputIndex += gapSamples;
    }
    return new Blob([wav], { type: "audio/wav" });
  } finally {
    await audioContext.close();
  }
}

export default function StoryCastVoicePage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState("사연 프로젝트");
  const [script, setScript] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [favoriteVoiceIds, setFavoriteVoiceIds] = useState<string[]>([]);
  const [voiceSearches, setVoiceSearches] = useState<Record<string, string>>({});
  const [casts, setCasts] = useState<Cast[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [latestRun, setLatestRun] = useState<VoiceRun | null>(null);
  const [editableFinalSrt, setEditableFinalSrt] = useState("");
  const [newCastName, setNewCastName] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingSegmentId, setGeneratingSegmentId] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [continuousIndex, setContinuousIndex] = useState(0);
  const [continuousPlaying, setContinuousPlaying] = useState(false);
  const [projectFolder, setProjectFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [savingToFolder, setSavingToFolder] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [schemaReady, setSchemaReady] = useState(true);
  const [favoritesReady, setFavoritesReady] = useState(true);
  const [typecastReady, setTypecastReady] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const savedSegmentTexts = useRef<Record<string, string>>({});
  const continuousAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingGenerationCount = segments.filter((item) => item.status !== "generated" || !item.audio_url || !item.audio_duration || !item.timestamps?.length).length;
  const generatedSegmentCount = segments.length - pendingGenerationCount;
  const sortedVoices = useMemo(() => [...voices].sort((left, right) => {
    const favoriteDifference = Number(favoriteVoiceIds.includes(right.voice_id)) - Number(favoriteVoiceIds.includes(left.voice_id));
    return favoriteDifference || left.voice_name.localeCompare(right.voice_name);
  }), [favoriteVoiceIds, voices]);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active || !user) return;
      setUserId(user.id);
      const [projectRes, scriptRes, castsRes, segmentsRes, runRes, favoritesRes, voicesRes] = await Promise.all([
        supabase.from("projects").select("title").eq("id", projectId).single(),
        supabase.from("scripts").select("content").eq("project_id", projectId).maybeSingle(),
        supabase.from("story_voice_casts").select("*").eq("project_id", projectId).order("sort_order"),
        supabase.from("story_voice_segments").select("*").eq("project_id", projectId).order("sort_order"),
        supabase.from("story_voice_runs").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("typecast_voice_favorites").select("voice_id").order("created_at", { ascending: false }),
        fetch("/api/typecast/voices").then(async (response) => ({ ok: response.ok, payload: await response.json() as { voices?: Voice[]; error?: string; code?: string } })),
      ]);
      if (!active) return;
      const schemaMissing = [castsRes.error, segmentsRes.error, runRes.error].some((item) => item?.code === "42P01" || item?.code === "PGRST205");
      if (schemaMissing) setSchemaReady(false);
      else if (castsRes.error || segmentsRes.error || runRes.error) setError("캐릭터 음성 작업을 불러오지 못했습니다.");
      setProjectTitle(projectRes.data?.title || "사연 프로젝트");
      setScript(scriptRes.data?.content || "");
      setCasts((castsRes.data ?? []) as Cast[]);
      const loadedSegments = (segmentsRes.data ?? []) as Segment[];
      savedSegmentTexts.current = Object.fromEntries(loadedSegments.map((item) => [item.id, item.text]));
      setSegments(loadedSegments);
      const loadedRun = runRes.data as VoiceRun | null;
      setLatestRun(loadedRun?.combined_audio_url ? loadedRun : null);
      setEditableFinalSrt(loadedRun?.combined_audio_url ? loadedRun.combined_subtitle_srt : "");
      if (favoritesRes.error?.code === "42P01" || favoritesRes.error?.code === "PGRST205") setFavoritesReady(false);
      else if (favoritesRes.error) setError("목소리 즐겨찾기를 불러오지 못했습니다.");
      else setFavoriteVoiceIds((favoritesRes.data ?? []).map((item) => item.voice_id));
      if (!voicesRes.ok) {
        if (voicesRes.payload.code === "KEY_MISSING") setTypecastReady(false);
        else setError(voicesRes.payload.error || "목소리 목록을 가져오지 못했습니다.");
      } else setVoices(voicesRes.payload.voices ?? []);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [projectId, supabase]);

  useEffect(() => {
    getProjectFolderHandle(projectId).then(setProjectFolder).catch(() => undefined);
  }, [projectId]);

  useEffect(() => {
    if (!continuousPlaying) return;
    const audio = continuousAudioRef.current;
    const url = segments[continuousIndex]?.audio_url;
    if (!audio || !url) return;
    audio.src = url;
    audio.play().catch(() => setContinuousPlaying(false));
  }, [continuousIndex, continuousPlaying, segments]);

  useEffect(() => {
    if (loading) return;
    const changed = segments.filter((item) => savedSegmentTexts.current[item.id] !== undefined && savedSegmentTexts.current[item.id] !== item.text);
    if (!changed.length) return;
    const timer = window.setTimeout(async () => {
      await Promise.all(changed.map((item) => supabase.from("story_voice_segments").update({ text: item.text, status: "todo", updated_at: new Date().toISOString() }).eq("id", item.id)));
      for (const item of changed) savedSegmentTexts.current[item.id] = item.text;
      setSegments((current) => current.map((item) => changed.some((changedItem) => changedItem.id === item.id) ? { ...item, status: "todo" } : item));
      const { data: finalizedRuns } = await supabase.from("story_voice_runs").select("combined_audio_storage_path").eq("project_id", projectId);
      const paths = (finalizedRuns ?? []).map((item) => item.combined_audio_storage_path).filter((item): item is string => Boolean(item));
      if (paths.length) await supabase.storage.from("story-audio").remove(paths);
      await supabase.from("story_voice_runs").delete().eq("project_id", projectId);
      setLatestRun(null);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [loading, projectId, segments, supabase]);

  const invalidateVoiceRuns = async () => {
    const { data: finalizedRuns } = await supabase.from("story_voice_runs").select("combined_audio_storage_path").eq("project_id", projectId);
    const paths = (finalizedRuns ?? []).map((item) => item.combined_audio_storage_path).filter((item): item is string => Boolean(item));
    if (paths.length) await supabase.storage.from("story-audio").remove(paths);
    await supabase.from("story_voice_runs").delete().eq("project_id", projectId);
    setLatestRun(null);
  };

  const addCast = async () => {
    const characterName = newCastName.trim();
    const voice = sortedVoices[0];
    if (!userId || !characterName || !voice) return setError("캐릭터 이름과 Typecast 목소리를 확인해주세요.");
    const { data, error: insertError } = await supabase.from("story_voice_casts").insert({
      project_id: projectId, user_id: userId, sort_order: casts.length,
      character_name: characterName, voice_id: voice.voice_id, voice_name: voice.voice_name,
    }).select("*").single();
    if (insertError || !data) return setError("배역 추가에 실패했습니다.");
    setCasts((current) => [...current, data as Cast]);
    setNewCastName("");
  };

  const toggleFavorite = async (voice: Voice) => {
    if (!userId || !favoritesReady) return;
    const isFavorite = favoriteVoiceIds.includes(voice.voice_id);
    setFavoriteVoiceIds((current) => isFavorite ? current.filter((id) => id !== voice.voice_id) : [voice.voice_id, ...current]);
    const { error: favoriteError } = isFavorite
      ? await supabase.from("typecast_voice_favorites").delete().eq("user_id", userId).eq("voice_id", voice.voice_id)
      : await supabase.from("typecast_voice_favorites").upsert({ user_id: userId, voice_id: voice.voice_id, voice_name: voice.voice_name });
    if (favoriteError) {
      setFavoriteVoiceIds((current) => isFavorite ? [voice.voice_id, ...current] : current.filter((id) => id !== voice.voice_id));
      setError("목소리 즐겨찾기 저장에 실패했습니다.");
    }
  };

  const updateCast = async (cast: Cast, changes: Partial<Cast>) => {
    const next = { ...cast, ...changes };
    setCasts((current) => current.map((item) => item.id === cast.id ? next : item));
    const { error: updateError } = await supabase.from("story_voice_casts").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", cast.id);
    if (updateError) return setError("배역 수정에 실패했습니다.");
    await supabase.from("story_voice_segments").update({ status: "todo", updated_at: new Date().toISOString() }).eq("cast_id", cast.id);
    setSegments((current) => current.map((item) => item.cast_id === cast.id ? { ...item, status: "todo" } : item));
    await invalidateVoiceRuns();
  };

  const deleteCast = async (cast: Cast) => {
    if (!window.confirm(`'${cast.character_name}' 배역을 삭제할까요? 연결된 대사 구간은 남아 있습니다.`)) return;
    const { error: deleteError } = await supabase.from("story_voice_casts").delete().eq("id", cast.id);
    if (deleteError) return setError("배역 삭제에 실패했습니다.");
    setCasts((current) => current.filter((item) => item.id !== cast.id));
    setSegments((current) => current.map((item) => item.cast_id === cast.id ? { ...item, cast_id: null, status: "todo" } : item));
    await invalidateVoiceRuns();
  };

  const createSegmentsFromScript = async () => {
    if (!userId || !script.trim()) return setError("먼저 확정 대본을 작성해주세요.");
    if (!casts.length) return setError("대본을 나누기 전에 배역을 하나 이상 추가해주세요.");
    if (segments.length && !window.confirm("기존 대사 구간과 생성 음성을 지우고 대본으로 다시 나눌까요?")) return;
    setError(null); setNotice(null);
    if (segments.length) {
      const paths = segments.map((item) => item.storage_path).filter((item): item is string => Boolean(item));
      if (paths.length) await supabase.storage.from("story-audio").remove(paths);
      const { error: deleteError } = await supabase.from("story_voice_segments").delete().eq("project_id", projectId);
      if (deleteError) return setError("기존 대사 구간 정리에 실패했습니다.");
    }
    const rows = splitScript(script).map((text, index) => ({
      project_id: projectId, user_id: userId, cast_id: casts[0].id, sort_order: index, text,
    }));
    const { data, error: insertError } = await supabase.from("story_voice_segments").insert(rows).select("*");
    if (insertError) return setError("대사 구간 생성에 실패했습니다.");
    const createdSegments = (data ?? []) as Segment[];
    savedSegmentTexts.current = Object.fromEntries(createdSegments.map((item) => [item.id, item.text]));
    setSegments(createdSegments);
    await invalidateVoiceRuns();
    setNotice(`대본을 ${data?.length ?? 0}개 구간으로 나눴습니다. 각 구간의 화자를 선택해주세요.`);
  };

  const persistSegmentOrder = async (items: Segment[]) => {
    const ordered = items.map((item, index) => ({ ...item, sort_order: index }));
    setSegments(ordered);
    const results = await Promise.all(ordered.map((item) => supabase.from("story_voice_segments").update({ sort_order: item.sort_order, updated_at: new Date().toISOString() }).eq("id", item.id)));
    if (results.some((result) => result.error)) {
      setError("구간 순서 저장에 실패했습니다.");
      return false;
    }
    await invalidateVoiceRuns();
    return true;
  };

  const addSegment = async (afterIndex?: number) => {
    if (!userId) return;
    const insertIndex = afterIndex === undefined ? segments.length : afterIndex + 1;
    const { data, error: insertError } = await supabase.from("story_voice_segments").insert({
      project_id: projectId, user_id: userId, cast_id: casts[0]?.id || null, sort_order: insertIndex, text: "",
    }).select("*").single();
    if (insertError || !data) return setError("대사 구간 추가에 실패했습니다.");
    savedSegmentTexts.current[data.id] = data.text || "";
    const next = [...segments];
    next.splice(insertIndex, 0, data as Segment);
    await persistSegmentOrder(next);
    setNotice(`${insertIndex + 1}번 위치에 새 구간을 추가했습니다.`);
  };

  const moveSegment = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= segments.length) return;
    const next = [...segments];
    [next[index], next[target]] = [next[target], next[index]];
    await persistSegmentOrder(next);
  };

  const updateSegment = async (segment: Segment, changes: Partial<Segment>) => {
    const hasChange = Object.entries(changes).some(([key, value]) => segment[key as keyof Segment] !== value);
    if (!hasChange) return;
    const next = { ...segment, ...changes, status: "todo" as const };
    setSegments((current) => current.map((item) => item.id === segment.id ? next : item));
    const { error: updateError } = await supabase.from("story_voice_segments").update({ ...changes, status: "todo", updated_at: new Date().toISOString() }).eq("id", segment.id);
    if (updateError) setError("대사 구간 수정에 실패했습니다.");
    else await invalidateVoiceRuns();
  };

  const deleteSegment = async (segment: Segment) => {
    if (!window.confirm("이 대사 구간을 삭제할까요?")) return;
    if (segment.storage_path) await supabase.storage.from("story-audio").remove([segment.storage_path]);
    const { error: deleteError } = await supabase.from("story_voice_segments").delete().eq("id", segment.id);
    if (deleteError) return setError("대사 구간 삭제에 실패했습니다.");
    delete savedSegmentTexts.current[segment.id];
    await persistSegmentOrder(segments.filter((item) => item.id !== segment.id));
  };

  const generateSegmentAudio = async (segment: Segment, index: number) => {
    if (!userId) throw new Error("로그인이 필요합니다.");
    const cast = casts.find((item) => item.id === segment.cast_id);
    if (!cast) throw new Error(`${index + 1}번 구간의 배역을 선택해주세요.`);
    if (!segment.text.trim()) throw new Error(`${index + 1}번 구간의 대본을 입력해주세요.`);
    if (segment.text.trim().length > 2000) throw new Error(`${index + 1}번 구간이 2,000자를 넘습니다.`);
    const response = await fetch("/api/typecast/generate", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, text: segment.text, voiceId: cast.voice_id, emotion: cast.emotion, tempo: Number(cast.tempo), pitch: Number(cast.pitch), audioFormat: "mp3" }),
    });
    const payload = await response.json() as TypecastResult;
    if (!response.ok || !payload.audio || !payload.audio_duration || !payload.audio_format) throw new Error(`${index + 1}번 ${cast.character_name} 음성: ${payload.error || "생성 실패"}`);
    const words = payload.words ?? [];
    const blob = base64ToBlob(payload.audio, payload.audio_format);
    const storagePath = `${userId}/${projectId}/cast-${crypto.randomUUID()}.${payload.audio_format}`;
    const { error: uploadError } = await supabase.storage.from("story-audio").upload(storagePath, blob, { contentType: blob.type });
    if (uploadError) throw new Error(`${index + 1}번 음성 파일 저장에 실패했습니다.`);
    const { data: publicUrl } = supabase.storage.from("story-audio").getPublicUrl(storagePath);
    const srt = wordsToSrt(words);
    const { error: saveError } = await supabase.from("story_voice_segments").update({
      text: segment.text, audio_url: publicUrl.publicUrl, storage_path: storagePath, audio_duration: payload.audio_duration,
      subtitle_srt: srt, timestamps: words, status: "generated", updated_at: new Date().toISOString(),
    }).eq("id", segment.id);
    if (saveError) {
      await supabase.storage.from("story-audio").remove([storagePath]);
      throw new Error(`${index + 1}번 음성 기록 저장에 실패했습니다.`);
    }
    if (segment.storage_path) await supabase.storage.from("story-audio").remove([segment.storage_path]);
    savedSegmentTexts.current[segment.id] = segment.text;
    return { ...segment, audio_url: publicUrl.publicUrl, storage_path: storagePath, audio_duration: payload.audio_duration, subtitle_srt: srt, timestamps: words, status: "generated" as const };
  };

  const buildTimeline = (items: Segment[]) => {
    const absoluteWords: WordTimestamp[] = [];
    let offset = 0;
    for (const item of items) {
      absoluteWords.push(...item.timestamps.map((word) => ({ ...word, start: word.start + offset, end: word.end + offset })));
      offset += Number(item.audio_duration) + 0.15;
    }
    return { combinedSrt: wordsToSrt(absoluteWords), totalDuration: Math.max(0, offset - 0.15) };
  };

  const saveProjectScript = async (content: string) => {
    if (!userId) throw new Error("로그인이 필요합니다.");
    const { data: existingScript, error: findError } = await supabase.from("scripts").select("id").eq("project_id", projectId).limit(1).maybeSingle();
    if (findError) throw new Error("프로젝트 대본을 확인하지 못했습니다.");
    if (existingScript) {
      const { error: updateError } = await supabase.from("scripts").update({ content }).eq("id", existingScript.id);
      if (updateError) throw new Error("프로젝트 대본 수정에 실패했습니다.");
      return;
    }
    const { error: insertError } = await supabase.from("scripts").insert({
      user_id: userId,
      project_id: projectId,
      title: projectTitle,
      content,
    });
    if (insertError) throw new Error("프로젝트 대본 생성에 실패했습니다.");
  };

  const saveEditedSrtAsScript = async () => {
    if (!latestRun) return;
    const normalizedSrt = editableFinalSrt.trim();
    const finalScript = srtToScript(normalizedSrt);
    if (!normalizedSrt || !finalScript) return setError("저장할 SRT 자막 내용을 확인해주세요.");
    setFinalizing(true); setError(null); setNotice(null);
    try {
      const { error: runError } = await supabase.from("story_voice_runs").update({ combined_subtitle_srt: normalizedSrt }).eq("id", latestRun.id);
      if (runError) throw new Error("수정한 SRT 저장에 실패했습니다.");
      await saveProjectScript(finalScript);
      setLatestRun((current) => current ? { ...current, combined_subtitle_srt: normalizedSrt } : current);
      setScript(finalScript);
      setNotice("수정한 최종 SRT를 저장하고, 시간코드를 뺀 자막 문장으로 프로젝트 대본을 갱신했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "SRT 대본 반영 중 오류가 발생했습니다.");
    } finally {
      setFinalizing(false);
    }
  };

  const finalizeProduction = async () => {
    if (!userId || !segments.length) return setError("최종 확정할 음성이 없습니다.");
    if (pendingGenerationCount > 0) return setError(`먼저 변경되거나 미생성된 ${pendingGenerationCount}개 구간을 생성해주세요.`);
    if (!window.confirm("현재 구간 순서와 음성을 최종 통합 TTS와 SRT로 확정할까요?")) return;
    setFinalizing(true); setError(null); setNotice(null);
    let uploadedPath: string | null = null;
    try {
      const urls = segments.map((item) => item.audio_url).filter((item): item is string => Boolean(item));
      const combinedAudio = await mergeAudioToWav(urls);
      await invalidateVoiceRuns();
      uploadedPath = `${userId}/${projectId}/final-${crypto.randomUUID()}.wav`;
      const { error: uploadError } = await supabase.storage.from("story-audio").upload(uploadedPath, combinedAudio, { contentType: "audio/wav" });
      if (uploadError) throw new Error("최종 통합 음성 저장에 실패했습니다.");
      const { data: publicUrl } = supabase.storage.from("story-audio").getPublicUrl(uploadedPath);
      const timeline = buildTimeline(segments);
      const finalizedAt = new Date().toISOString();
      const finalScript = srtToScript(timeline.combinedSrt);
      try {
        await saveProjectScript(finalScript);
      } catch (reason) {
        await supabase.storage.from("story-audio").remove([uploadedPath]);
        throw reason;
      }
      const { data: run, error: runError } = await supabase.from("story_voice_runs").insert({
        project_id: projectId, user_id: userId, segment_count: segments.length,
        total_duration: timeline.totalDuration, combined_subtitle_srt: timeline.combinedSrt,
        combined_audio_url: publicUrl.publicUrl, combined_audio_storage_path: uploadedPath, finalized_at: finalizedAt,
      }).select("*").single();
      if (runError || !run) {
        await supabase.storage.from("story-audio").remove([uploadedPath]);
        throw new Error("최종 결과 저장에 실패했습니다. `20260718_story_voice_finalization.sql` 실행 여부를 확인해주세요.");
      }
      setScript(finalScript);
      setLatestRun(run as VoiceRun);
      setEditableFinalSrt(timeline.combinedSrt);
      setNotice("최종 통합 TTS·SRT를 확정하고 SRT 자막 기준으로 캐릭터 제작용 대본도 갱신했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "최종 결과 생성 중 오류가 발생했습니다.");
    } finally {
      setFinalizing(false);
    }
  };

  const connectProjectFolder = async () => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) return setError("프로젝트 폴더 연결은 Chrome 또는 Edge에서 사용할 수 있습니다.");
    try {
      const handle = await picker({ id: `story-project-${projectId}`, mode: "readwrite" });
      await Promise.all([
        handle.getDirectoryHandle("사운드", { create: true }),
        handle.getDirectoryHandle("영상", { create: true }),
        handle.getDirectoryHandle("캐릭터", { create: true }),
      ]);
      await saveProjectFolderHandle(projectId, handle);
      setProjectFolder(handle);
      setNotice(`'${handle.name}' 폴더를 이 프로젝트에 연결했습니다.`);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError("프로젝트 폴더 연결에 실패했습니다.");
    }
  };

  const saveFinalToProjectFolder = async () => {
    if (!projectFolder || !latestRun?.combined_audio_url) return setError("프로젝트 폴더와 최종 통합 음성을 확인해주세요.");
    setSavingToFolder(true); setError(null); setNotice(null);
    try {
      const permissionHandle = projectFolder as FileSystemDirectoryHandle & {
        queryPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState>;
        requestPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState>;
      };
      let permission = await permissionHandle.queryPermission?.({ mode: "readwrite" });
      if (permission !== "granted") permission = await permissionHandle.requestPermission?.({ mode: "readwrite" });
      if (permission !== "granted") throw new Error("폴더 쓰기 권한이 필요합니다.");
      const [soundFolder, videoFolder, characterFolder] = await Promise.all([
        projectFolder.getDirectoryHandle("사운드", { create: true }),
        projectFolder.getDirectoryHandle("영상", { create: true }),
        projectFolder.getDirectoryHandle("캐릭터", { create: true }),
      ]);
      const audioResponse = await fetch(latestRun.combined_audio_url);
      if (!audioResponse.ok) throw new Error("최종 음성 파일을 불러오지 못했습니다.");
      const baseName = safeFileName(projectTitle);
      await writeBlobToFolder(soundFolder, `${baseName}_전체음성.wav`, await audioResponse.blob());
      await writeBlobToFolder(soundFolder, `${baseName}_자막.srt`, new Blob([latestRun.combined_subtitle_srt], { type: "text/plain;charset=utf-8" }));
      const [characterResult, backgroundResult] = await Promise.all([
        supabase.from("story_character_cues").select("character_name, image_url, sort_order").eq("project_id", projectId).not("image_url", "is", null).order("sort_order"),
        supabase.from("story_background_assets").select("file_name, url").eq("project_id", projectId).order("created_at"),
      ]);
      let characterCount = 0;
      for (const [index, item] of (characterResult.data ?? []).entries()) {
        if (!item.image_url) continue;
        const response = await fetch(item.image_url);
        if (!response.ok) continue;
        const extension = response.headers.get("content-type")?.includes("jpeg") ? "jpg" : "png";
        await writeBlobToFolder(characterFolder, `${String(index + 1).padStart(2, "0")}_${safeFileName(item.character_name)}.${extension}`, await response.blob());
        characterCount += 1;
      }
      let backgroundCount = 0;
      for (const item of backgroundResult.data ?? []) {
        const response = await fetch(item.url);
        if (!response.ok) continue;
        await writeBlobToFolder(videoFolder, safeFileName(item.file_name), await response.blob());
        backgroundCount += 1;
      }
      setNotice(`'${projectFolder.name}'에 음성·자막, 캐릭터 ${characterCount}개, 영상 ${backgroundCount}개를 저장했습니다.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "프로젝트 폴더 저장에 실패했습니다.");
    } finally {
      setSavingToFolder(false);
    }
  };

  const downloadFinalAudio = async () => {
    if (!latestRun?.combined_audio_url) return;
    const response = await fetch(latestRun.combined_audio_url);
    if (!response.ok) return setError("최종 음성을 내려받지 못했습니다.");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url; link.download = `${safeFileName(projectTitle)}_전체음성.wav`; link.click();
    URL.revokeObjectURL(url);
  };

  const startContinuousPreview = () => {
    if (pendingGenerationCount > 0) return setError(`연속 재생 전에 ${pendingGenerationCount}개 구간 음성을 생성해주세요.`);
    setContinuousIndex(0);
    setContinuousPlaying(true);
  };

  const stopContinuousPreview = () => {
    continuousAudioRef.current?.pause();
    setContinuousPlaying(false);
  };

  const handleContinuousEnded = () => {
    if (continuousIndex < segments.length - 1) setContinuousIndex((current) => current + 1);
    else setContinuousPlaying(false);
  };

  const regenerateSegment = async (segment: Segment, index: number) => {
    if (!window.confirm(`${index + 1}번 구간을 Typecast로 생성합니다. 크레딧을 사용해 계속할까요?`)) return;
    setError(null); setNotice(null); setGeneratingSegmentId(segment.id);
    try {
      const generated = await generateSegmentAudio(segment, index);
      const next = segments.map((item) => item.id === segment.id ? generated : item);
      setSegments(next);
      await invalidateVoiceRuns();
      setNotice(`${index + 1}번 구간 음성을 생성했습니다. 연속 재생으로 흐름을 확인해주세요.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "구간 음성 생성에 실패했습니다.");
    } finally {
      setGeneratingSegmentId(null);
    }
  };

  const generateAll = async () => {
    setError(null); setNotice(null);
    if (!userId || !segments.length) return setError("생성할 대사 구간이 없습니다.");
    if (segments.some((item) => !item.text.trim() || !item.cast_id)) return setError("모든 대사 구간에 내용과 화자를 지정해주세요.");
    if (segments.some((item) => item.text.trim().length > 2000)) return setError("2,000자를 넘는 대사 구간을 나눠주세요.");
    if (pendingGenerationCount > 0 && !window.confirm(`${pendingGenerationCount}개 구간을 Typecast로 생성합니다. 크레딧을 사용해 계속할까요?`)) return;
    setGenerating(true); setGenerationProgress(0);
    const nextSegments = [...segments];
    try {
      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        if (segment.status !== "generated" || !segment.audio_url || !segment.audio_duration || !segment.timestamps?.length) {
          nextSegments[index] = await generateSegmentAudio(segment, index);
          setSegments([...nextSegments]);
        }
        setGenerationProgress(index + 1);
      }
      await invalidateVoiceRuns();
      setNotice(`${segments.length}개 구간의 초안 음성을 준비했습니다. 연속 재생으로 검수해주세요.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "캐릭터 음성 생성 중 오류가 발생했습니다.");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-brand-olive" /></div>;
  if (!schemaReady) return <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-7 shadow-sm"><h1 className="text-lg font-bold">캐릭터별 음성 설정이 필요합니다</h1><p className="mt-3 text-sm text-muted-foreground">Supabase에서 `20260718_story_multi_voice.sql`을 실행해주세요.</p><Link href={`/studio/shorts-story/projects/${projectId}`} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-brand-olive"><ArrowLeft size={15} /> 워크벤치로 돌아가기</Link></div>;

  return <div className="mx-auto max-w-7xl space-y-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><Link href={`/studio/shorts-story/projects/${projectId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-brand-olive"><ArrowLeft size={15} /> 워크벤치</Link><h1 className="mt-3 text-2xl font-bold sm:text-3xl">캐릭터별 목소리</h1><p className="mt-1 text-sm text-muted-foreground">{projectTitle} · 초안 생성 → 검수 → 최종 통합 순서로 제작합니다.</p></div><button onClick={generateAll} disabled={generating || Boolean(generatingSegmentId) || !typecastReady || !segments.length || pendingGenerationCount === 0} className="inline-flex min-w-48 items-center justify-center gap-2 rounded-xl bg-brand-olive px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{generating ? <><Loader2 size={15} className="animate-spin" /> {generationProgress}/{segments.length} 생성 중</> : pendingGenerationCount > 0 && generatedSegmentCount === 0 ? <><Sparkles size={15} /> 전체 초안 TTS 생성 ({pendingGenerationCount})</> : pendingGenerationCount > 0 ? <><Sparkles size={15} /> 변경 구간 생성 ({pendingGenerationCount})</> : <><Sparkles size={15} /> 초안 생성 완료</>}</button></div>
    {!typecastReady && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">`.env.local`에 TYPECAST_API_KEY를 추가하고 개발 서버를 재시작해주세요.</div>}
    {!favoritesReady && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">즐겨찾기를 사용하려면 Supabase에서 `20260718_typecast_voice_favorites.sql`을 실행해주세요.</div>}
    {(error || notice) && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{error || notice}</div>}

    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><Users size={18} className="text-brand-olive" /><div><div className="flex items-center gap-2"><h2 className="font-bold">배역표</h2><span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700"><Star size={10} fill="currentColor" /> 즐겨찾기 {favoriteVoiceIds.length}</span></div><p className="mt-0.5 text-xs text-muted-foreground">캐릭터마다 목소리·감정·속도·피치를 저장합니다.</p></div></div><div className="flex gap-2"><input value={newCastName} onChange={(event) => setNewCastName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addCast(); }} placeholder="예: 나레이션, 엄마" className="h-10 min-w-0 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand-olive" /><button onClick={addCast} disabled={!newCastName.trim() || !voices.length} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-olive px-3 text-xs font-bold text-white disabled:opacity-50"><Plus size={14} /> 배역 추가</button></div></div>
      {casts.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{casts.map((cast) => {
        const voice = voices.find((item) => item.voice_id === cast.voice_id);
        const emotions = voice?.models.find((item) => item.version === "ssfm-v30")?.emotions ?? ["normal"];
        const query = (voiceSearches[cast.id] || "").trim().toLocaleLowerCase("ko-KR");
        const searched = sortedVoices.filter((item) => !query || voiceSearchText(item).includes(query));
        const options = voice && !searched.some((item) => item.voice_id === voice.voice_id) ? [voice, ...searched] : searched;
        const favoriteOptions = options.filter((item) => favoriteVoiceIds.includes(item.voice_id));
        const regularOptions = options.filter((item) => !favoriteVoiceIds.includes(item.voice_id));
        const isFavorite = Boolean(voice && favoriteVoiceIds.includes(voice.voice_id));
        return <div key={cast.id} className="rounded-xl border border-border p-4"><div className="flex items-center gap-2"><input value={cast.character_name} onChange={(event) => setCasts((current) => current.map((item) => item.id === cast.id ? { ...item, character_name: event.target.value } : item))} onBlur={(event) => updateCast(cast, { character_name: event.target.value })} className="min-w-0 flex-1 text-sm font-bold outline-none" /><button onClick={() => deleteCast(cast)} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button></div><label className="mt-3 flex h-10 items-center gap-2 rounded-lg border border-border bg-stone-50 px-3 focus-within:border-brand-olive"><Search size={14} className="text-muted-foreground" /><input value={voiceSearches[cast.id] || ""} onChange={(event) => setVoiceSearches((current) => ({ ...current, [cast.id]: event.target.value }))} placeholder="이름·여성·남성·청년·중년 검색" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /><span className="text-[10px] font-bold text-muted-foreground">{searched.length}</span></label><div className="mt-2 grid grid-cols-[1fr_40px] gap-2"><select value={cast.voice_id} onChange={(event) => { const selected = voices.find((item) => item.voice_id === event.target.value); updateCast(cast, { voice_id: event.target.value, voice_name: selected?.voice_name || event.target.value, emotion: "normal" }); }} className="h-10 min-w-0 rounded-lg border border-border bg-white px-2 text-xs">{favoriteOptions.length > 0 && <optgroup label="★ 즐겨찾기">{favoriteOptions.map((item) => <option key={item.voice_id} value={item.voice_id}>{voiceOptionLabel(item)}</option>)}</optgroup>}{regularOptions.length > 0 && <optgroup label="전체 목소리">{regularOptions.map((item) => <option key={item.voice_id} value={item.voice_id}>{voiceOptionLabel(item)}</option>)}</optgroup>}</select><button type="button" onClick={() => voice && toggleFavorite(voice)} disabled={!voice || !favoritesReady} title={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"} className={`flex h-10 items-center justify-center rounded-lg border disabled:opacity-40 ${isFavorite ? "border-amber-300 bg-amber-50 text-amber-600" : "border-border text-muted-foreground hover:text-amber-600"}`}><Star size={17} fill={isFavorite ? "currentColor" : "none"} /></button></div><select value={cast.emotion} onChange={(event) => updateCast(cast, { emotion: event.target.value })} className="mt-2 h-10 w-full rounded-lg border border-border bg-white px-2 text-xs"><option value={cast.emotion}>{emotionLabels[cast.emotion] || cast.emotion}</option>{emotions.filter((item) => item !== cast.emotion).map((item) => <option key={item} value={item}>{emotionLabels[item] || item}</option>)}</select><div className="mt-3 grid grid-cols-2 gap-4"><label className="text-[11px] font-bold text-muted-foreground">속도 {Number(cast.tempo).toFixed(1)}x<input type="range" min="0.5" max="2" step="0.1" value={Number(cast.tempo)} onChange={(event) => setCasts((current) => current.map((item) => item.id === cast.id ? { ...item, tempo: Number(event.target.value) } : item))} onPointerUp={(event) => updateCast(cast, { tempo: Number(event.currentTarget.value) })} className="mt-1 w-full accent-brand-olive" /></label><label className="text-[11px] font-bold text-muted-foreground">피치 {Number(cast.pitch) > 0 ? "+" : ""}{cast.pitch}<input type="range" min="-12" max="12" step="1" value={Number(cast.pitch)} onChange={(event) => setCasts((current) => current.map((item) => item.id === cast.id ? { ...item, pitch: Number(event.target.value) } : item))} onPointerUp={(event) => updateCast(cast, { pitch: Number(event.currentTarget.value) })} className="mt-1 w-full accent-brand-olive" /></label></div></div>;
      })}</div> : <p className="mt-4 rounded-xl border border-dashed border-border p-7 text-center text-sm text-muted-foreground">먼저 나레이션과 등장인물 배역을 추가하세요.</p>}
    </section>

    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><FileText size={18} className="text-brand-olive" /><div><h2 className="font-bold">대사 구간</h2><p className="mt-0.5 text-xs text-muted-foreground">대본 {script.length.toLocaleString()}자 · 수정한 구간만 다시 생성할 수 있습니다.</p></div></div><div className="flex gap-2"><button onClick={() => addSegment()} disabled={!casts.length} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold disabled:opacity-50"><Plus size={13} /> 끝에 추가</button><button onClick={createSegmentsFromScript} disabled={!script || !casts.length} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-pink px-3 py-2 text-xs font-bold disabled:opacity-50"><WandSparkles size={13} /> 대본으로 구간 만들기</button></div></div>
      {segments.length ? <div className="mt-4">{segments.map((segment, index) => { const cast = casts.find((item) => item.id === segment.cast_id); const isGeneratingThis = generatingSegmentId === segment.id; return <div key={segment.id}><div className={`rounded-xl border p-4 ${segment.status === "generated" ? "border-emerald-200" : "border-amber-200"}`}><div className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-cream text-xs font-bold text-brand-olive-dark">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-col gap-2 sm:flex-row"><select value={segment.cast_id || ""} onChange={(event) => updateSegment(segment, { cast_id: event.target.value || null })} className="h-9 rounded-lg border border-border bg-white px-2 text-xs font-bold sm:w-40"><option value="">화자 선택</option>{casts.map((item) => <option key={item.id} value={item.id}>{item.character_name}</option>)}</select><textarea value={segment.text} onChange={(event) => setSegments((current) => current.map((item) => item.id === segment.id ? { ...item, text: event.target.value } : item))} onBlur={(event) => { if (event.target.value !== segment.text || segment.status === "generated") updateSegment(segment, { text: event.target.value }); }} className="min-h-20 flex-1 resize-y rounded-lg border border-border bg-stone-50 p-3 text-sm leading-6 outline-none focus:border-brand-olive" /></div>{segment.audio_url && <audio controls src={segment.audio_url} className="mt-3 h-9 max-w-full w-full" />}<div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-[11px] font-semibold text-muted-foreground">{segment.status === "generated" ? `${cast?.character_name || "화자"} · ${formatDuration(Number(segment.audio_duration || 0))}` : segment.audio_url ? "대본 또는 배역 변경됨 · 이 구간을 다시 생성하세요" : "생성 전"}</p><button onClick={() => regenerateSegment(segment, index)} disabled={generating || Boolean(generatingSegmentId) || !typecastReady || !segment.text.trim() || !segment.cast_id} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-olive px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{isGeneratingThis ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}{isGeneratingThis ? "생성 중" : segment.audio_url ? "이 구간 재생성" : "이 구간 생성"}</button></div></div><div className="flex flex-col gap-1"><button onClick={() => moveSegment(index, -1)} disabled={index === 0 || generating || Boolean(generatingSegmentId)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-25" aria-label="위로 이동"><ArrowUp size={14} /></button><button onClick={() => moveSegment(index, 1)} disabled={index === segments.length - 1 || generating || Boolean(generatingSegmentId)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-25" aria-label="아래로 이동"><ArrowDown size={14} /></button><button onClick={() => deleteSegment(segment)} disabled={generating || Boolean(generatingSegmentId)} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-25" aria-label="삭제"><Trash2 size={14} /></button></div></div></div><div className="flex items-center gap-2 py-2"><div className="h-px flex-1 bg-border" /><button onClick={() => addSegment(index)} disabled={generating || Boolean(generatingSegmentId)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-white px-3 py-1 text-[11px] font-bold text-muted-foreground hover:border-brand-olive hover:text-brand-olive disabled:opacity-40"><Plus size={11} /> 여기에 구간 추가</button><div className="h-px flex-1 bg-border" /></div></div>; })}</div> : <p className="mt-4 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">배역을 추가한 다음 확정 대본을 대사 구간으로 나눠주세요.</p>}
    </section>

    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-cream text-brand-olive"><Play size={19} /></div><div className="min-w-0 flex-1"><h2 className="font-bold">전체 연속 미리듣기</h2><p className="mt-1 text-xs text-muted-foreground">파일을 합치지 않고 현재 구간 순서대로 이어서 재생합니다.</p></div><button onClick={continuousPlaying ? stopContinuousPreview : startContinuousPreview} disabled={!segments.length || pendingGenerationCount > 0} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-pink px-4 py-2.5 text-sm font-bold disabled:opacity-50">{continuousPlaying ? <Pause size={15} /> : <Play size={15} />}{continuousPlaying ? "재생 중지" : "처음부터 연속 재생"}</button></div>
      <audio ref={continuousAudioRef} onEnded={handleContinuousEnded} className="hidden" />
      {continuousPlaying && <div className="mt-4 rounded-xl bg-stone-50 p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold text-brand-olive">재생 중 {continuousIndex + 1} / {segments.length}</p><p className="truncate text-xs text-muted-foreground">{casts.find((item) => item.id === segments[continuousIndex]?.cast_id)?.character_name || "화자"} · {segments[continuousIndex]?.text}</p></div><div className="mt-3 flex gap-1">{segments.map((item, index) => <span key={item.id} className={`h-1.5 flex-1 rounded-full ${index <= continuousIndex ? "bg-brand-olive" : "bg-border"}`} />)}</div></div>}
    </section>

    <section className={`rounded-2xl border p-5 ${latestRun ? "border-emerald-200 bg-emerald-50" : "border-border bg-white"}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${latestRun ? "bg-white text-emerald-700" : "bg-brand-cream text-brand-olive"}`}><FileAudio size={19} /></div><div className="min-w-0 flex-1"><h2 className="font-bold">최종 통합 TTS · SRT</h2><p className="mt-1 text-xs text-muted-foreground">{latestRun ? `${latestRun.segment_count}개 구간 · ${formatDuration(Number(latestRun.total_duration))} · 최종 확정됨` : pendingGenerationCount > 0 ? `${pendingGenerationCount}개 구간 생성·검수가 남아 있습니다.` : "연속 재생으로 확인한 뒤 최종 결과를 확정하세요."}</p></div><button onClick={finalizeProduction} disabled={finalizing || pendingGenerationCount > 0 || !segments.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{finalizing ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}{finalizing ? "통합 중" : latestRun ? "최종 결과 다시 확정" : "통합 TTS · SRT 확정"}</button></div>
      {latestRun && <div className="mt-4 space-y-4 rounded-xl bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center"><audio controls src={latestRun.combined_audio_url || undefined} className="h-9 max-w-full flex-1" /><div className="flex flex-wrap gap-2"><button onClick={downloadFinalAudio} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-800"><Download size={13} /> 최종 WAV</button><button onClick={() => downloadText(`${safeFileName(projectTitle)}_자막.srt`, editableFinalSrt)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white"><Download size={13} /> 최종 SRT</button></div></div>
        <div className="border-t border-border pt-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold">최종 SRT 수정</p><p className="mt-1 text-[11px] text-muted-foreground">자막 문장을 수정한 뒤 저장하면 번호와 시간코드를 제외한 내용이 캐릭터 제작용 최종 대본이 됩니다.</p></div><button onClick={saveEditedSrtAsScript} disabled={finalizing || !editableFinalSrt.trim()} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-brand-olive px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{finalizing ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} SRT 저장 · 대본 반영</button></div><textarea value={editableFinalSrt} onChange={(event) => setEditableFinalSrt(event.target.value)} spellCheck={false} className="mt-3 min-h-64 w-full rounded-xl border border-border bg-stone-50 p-4 font-mono text-xs leading-5 outline-none focus:border-brand-olive" /></div>
      </div>}
      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-dashed border-border bg-white/70 p-4 sm:flex-row sm:items-center"><FolderOpen size={18} className="shrink-0 text-brand-olive" /><div className="min-w-0 flex-1"><p className="text-sm font-bold">내 컴퓨터 프로젝트 폴더</p><p className="mt-1 truncate text-xs text-muted-foreground">{projectFolder ? `${projectFolder.name} · 사운드/영상/캐릭터 폴더 사용` : "Chrome 또는 Edge에서 프로젝트 폴더를 연결하세요."}</p></div><button onClick={connectProjectFolder} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold"><FolderOpen size={13} /> {projectFolder ? "폴더 변경" : "폴더 연결"}</button><button onClick={saveFinalToProjectFolder} disabled={!projectFolder || !latestRun?.combined_audio_url || savingToFolder} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-olive px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{savingToFolder ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} 프로젝트 폴더에 저장</button></div>
    </section>
    {latestRun && <Link href={`/studio/shorts-story/projects/${projectId}/characters`} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-pink px-4 py-3 text-sm font-bold"><ImageIcon size={16} /> 최종 대본으로 캐릭터 제작하기</Link>}
  </div>;
}
