"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type ClipboardEvent } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { useParams } from "next/navigation";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ClipboardPaste, Copy, Download,
  ExternalLink, ImageIcon, Loader2, PanelsTopLeft, Plus, Save, ShieldCheck,
  Sparkles, Trash2, Upload,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  buildJapanStorySceneAnalysisPrompt,
  JAPAN_HORROR_ILLUSTRATION_STYLE,
  JAPAN_HORROR_SAFETY_PROMPT,
  JAPAN_STORY_SCENE_RESOLUTION,
  normalizeJapanStorySceneStylePrompt,
  parseJapanStorySceneResult,
  withJapanStorySceneResolution,
  type JapanStoryScene,
} from "@/lib/japan-longform-scenes";

type VoiceSegment = {
  section_title: string;
  text: string;
  audio_duration: number | null;
};

type Message = { kind: "error" | "notice"; text: string };

const VISUAL_BUCKET = "japan-longform-visuals";

function imageExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension && ["png", "jpg", "jpeg", "webp"].includes(extension)) return extension === "jpeg" ? "jpg" : extension;
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/jpeg") return "jpg";
  return "png";
}

function formatTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remaining = value % 60;
  return [hours, minutes, remaining].map((part) => String(part).padStart(2, "0")).join(":");
}

function newScene(projectId: number, userId: string, sortOrder: number): JapanStoryScene {
  return {
    id: crypto.randomUUID(),
    project_id: projectId,
    user_id: userId,
    sort_order: sortOrder,
    scene_title: "새 장면",
    source_excerpt: "",
    insertion_seconds: 0,
    characters: [],
    location: "",
    scene_action: "",
    camera_direction: "",
    horror_level: 2,
    safety_status: "safe",
    safety_note: "",
    scene_prompt: JAPAN_STORY_SCENE_RESOLUTION,
    status: "draft",
    image_url: null,
    storage_path: null,
  };
}

function addTimings(source: VoiceSegment[]) {
  return source.reduce<{
    rows: Array<VoiceSegment & { start_seconds: number; end_seconds: number }>;
    offset: number;
  }>((result, segment) => {
    const duration = Math.max(1, Number(segment.audio_duration) || segment.text.length / 7);
    return {
      rows: [...result.rows, { ...segment, start_seconds: result.offset, end_seconds: result.offset + duration }],
      offset: result.offset + duration,
    };
  }, { rows: [], offset: 0 }).rows;
}

export default function JapanLongformScenesPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const supabase = useMemo(() => createClient(), []);
  const [projectTitle, setProjectTitle] = useState("");
  const [userId, setUserId] = useState("");
  const [script, setScript] = useState("");
  const [voiceSegments, setVoiceSegments] = useState<VoiceSegment[]>([]);
  const [scenes, setScenes] = useState<JapanStoryScene[]>([]);
  const [stylePrompt, setStylePrompt] = useState(JAPAN_HORROR_ILLUSTRATION_STYLE);
  const [safetyPrompt, setSafetyPrompt] = useState(JAPAN_HORROR_SAFETY_PROMPT);
  const [sceneCount, setSceneCount] = useState(5);
  const [gptResult, setGptResult] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingSceneId, setUploadingSceneId] = useState<string | null>(null);
  const [schemaReady, setSchemaReady] = useState(true);
  const [message, setMessage] = useState<Message | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        setMessage({ kind: "error", text: "로그인이 필요합니다." });
        setLoading(false);
        return;
      }
      setUserId(user.id);
      const [projectRes, scriptRes, segmentsRes, settingsRes, scenesRes] = await Promise.all([
        supabase.from("projects").select("title").eq("id", projectId).eq("production_type", "longform_japan").maybeSingle(),
        supabase.from("japan_longform_scripts").select("verified_japanese").eq("project_id", projectId).maybeSingle(),
        supabase.from("japan_longform_voice_segments").select("section_title, text, audio_duration").eq("project_id", projectId).order("sort_order"),
        supabase.from("japan_longform_scene_settings").select("style_prompt, safety_prompt, target_scene_count").eq("project_id", projectId).maybeSingle(),
        supabase.from("japan_longform_story_scenes").select("*").eq("project_id", projectId).order("sort_order"),
      ]);
      if (!active) return;
      setProjectTitle(projectRes.data?.title || "일본 롱폼 프로젝트");
      setScript(scriptRes.data?.verified_japanese || "");
      setVoiceSegments((segmentsRes.data || []) as VoiceSegment[]);
      if (settingsRes.data) {
        setStylePrompt(normalizeJapanStorySceneStylePrompt(settingsRes.data.style_prompt));
        setSafetyPrompt(settingsRes.data.safety_prompt || JAPAN_HORROR_SAFETY_PROMPT);
        setSceneCount(settingsRes.data.target_scene_count || 5);
      }
      setScenes(((scenesRes.data || []) as JapanStoryScene[]).map((scene) => ({
        ...scene,
        scene_prompt: withJapanStorySceneResolution(scene.scene_prompt),
      })));
      const sceneSchemaReady = !settingsRes.error && !scenesRes.error;
      setSchemaReady(sceneSchemaReady);
      if (projectRes.error || scriptRes.error || segmentsRes.error) {
        setMessage({ kind: "error", text: "프로젝트 대본 또는 TTS 구간을 모두 불러오지 못했습니다." });
      } else if (!sceneSchemaReady) {
        setMessage({ kind: "error", text: "장면 일러스트 테이블이 아직 준비되지 않았습니다." });
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [projectId, supabase]);

  const timedSegments = useMemo(() => {
    const source = voiceSegments.length
      ? voiceSegments
      : script.trim()
        ? [{ section_title: "최종 일본어 대본", text: script, audio_duration: null }]
        : [];
    return addTimings(source);
  }, [script, voiceSegments]);

  const analysisPrompt = useMemo(() => buildJapanStorySceneAnalysisPrompt({
    projectTitle,
    sceneCount,
    segments: timedSegments,
  }), [projectTitle, sceneCount, timedSegments]);

  function updateScene(sceneId: string, values: Partial<JapanStoryScene>) {
    setScenes((current) => current.map((scene) => scene.id === sceneId ? { ...scene, ...values } : scene));
  }

  async function saveSettings() {
    if (!userId || !schemaReady) return;
    setSaving(true);
    const { error } = await supabase.from("japan_longform_scene_settings").upsert({
      project_id: projectId,
      user_id: userId,
      style_prompt: stylePrompt.trim(),
      safety_prompt: safetyPrompt.trim(),
      target_scene_count: sceneCount,
      updated_at: new Date().toISOString(),
    }, { onConflict: "project_id" });
    setSaving(false);
    setMessage(error
      ? { kind: "error", text: "장면 설정을 저장하지 못했습니다." }
      : { kind: "notice", text: "공통 화풍과 안전 기준을 저장했습니다." });
  }

  async function copyAnalysisPrompt(openChatGpt = false) {
    if (!timedSegments.length) return setMessage({ kind: "error", text: "최종 일본어 대본이 없습니다." });
    const chatWindow = openChatGpt ? window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer") : null;
    try {
      await navigator.clipboard.writeText(analysisPrompt);
      setMessage({ kind: "notice", text: openChatGpt ? "분석 요청문을 복사하고 ChatGPT를 열었습니다. 나온 JSON을 아래에 붙여넣으세요." : "장면 분석 요청문을 복사했습니다." });
    } catch {
      chatWindow?.close();
      setMessage({ kind: "error", text: "클립보드 복사에 실패했습니다." });
    }
  }

  async function applyGptResult() {
    if (!userId || !schemaReady) return;
    try {
      const parsed = parseJapanStorySceneResult(gptResult);
      if (scenes.length && !window.confirm("현재 장면 목록을 GPT 분석 결과로 교체할까요?")) return;
      setSaving(true);
      const payload = parsed.map((scene, index) => ({
        ...scene,
        id: crypto.randomUUID(),
        project_id: projectId,
        user_id: userId,
        sort_order: index,
      }));
      const { data, error } = await supabase.from("japan_longform_story_scenes").insert(payload).select("*").order("sort_order");
      if (error) throw error;
      const previousIds = scenes.map((scene) => scene.id);
      if (previousIds.length) {
        const deleteResult = await supabase.from("japan_longform_story_scenes").delete().in("id", previousIds);
        if (deleteResult.error) {
          await supabase.from("japan_longform_story_scenes").delete().in("id", payload.map((scene) => scene.id));
          throw deleteResult.error;
        }
      }
      await supabase.from("japan_longform_scene_settings").upsert({
        project_id: projectId,
        user_id: userId,
        style_prompt: stylePrompt.trim(),
        safety_prompt: safetyPrompt.trim(),
        target_scene_count: sceneCount,
        updated_at: new Date().toISOString(),
      }, { onConflict: "project_id" });
      setScenes((data || []) as JapanStoryScene[]);
      setMessage({ kind: "notice", text: `${payload.length}개 장면을 카드로 만들었습니다. 원하는 장면을 수정·삭제·삽입한 뒤 저장하세요.` });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "GPT 결과를 장면 카드로 변환하지 못했습니다." });
    } finally {
      setSaving(false);
    }
  }

  async function saveScenes() {
    if (!userId || !schemaReady || !scenes.length) return;
    setSaving(true);
    const payload = scenes.map((scene, index) => ({
      ...scene,
      project_id: projectId,
      user_id: userId,
      sort_order: index,
      scene_title: scene.scene_title.trim() || `장면 ${index + 1}`,
      scene_prompt: withJapanStorySceneResolution(scene.scene_prompt),
      updated_at: new Date().toISOString(),
    }));
    const { data, error } = await supabase.from("japan_longform_story_scenes").upsert(payload).select("*").order("sort_order");
    setSaving(false);
    if (error) return setMessage({ kind: "error", text: "장면 목록을 저장하지 못했습니다." });
    setScenes((data || []) as JapanStoryScene[]);
    setMessage({ kind: "notice", text: "장면 순서와 수정 내용을 저장했습니다." });
  }

  function addScene(afterIndex: number) {
    const next = [...scenes];
    next.splice(afterIndex + 1, 0, newScene(projectId, userId, afterIndex + 1));
    setScenes(next.map((scene, index) => ({ ...scene, sort_order: index })));
  }

  async function deleteScene(scene: JapanStoryScene) {
    if (!window.confirm(`“${scene.scene_title}” 장면을 삭제할까요?`)) return;
    const { error } = await supabase.from("japan_longform_story_scenes").delete().eq("id", scene.id);
    if (error) return setMessage({ kind: "error", text: "장면을 삭제하지 못했습니다." });
    if (scene.storage_path) await supabase.storage.from(VISUAL_BUCKET).remove([scene.storage_path]);
    setScenes((current) => current.filter((item) => item.id !== scene.id).map((item, index) => ({ ...item, sort_order: index })));
  }

  function moveScene(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= scenes.length) return;
    const next = [...scenes];
    [next[index], next[target]] = [next[target], next[index]];
    setScenes(next.map((scene, sortOrder) => ({ ...scene, sort_order: sortOrder })));
  }

  async function copyFinalPrompt(scene: JapanStoryScene) {
    const characterLine = scene.characters.length ? `Characters: ${scene.characters.join(", ")}.` : "";
    const removeResolution = (value: string) => value
      .replace(/^\s*1920\s*(?:x|×|\*)\s*1080\s*pixels,\s*16:9\s*widescreen\s*composition\.\s*/i, "")
      .trim();
    const prompt = [
      JAPAN_STORY_SCENE_RESOLUTION,
      removeResolution(stylePrompt),
      characterLine,
      removeResolution(scene.scene_prompt),
      safetyPrompt.trim(),
    ].filter(Boolean).join("\n\n");
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage({ kind: "notice", text: `“${scene.scene_title}” 이미지 프롬프트를 복사했습니다.` });
    } catch {
      setMessage({ kind: "error", text: "프롬프트 복사에 실패했습니다." });
    }
  }

  async function uploadSceneImage(scene: JapanStoryScene, file: File) {
    if (!userId || !schemaReady) return;
    if (!file.type.startsWith("image/")) return setMessage({ kind: "error", text: "PNG, JPG 또는 WEBP 이미지를 올려주세요." });
    if (file.size > 20 * 1024 * 1024) return setMessage({ kind: "error", text: "장면 이미지는 20MB 이하만 저장할 수 있습니다." });
    setUploadingSceneId(scene.id);
    setMessage(null);
    const extension = imageExtension(file);
    const storagePath = `${userId}/${projectId}/story-scenes/${scene.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    try {
      const { error: uploadError } = await supabase.storage.from(VISUAL_BUCKET).upload(storagePath, file, {
        contentType: file.type || `image/${extension}`,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const imageUrl = supabase.storage.from(VISUAL_BUCKET).getPublicUrl(storagePath).data.publicUrl;
      const { data, error } = await supabase.from("japan_longform_story_scenes").upsert({
        ...scene,
        project_id: projectId,
        user_id: userId,
        scene_prompt: withJapanStorySceneResolution(scene.scene_prompt),
        image_url: imageUrl,
        storage_path: storagePath,
        status: "generated",
        updated_at: new Date().toISOString(),
      }).select("*").single();
      if (error) {
        await supabase.storage.from(VISUAL_BUCKET).remove([storagePath]);
        throw error;
      }
      if (scene.storage_path && scene.storage_path !== storagePath) {
        await supabase.storage.from(VISUAL_BUCKET).remove([scene.storage_path]);
      }
      setScenes((current) => current.map((item) => item.id === scene.id ? data as JapanStoryScene : item));
      setMessage({ kind: "notice", text: `“${scene.scene_title}” 이미지를 프로젝트에 저장했습니다.` });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "장면 이미지를 저장하지 못했습니다." });
    } finally {
      setUploadingSceneId(null);
    }
  }

  function pasteSceneImage(scene: JapanStoryScene, event: ClipboardEvent<HTMLDivElement>) {
    const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"));
    const file = imageItem?.getAsFile();
    if (!file) return setMessage({ kind: "error", text: "클립보드에 복사된 이미지가 없습니다." });
    event.preventDefault();
    void uploadSceneImage(scene, file);
  }

  function chooseSceneImage(scene: JapanStoryScene, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void uploadSceneImage(scene, file);
  }

  async function removeSceneImage(scene: JapanStoryScene) {
    if (!scene.image_url || !window.confirm(`“${scene.scene_title}” 이미지를 삭제할까요?`)) return;
    const { error } = await supabase.from("japan_longform_story_scenes").update({
      image_url: null,
      storage_path: null,
      status: "approved",
      updated_at: new Date().toISOString(),
    }).eq("id", scene.id);
    if (error) return setMessage({ kind: "error", text: "장면 이미지 연결을 삭제하지 못했습니다." });
    if (scene.storage_path) await supabase.storage.from(VISUAL_BUCKET).remove([scene.storage_path]);
    updateScene(scene.id, { image_url: null, storage_path: null, status: "approved" });
    setMessage({ kind: "notice", text: "장면 이미지를 삭제했습니다." });
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-sky-700" /></div>;

  return <div className="mx-auto max-w-7xl space-y-5">
    <Link href={`/studio/longform-japan/projects/${projectId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-sky-700"><ArrowLeft size={16} /> 워크벤치</Link>
    <header><p className="text-sm font-bold text-sky-700">{projectTitle}</p><h1 className="mt-1 flex items-center gap-2 text-3xl font-bold"><PanelsTopLeft className="text-sky-700" /> 주요 장면 일러스트</h1><p className="mt-2 text-sm text-muted-foreground">API 없이 분석 요청문을 ChatGPT에 붙여넣고, 나온 JSON을 편집 가능한 장면 카드로 바꿉니다.</p></header>
    {message && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${message.kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{message.text}</div>}
    {!schemaReady && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">Supabase에서 `20260723_longform_japan_story_scenes.sql`을 먼저 실행해주세요.</div>}

    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex items-center gap-2"><ShieldCheck size={19} className="text-sky-700" /><h2 className="font-bold">작품 공통 기준</h2></div><p className="mt-1 text-xs text-muted-foreground">화풍은 모든 장면에 공통 적용하며, 안전 기준은 직접적인 공포 묘사를 막습니다.</p></div><button onClick={saveSettings} disabled={saving || !schemaReady} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-sky-700 px-4 text-sm font-bold text-sky-700 disabled:opacity-40"><Save size={15} /> 설정 저장</button></div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2"><label className="text-sm font-bold">공통 이미지 스타일<textarea value={stylePrompt} onChange={(event) => setStylePrompt(event.target.value)} className="mt-2 min-h-64 w-full resize-y rounded-xl border border-border p-4 text-xs leading-6 outline-none focus:border-sky-600" /></label><label className="text-sm font-bold">YouTube 안전 연출 기준<textarea value={safetyPrompt} onChange={(event) => setSafetyPrompt(event.target.value)} className="mt-2 min-h-64 w-full resize-y rounded-xl border border-border p-4 text-xs leading-6 outline-none focus:border-sky-600" /></label></div>
    </section>

    <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">수동 GPT 분석</span><h2 className="mt-3 text-xl font-bold">중요 장면 초안 만들기</h2><p className="mt-1 text-sm text-muted-foreground">최종 일본어 대본과 TTS 시간 정보를 분석 요청문에 포함합니다. OpenAI API 키는 사용하지 않습니다.</p></div><label className="flex items-center gap-2 text-sm font-bold">장면 수<select value={sceneCount} onChange={(event) => setSceneCount(Number(event.target.value))} className="h-10 rounded-xl border border-border bg-white px-3">{[3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count}장</option>)}</select></label></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><button onClick={() => copyAnalysisPrompt(false)} disabled={!timedSegments.length} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-violet-300 text-sm font-bold text-violet-700 disabled:opacity-40"><Copy size={16} /> 분석 프롬프트만 복사</button><button onClick={() => copyAnalysisPrompt(true)} disabled={!timedSegments.length} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-700 text-sm font-bold text-white disabled:opacity-40"><ExternalLink size={16} /> 복사하고 ChatGPT 열기</button></div>
      <label className="mt-5 block text-sm font-bold">ChatGPT JSON 결과 붙여넣기<textarea value={gptResult} onChange={(event) => setGptResult(event.target.value)} placeholder='{"scenes":[{"scene_title":"..."}]}' className="mt-2 min-h-72 w-full resize-y rounded-xl border border-border bg-stone-50 p-4 font-mono text-xs leading-6 outline-none focus:border-violet-500" /></label>
      <button onClick={applyGptResult} disabled={saving || !schemaReady || !gptResult.trim()} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-olive text-sm font-bold text-white disabled:opacity-40">{saving ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} 장면 카드로 적용</button>
    </section>

    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold">장면 작업 목록</h2><p className="mt-1 text-xs text-muted-foreground">{scenes.length}개 · 직접 수정, 순서 변경, 사이 삽입이 가능합니다.</p></div><div className="flex gap-2"><button onClick={() => addScene(scenes.length - 1)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold"><Plus size={13} /> 장면 추가</button><button onClick={saveScenes} disabled={saving || !schemaReady || !scenes.length} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} 전체 저장</button></div></div>
      {scenes.length ? <div className="mt-5 space-y-3">{scenes.map((scene, index) => <div key={scene.id}>
        <article className={`rounded-2xl border p-4 sm:p-5 ${scene.safety_status === "safe" ? "border-border" : scene.safety_status === "review" ? "border-amber-300 bg-amber-50/30" : "border-red-300 bg-red-50/30"}`}>
          <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sm font-bold text-sky-700">{index + 1}</span><div className="min-w-0 flex-1 space-y-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_150px_140px]"><label className="text-xs font-bold text-muted-foreground">장면 제목<input value={scene.scene_title} onChange={(event) => updateScene(scene.id, { scene_title: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-bold text-foreground outline-none focus:border-sky-600" /></label><label className="text-xs font-bold text-muted-foreground">삽입 시각 · 초<input type="number" min={0} value={scene.insertion_seconds} onChange={(event) => updateScene(scene.id, { insertion_seconds: Math.max(0, Number(event.target.value) || 0) })} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground" /><span className="mt-1 block">{formatTime(scene.insertion_seconds)}</span></label><label className="text-xs font-bold text-muted-foreground">검수 상태<select value={scene.status} onChange={(event) => updateScene(scene.id, { status: event.target.value as JapanStoryScene["status"] })} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-white px-2 text-sm text-foreground"><option value="draft">초안</option><option value="approved">승인</option><option value="generated">이미지 생성</option></select></label></div>
            <label className="block text-xs font-bold text-muted-foreground">대본 근거 구절<textarea value={scene.source_excerpt} onChange={(event) => updateScene(scene.id, { source_excerpt: event.target.value })} className="mt-1.5 min-h-24 w-full rounded-xl border border-border bg-white p-3 text-sm leading-6 text-foreground outline-none focus:border-sky-600" /></label>
            <div className="grid gap-3 md:grid-cols-2"><label className="text-xs font-bold text-muted-foreground">등장인물 · 쉼표로 구분<input value={scene.characters.join(", ")} onChange={(event) => updateScene(scene.id, { characters: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground" /></label><label className="text-xs font-bold text-muted-foreground">장소<input value={scene.location} onChange={(event) => updateScene(scene.id, { location: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground" /></label><label className="text-xs font-bold text-muted-foreground">장면 행동<textarea value={scene.scene_action} onChange={(event) => updateScene(scene.id, { scene_action: event.target.value })} className="mt-1.5 min-h-24 w-full rounded-xl border border-border bg-white p-3 text-sm leading-6 text-foreground" /></label><label className="text-xs font-bold text-muted-foreground">구도 · 카메라<textarea value={scene.camera_direction} onChange={(event) => updateScene(scene.id, { camera_direction: event.target.value })} className="mt-1.5 min-h-24 w-full rounded-xl border border-border bg-white p-3 text-sm leading-6 text-foreground" /></label></div>
            <div className="grid gap-3 md:grid-cols-3"><label className="text-xs font-bold text-muted-foreground">공포 수위<select value={scene.horror_level} onChange={(event) => updateScene(scene.id, { horror_level: Number(event.target.value) as 1 | 2 | 3 })} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-white px-2 text-sm text-foreground"><option value={1}>1 · 은은함</option><option value={2}>2 · 긴장감</option><option value={3}>3 · 강한 암시</option></select></label><label className="text-xs font-bold text-muted-foreground">안전 상태<select value={scene.safety_status} onChange={(event) => updateScene(scene.id, { safety_status: event.target.value as JapanStoryScene["safety_status"] })} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-white px-2 text-sm text-foreground"><option value="safe">안전</option><option value="review">검토 필요</option><option value="replace">대체 필요</option></select></label><label className="text-xs font-bold text-muted-foreground">안전 연출 메모<input value={scene.safety_note} onChange={(event) => updateScene(scene.id, { safety_note: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground" /></label></div>
            <label className="block text-xs font-bold text-muted-foreground">장면별 영어 프롬프트<textarea value={scene.scene_prompt} onChange={(event) => updateScene(scene.id, { scene_prompt: event.target.value })} className="mt-1.5 min-h-32 w-full rounded-xl border border-border bg-white p-3 text-sm leading-6 text-foreground outline-none focus:border-sky-600" /></label>
            <button onClick={() => copyFinalPrompt(scene)} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-sky-300 bg-sky-50 text-sm font-bold text-sky-700"><Copy size={15} /> 공통 화풍 + 장면 + 안전 프롬프트 복사</button>
            <div
              tabIndex={0}
              onPaste={(event) => pasteSceneImage(scene, event)}
              className="rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-3 outline-none transition focus:border-violet-600 focus:ring-2 focus:ring-violet-100"
            >
              {scene.image_url ? <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px]">
                <div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-black"><NextImage src={scene.image_url} alt={`${scene.scene_title} 장면`} fill unoptimized sizes="(min-width: 1024px) 60vw, 100vw" className="object-contain" /></div>
                <div className="flex flex-col justify-center gap-2"><p className="text-xs font-bold text-violet-800">저장된 장면 이미지</p><p className="text-[11px] leading-5 text-muted-foreground">이 영역을 클릭한 뒤 새 이미지를 복사해 Ctrl+V하면 교체됩니다.</p><a href={scene.image_url} target="_blank" rel="noreferrer" download className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-white text-xs font-bold"><Download size={13} /> 원본 열기</a><label className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-violet-700 text-xs font-bold text-white"><Upload size={13} /> 파일로 교체<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => chooseSceneImage(scene, event)} /></label><button onClick={() => removeSceneImage(scene)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white text-xs font-bold text-red-600"><Trash2 size={13} /> 이미지 삭제</button></div>
              </div> : <div className="flex flex-col items-center justify-center py-7 text-center"><div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-violet-700 shadow-sm">{uploadingSceneId === scene.id ? <Loader2 size={20} className="animate-spin" /> : <ClipboardPaste size={20} />}</div><p className="mt-3 text-sm font-bold">{uploadingSceneId === scene.id ? "이미지 저장 중" : "클릭한 뒤 Ctrl+V로 이미지 붙여넣기"}</p><p className="mt-1 text-xs text-muted-foreground">또는 PNG · JPG · WEBP 파일을 선택하세요.</p><label className="mt-3 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-violet-700 px-4 text-xs font-bold text-white"><ImageIcon size={13} /> 파일 올리기<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploadingSceneId === scene.id} onChange={(event) => chooseSceneImage(scene, event)} /></label></div>}
            </div>
          </div><div className="flex shrink-0 flex-col gap-1"><button onClick={() => moveScene(index, -1)} disabled={index === 0} className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-25"><ArrowUp size={14} /></button><button onClick={() => moveScene(index, 1)} disabled={index === scenes.length - 1} className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-25"><ArrowDown size={14} /></button><button onClick={() => deleteScene(scene)} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button></div></div>
        </article>
        <div className="flex items-center gap-2 py-2"><div className="h-px flex-1 bg-border" /><button onClick={() => addScene(index)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-[11px] font-bold text-muted-foreground"><Plus size={11} /> 여기에 장면 삽입</button><div className="h-px flex-1 bg-border" /></div>
      </div>)}</div> : <div className="mt-5 rounded-xl border border-dashed border-border p-10 text-center"><PanelsTopLeft className="mx-auto text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">ChatGPT 분석 결과를 적용하거나 장면을 직접 추가하세요.</p><button onClick={() => addScene(-1)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white"><Plus size={15} /> 첫 장면 추가</button></div>}
    </section>
    {scenes.length > 0 && <Link href={`/studio/longform-japan/projects/${projectId}/motion`} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 text-sm font-bold text-white">루프 영상 단계로 <ArrowRight size={16} /></Link>}
  </div>;
}
