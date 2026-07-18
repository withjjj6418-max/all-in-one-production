"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download, FileAudio, FileText, Loader2, Mic2, Play, SlidersHorizontal, Sparkles, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { wordsToSrt, type WordTimestamp } from "@/lib/subtitles";

type Voice = {
  voice_id: string;
  voice_name: string;
  models: Array<{ version: string; emotions: string[] }>;
  gender: "male" | "female" | null;
  age: string | null;
  use_cases: string[];
};
type Generation = {
  id: string;
  voice_name: string;
  emotion: string;
  audio_format: string;
  audio_url: string;
  audio_duration: number;
  subtitle_srt: string;
  created_at: string;
};
type TypecastResult = {
  audio?: string;
  audio_format?: "mp3" | "wav";
  audio_duration?: number;
  words?: WordTimestamp[] | null;
  error?: string;
};

const emotionLabels: Record<string, string> = {
  normal: "기본", happy: "기쁨", sad: "슬픔", angry: "화남", whisper: "속삭임", toneup: "밝게", tonedown: "차분하게",
};

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

function formatDuration(value: number) {
  const minutes = Math.floor(value / 60);
  return `${minutes}:${String(Math.round(value % 60)).padStart(2, "0")}`;
}

export default function StoryVoicePage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState("사연 프로젝트");
  const [text, setText] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [emotion, setEmotion] = useState("normal");
  const [tempo, setTempo] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [audioFormat, setAudioFormat] = useState<"mp3" | "wav">("mp3");
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [schemaReady, setSchemaReady] = useState(true);
  const [typecastReady, setTypecastReady] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active || !user) return;
      setUserId(user.id);
      const [projectRes, scriptRes, settingsRes, generationsRes, voicesRes] = await Promise.all([
        supabase.from("projects").select("title").eq("id", projectId).single(),
        supabase.from("scripts").select("content").eq("project_id", projectId).maybeSingle(),
        supabase.from("story_tts_settings").select("*").eq("project_id", projectId).maybeSingle(),
        supabase.from("story_tts_generations").select("id, voice_name, emotion, audio_format, audio_url, audio_duration, subtitle_srt, created_at").eq("project_id", projectId).order("created_at", { ascending: false }),
        fetch("/api/typecast/voices").then(async (response) => ({ ok: response.ok, status: response.status, payload: await response.json() as { voices?: Voice[]; error?: string; code?: string } })),
      ]);
      if (!active) return;
      setProjectTitle(projectRes.data?.title || "사연 프로젝트");
      setText(scriptRes.data?.content || "");
      if (settingsRes.error?.code === "42P01" || settingsRes.error?.code === "PGRST205" || generationsRes.error?.code === "42P01" || generationsRes.error?.code === "PGRST205") {
        setSchemaReady(false);
      } else {
        setGenerations((generationsRes.data ?? []) as Generation[]);
        if (settingsRes.data) {
          setVoiceId(settingsRes.data.voice_id || "");
          setEmotion(settingsRes.data.emotion || "normal");
          setTempo(Number(settingsRes.data.tempo) || 1);
          setPitch(Number(settingsRes.data.pitch) || 0);
          setAudioFormat(settingsRes.data.audio_format === "wav" ? "wav" : "mp3");
        }
      }
      if (!voicesRes.ok) {
        if (voicesRes.payload.code === "KEY_MISSING") setTypecastReady(false);
        else setError(voicesRes.payload.error || "목소리 목록을 가져오지 못했습니다.");
      } else {
        const list = voicesRes.payload.voices ?? [];
        setVoices(list);
        setVoiceId((current) => current || list[0]?.voice_id || "");
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [projectId, supabase]);

  const selectedVoice = voices.find((voice) => voice.voice_id === voiceId);
  const availableEmotions = selectedVoice?.models.find((model) => model.version === "ssfm-v30")?.emotions ?? ["normal"];

  const saveSettings = async () => {
    if (!userId) return false;
    const { error: saveError } = await supabase.from("story_tts_settings").upsert({
      project_id: projectId, user_id: userId, voice_id: voiceId, voice_name: selectedVoice?.voice_name || voiceId,
      model: "ssfm-v30", emotion, audio_format: audioFormat, tempo, pitch, updated_at: new Date().toISOString(),
    }, { onConflict: "project_id" });
    if (saveError) { setError("TTS 설정 저장에 실패했습니다."); return false; }
    return true;
  };

  const generate = async () => {
    setError(null); setNotice(null);
    if (!userId || !voiceId || !text.trim()) return setError("대본과 목소리를 확인해주세요.");
    if (text.trim().length > 2000) return setError("현재 Typecast 생성은 2,000자까지 지원합니다. 대본을 줄이거나 나눠주세요.");
    setGenerating(true);
    try {
      if (!await saveSettings()) return;
      const response = await fetch("/api/typecast/generate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, text, voiceId, emotion, tempo, pitch, audioFormat }),
      });
      const payload = await response.json() as TypecastResult;
      if (!response.ok || !payload.audio || !payload.audio_duration || !payload.audio_format) throw new Error(payload.error || "음성을 생성하지 못했습니다.");
      const srt = wordsToSrt(payload.words ?? []);
      const blob = base64ToBlob(payload.audio, payload.audio_format);
      const filename = `${crypto.randomUUID()}.${payload.audio_format}`;
      const storagePath = `${userId}/${projectId}/${filename}`;
      const { error: uploadError } = await supabase.storage.from("story-audio").upload(storagePath, blob, { contentType: blob.type, upsert: false });
      if (uploadError) throw new Error("생성된 음성을 저장하지 못했습니다. Storage 마이그레이션을 확인해주세요.");
      const { data: publicUrl } = supabase.storage.from("story-audio").getPublicUrl(storagePath);
      const voiceName = selectedVoice?.voice_name || voiceId;
      const { data: saved, error: saveError } = await supabase.from("story_tts_generations").insert({
        project_id: projectId, user_id: userId, script_snapshot: text.trim(), voice_id: voiceId, voice_name: voiceName,
        model: "ssfm-v30", emotion, audio_format: payload.audio_format, audio_url: publicUrl.publicUrl,
        audio_duration: payload.audio_duration, subtitle_srt: srt, timestamps: payload.words ?? [],
      }).select("id, voice_name, emotion, audio_format, audio_url, audio_duration, subtitle_srt, created_at").single();
      if (saveError || !saved) throw new Error("음성 생성 기록 저장에 실패했습니다.");
      await supabase.from("post_sounds").insert({
        project_id: projectId, user_id: userId, title: `${projectTitle} 내레이션`, url: publicUrl.publicUrl,
        source: "Typecast API", duration_seconds: Math.round(payload.audio_duration), memo: `자동 생성 · ${voiceName}`, type: "나레이션", status: "done",
      });
      setGenerations((current) => [saved as Generation, ...current]);
      setNotice("음성과 SRT 자막을 생성했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "음성 생성 중 오류가 발생했습니다.");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-brand-olive" /></div>;
  if (!schemaReady) return <SetupNotice projectId={projectId} message="20260718_story_tts.sql 마이그레이션을 Supabase에서 실행해주세요." />;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><Link href={`/studio/shorts-story/projects/${projectId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-brand-olive"><ArrowLeft size={15} /> 워크벤치</Link><h1 className="mt-3 text-2xl font-bold sm:text-3xl">TTS · 자동 자막</h1><p className="mt-1 text-sm text-muted-foreground">{projectTitle}</p></div><Link href={`/studio/shorts-story/projects/${projectId}/voice/cast`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-pink px-4 py-2.5 text-sm font-bold"><Users size={15} /> 캐릭터별 목소리</Link></div>
      {!typecastReady && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">`.env.local`에 TYPECAST_API_KEY를 추가하고 개발 서버를 재시작해주세요.</div>}
      {(error || notice) && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{error || notice}</div>}

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><div className="flex items-center gap-2"><FileText size={18} className="text-brand-olive" /><h2 className="font-bold">확정 대본</h2></div><span className={`text-xs font-bold ${text.length > 2000 ? "text-red-600" : "text-muted-foreground"}`}>{text.length.toLocaleString()} / 2,000자</span></div>
          <textarea value={text} onChange={(event) => setText(event.target.value)} className="mt-4 min-h-[510px] w-full resize-y rounded-xl border border-border p-4 text-sm leading-7 outline-none focus:border-brand-olive" placeholder="대본 수정 화면에서 확정한 대본이 자동으로 표시됩니다." />
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><Mic2 size={18} className="text-brand-olive" /><h2 className="font-bold">Typecast 설정</h2></div>
            <label className="mt-4 block text-xs font-bold text-muted-foreground">목소리</label>
            <select value={voiceId} onChange={(event) => { setVoiceId(event.target.value); setEmotion("normal"); }} disabled={!typecastReady} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-brand-olive"><option value="">목소리 선택</option>{voices.map((voice) => <option key={voice.voice_id} value={voice.voice_id}>{voice.voice_name} · {voice.gender === "female" ? "여성" : voice.gender === "male" ? "남성" : "기타"}</option>)}</select>
            <label className="mt-4 block text-xs font-bold text-muted-foreground">감정</label>
            <div className="mt-2 flex flex-wrap gap-2">{availableEmotions.map((item) => <button key={item} onClick={() => setEmotion(item)} className={`rounded-lg border px-3 py-2 text-xs font-bold ${emotion === item ? "border-brand-olive bg-brand-cream text-brand-olive-dark" : "border-border text-muted-foreground"}`}>{emotionLabels[item] || item}</button>)}</div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <label className="text-xs font-bold text-muted-foreground">속도 {tempo.toFixed(1)}x<input type="range" min="0.5" max="2" step="0.1" value={tempo} onChange={(event) => setTempo(Number(event.target.value))} className="mt-2 w-full accent-brand-olive" /></label>
              <label className="text-xs font-bold text-muted-foreground">피치 {pitch > 0 ? "+" : ""}{pitch}<input type="range" min="-12" max="12" step="1" value={pitch} onChange={(event) => setPitch(Number(event.target.value))} className="mt-2 w-full accent-brand-olive" /></label>
            </div>
            <div className="mt-4 flex gap-2">{(["mp3", "wav"] as const).map((format) => <button key={format} onClick={() => setAudioFormat(format)} className={`flex-1 rounded-lg border py-2 text-xs font-bold uppercase ${audioFormat === format ? "border-brand-olive bg-brand-cream text-brand-olive-dark" : "border-border text-muted-foreground"}`}>{format}</button>)}</div>
            <button onClick={generate} disabled={generating || !typecastReady || !voiceId || !text.trim()} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-olive text-sm font-bold text-white shadow-sm hover:bg-brand-olive-dark disabled:cursor-not-allowed disabled:opacity-50">{generating ? <><Loader2 size={16} className="animate-spin" />음성과 자막 생성 중...</> : <><Sparkles size={16} />음성 + SRT 생성</>}</button>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">생성 시 Typecast 크레딧이 사용됩니다.</p>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><FileAudio size={18} className="text-brand-olive" /><h2 className="font-bold">생성 기록</h2><span className="text-xs font-bold text-muted-foreground">{generations.length}개</span></div>
        {generations.length === 0 ? <p className="mt-4 rounded-xl bg-muted/50 p-8 text-center text-sm text-muted-foreground">아직 생성된 음성이 없습니다.</p> : <div className="mt-4 space-y-3">{generations.map((item) => <div key={item.id} className="rounded-xl border border-border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-cream text-brand-olive"><Play size={16} /></div><div className="min-w-0 flex-1"><p className="text-sm font-bold">{item.voice_name} · {emotionLabels[item.emotion] || item.emotion}</p><p className="mt-1 text-xs text-muted-foreground">{formatDuration(Number(item.audio_duration))} · {item.audio_format.toUpperCase()} · {new Date(item.created_at).toLocaleString("ko-KR")}</p></div><audio controls src={item.audio_url} className="h-9 max-w-full sm:w-72" /></div><div className="mt-3 flex justify-end gap-2"><a href={item.audio_url} download className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold"><Download size={13} /> 음성</a><button onClick={() => downloadText(`${projectTitle}_자막.srt`, item.subtitle_srt)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-pink px-3 py-2 text-xs font-bold"><Download size={13} /> SRT 자막</button></div></div>)}</div>}
      </section>
    </div>
  );
}

function SetupNotice({ projectId, message }: { projectId: number; message: string }) {
  return <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-7 shadow-sm"><div className="flex items-center gap-2"><SlidersHorizontal className="text-amber-600" /><h1 className="text-lg font-bold">TTS 데이터 설정이 필요합니다</h1></div><p className="mt-3 text-sm text-muted-foreground">{message}</p><Link href={`/studio/shorts-story/projects/${projectId}`} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-brand-olive"><ArrowLeft size={15} /> 워크벤치로 돌아가기</Link></div>;
}
