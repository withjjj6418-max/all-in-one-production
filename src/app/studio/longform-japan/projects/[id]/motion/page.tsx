"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Copy, Download, ExternalLink, FolderOpen, Loader2, Save, Sparkles, Trash2, Upload, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getProjectFolderHandle, saveProjectFolderHandle, writeBlobToFolder } from "@/lib/project-folder";

const VISUAL_BUCKET = "japan-longform-visuals";
const GEMINI_URL = "https://gemini.google.com/app";

type VisualAsset = {
  id: string;
  asset_kind: "background" | "loop_video";
  provider: "flow" | "grok" | "gemini" | "manual";
  prompt: string;
  file_name: string;
  storage_path: string | null;
  url: string;
  source_asset_id: string | null;
  created_at: string;
};

type WritableDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission: (options?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission: (options?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
};

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim().slice(0, 90) || "일본롱폼";
}

function videoExtension(fileName: string, mimeType = "") {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension && ["mp4", "mov", "webm"].includes(extension)) return extension;
  if (mimeType === "video/quicktime") return "mov";
  if (mimeType === "video/webm") return "webm";
  return "mp4";
}

export default function JapanLongformMotionPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const supabase = useMemo(() => createClient(), []);
  const [projectTitle, setProjectTitle] = useState("");
  const [userId, setUserId] = useState("");
  const [backgrounds, setBackgrounds] = useState<VisualAsset[]>([]);
  const [videos, setVideos] = useState<VisualAsset[]>([]);
  const [selectedBackgroundId, setSelectedBackgroundId] = useState("");
  const [motionPrompt, setMotionPrompt] = useState("");
  const [projectFolder, setProjectFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "notice"; text: string } | null>(null);

  const selectedBackground = backgrounds.find((item) => item.id === selectedBackgroundId) || backgrounds[0] || null;
  const latestVideo = videos[0] || null;

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) { setMessage({ kind: "error", text: "로그인이 필요합니다." }); setLoading(false); return; }
      setUserId(user.id);
      const [projectResult, assetsResult] = await Promise.all([
        supabase.from("projects").select("title").eq("id", projectId).eq("production_type", "longform_japan").maybeSingle(),
        supabase.from("japan_longform_visual_assets").select("id, asset_kind, provider, prompt, file_name, storage_path, url, source_asset_id, created_at").eq("project_id", projectId).in("asset_kind", ["background", "loop_video"]).order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      setProjectTitle(projectResult.data?.title || "일본 롱폼 프로젝트");
      const assets = (assetsResult.data || []) as VisualAsset[];
      const loadedBackgrounds = assets.filter((item) => item.asset_kind === "background");
      const loadedVideos = assets.filter((item) => item.asset_kind === "loop_video");
      setBackgrounds(loadedBackgrounds);
      setVideos(loadedVideos);
      const initialBackgroundId = loadedVideos[0]?.source_asset_id || loadedBackgrounds[0]?.id || "";
      setSelectedBackgroundId(initialBackgroundId);
      if (loadedVideos[0]?.prompt) setMotionPrompt(loadedVideos[0].prompt);
      if (projectResult.error || assetsResult.error) setMessage({ kind: "error", text: "루프영상 작업 정보를 모두 불러오지 못했습니다." });
      try { setProjectFolder(await getProjectFolderHandle(projectId)); } catch { /* IndexedDB 미지원 */ }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [projectId, supabase]);

  async function generatePrompt() {
    if (!selectedBackground) return setMessage({ kind: "error", text: "Flow 배경 이미지를 먼저 저장해주세요." });
    setGenerating(true);
    setMessage(null);
    try {
      const response = await fetch("/api/longform-japan/motion-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, backgroundAssetId: selectedBackground.id }),
      });
      const result = await response.json() as { prompt?: string; error?: string };
      if (!response.ok || !result.prompt) throw new Error(result.error || "모션 프롬프트를 만들지 못했습니다.");
      setMotionPrompt(result.prompt);
      setMessage({ kind: "notice", text: "선택한 배경에 맞는 미세 움직임 프롬프트를 만들었습니다." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "모션 프롬프트 생성에 실패했습니다." });
    } finally {
      setGenerating(false);
    }
  }

  async function copyPromptAndOpenGemini() {
    if (!motionPrompt.trim()) return setMessage({ kind: "error", text: "모션 프롬프트를 먼저 만들어주세요." });
    const geminiWindow = window.open(GEMINI_URL, "_blank", "noopener,noreferrer");
    try {
      await navigator.clipboard.writeText(motionPrompt);
      setMessage({ kind: "notice", text: "모션 프롬프트를 복사하고 Gemini를 열었습니다. 기준 배경 이미지와 함께 넣으세요." });
    } catch {
      geminiWindow?.close();
      setMessage({ kind: "error", text: "클립보드 복사에 실패했습니다." });
    }
  }

  async function connectProjectFolder() {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) return setMessage({ kind: "error", text: "폴더 연결은 Chrome 또는 Edge에서 사용할 수 있습니다." });
    try {
      const handle = await picker({ id: `japan-longform-${projectId}`, mode: "readwrite" });
      await saveProjectFolderHandle(projectId, handle);
      setProjectFolder(handle);
      setMessage({ kind: "notice", text: `${handle.name} 프로젝트 폴더를 연결했습니다.` });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage({ kind: "error", text: "프로젝트 폴더를 연결하지 못했습니다." });
    }
  }

  async function writeVideoLocally(blob: Blob, extension: string) {
    if (!projectFolder) return false;
    const permission = await (projectFolder as WritableDirectoryHandle).queryPermission({ mode: "readwrite" });
    if (permission !== "granted") return false;
    const videoFolder = await projectFolder.getDirectoryHandle("영상", { create: true });
    await writeBlobToFolder(videoFolder, `${safeFileName(projectTitle)}_무한루프.${extension}`, blob);
    return true;
  }

  async function uploadVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !userId || !selectedBackground) return;
    if (!file.type.startsWith("video/")) return setMessage({ kind: "error", text: "MP4, MOV 또는 WEBM 영상을 선택해주세요." });
    if (!motionPrompt.trim()) return setMessage({ kind: "error", text: "Gemini에서 사용한 모션 프롬프트를 먼저 입력해주세요." });
    setUploading(true);
    setMessage(null);
    try {
      const extension = videoExtension(file.name, file.type);
      const localSaved = await writeVideoLocally(file, extension);
      const path = `${userId}/${projectId}/loop-video/${Date.now()}-${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from(VISUAL_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const url = supabase.storage.from(VISUAL_BUCKET).getPublicUrl(path).data.publicUrl;
      const { data, error: insertError } = await supabase.from("japan_longform_visual_assets").insert({
        project_id: projectId,
        user_id: userId,
        asset_kind: "loop_video",
        provider: "gemini",
        prompt: motionPrompt.trim(),
        file_name: file.name,
        storage_path: path,
        url,
        source_asset_id: selectedBackground.id,
      }).select("id, asset_kind, provider, prompt, file_name, storage_path, url, source_asset_id, created_at").single();
      if (insertError) {
        await supabase.storage.from(VISUAL_BUCKET).remove([path]);
        throw insertError;
      }
      setVideos((current) => [data as VisualAsset, ...current]);
      setMessage({ kind: "notice", text: localSaved ? "루프영상을 프로젝트와 로컬 영상 폴더에 저장했습니다." : "루프영상을 프로젝트에 저장했습니다. ‘폴더 저장’을 누르면 로컬에도 저장됩니다." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "루프영상 저장에 실패했습니다." });
    } finally {
      setUploading(false);
    }
  }

  async function saveVideoLocally() {
    if (!projectFolder || !latestVideo) return setMessage({ kind: "error", text: "프로젝트 폴더와 저장된 루프영상을 확인해주세요." });
    setSaving(true);
    try {
      const permission = await (projectFolder as WritableDirectoryHandle).requestPermission({ mode: "readwrite" });
      if (permission !== "granted") throw new Error("프로젝트 폴더 쓰기 권한을 허용해주세요.");
      const response = await fetch(latestVideo.url);
      if (!response.ok) throw new Error("저장된 루프영상을 불러오지 못했습니다.");
      const saved = await writeVideoLocally(await response.blob(), videoExtension(latestVideo.file_name, response.headers.get("content-type") || ""));
      if (!saved) throw new Error("프로젝트 폴더 쓰기 권한을 허용해주세요.");
      setMessage({ kind: "notice", text: `${projectFolder.name} / 영상 폴더에 저장했습니다.` });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "로컬 폴더 저장에 실패했습니다." });
    } finally {
      setSaving(false);
    }
  }

  async function deleteVideo() {
    if (!latestVideo || !window.confirm("이 루프영상을 프로젝트에서 삭제할까요?")) return;
    const { error } = await supabase.from("japan_longform_visual_assets").delete().eq("id", latestVideo.id);
    if (error) return setMessage({ kind: "error", text: "루프영상 기록을 삭제하지 못했습니다." });
    if (latestVideo.storage_path) await supabase.storage.from(VISUAL_BUCKET).remove([latestVideo.storage_path]);
    setVideos((current) => current.filter((item) => item.id !== latestVideo.id));
    setMessage({ kind: "notice", text: "루프영상을 삭제했습니다. 로컬 파일은 그대로 유지됩니다." });
  }

  if (loading) return <div className="flex min-h-72 items-center justify-center"><Loader2 className="animate-spin text-sky-700" size={28} /></div>;

  return <div className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><Link href={`/studio/longform-japan/projects/${projectId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-sky-700"><ArrowLeft size={15} /> 워크벤치</Link><p className="mt-5 text-sm font-bold text-sky-700">{projectTitle}</p><h1 className="mt-1 flex items-center gap-2 text-3xl font-bold"><Video className="text-sky-700" /> Gemini 무한 루프영상</h1><p className="mt-2 text-sm text-muted-foreground">어두운 외부 전경의 구도는 유지하고 비·안개·나뭇잎처럼 작은 움직임만 더합니다.</p></div><a href={GEMINI_URL} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-700 bg-white px-4 py-3 text-sm font-bold text-sky-700">Gemini 열기 <ExternalLink size={15} /></a></header>

    {message && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${message.kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-sky-200 bg-sky-50 text-sky-800"}`}>{message.text}</div>}

    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm sm:flex-row sm:items-center"><FolderOpen size={19} className="shrink-0 text-sky-700" /><div className="min-w-0 flex-1"><p className="text-sm font-bold">내 컴퓨터 프로젝트 폴더</p><p className="mt-1 truncate text-xs text-muted-foreground">{projectFolder ? `${projectFolder.name} / 영상에 루프영상 저장` : "앞 단계에서 연결한 프로젝트 폴더를 함께 사용합니다."}</p></div><button onClick={connectProjectFolder} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold"><FolderOpen size={13} /> {projectFolder ? "폴더 변경" : "폴더 연결"}</button></section>

    {!selectedBackground ? <section className="rounded-2xl border border-dashed border-border bg-white p-10 text-center"><ImageIconFallback /><p className="mt-3 font-bold">저장된 어두운 배경 이미지가 없습니다.</p><p className="mt-1 text-sm text-muted-foreground">Flow 이미지 단계에서 배경 결과물을 먼저 저장해주세요.</p><Link href={`/studio/longform-japan/projects/${projectId}/image`} className="mt-4 inline-flex rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white">이미지 제작으로</Link></section> : <>
      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]"><article className="rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h2 className="font-bold">Gemini에 넣을 기준 배경</h2><p className="mt-1 text-xs text-muted-foreground">여러 배경이 있으면 사용할 이미지를 선택하세요.</p></div>{backgrounds.length > 1 && <select value={selectedBackground.id} onChange={(event) => setSelectedBackgroundId(event.target.value)} className="max-w-40 rounded-lg border border-border bg-white px-2 py-2 text-xs font-bold">{backgrounds.map((item, index) => <option key={item.id} value={item.id}>배경 {backgrounds.length - index}</option>)}</select>}</div><div className="relative mt-4 aspect-video overflow-hidden rounded-xl border border-border bg-black"><Image src={selectedBackground.url} alt="Gemini 기준 배경" fill unoptimized sizes="(min-width: 1024px) 42vw, 100vw" className="object-contain" /></div><a href={selectedBackground.url} download={selectedBackground.file_name} target="_blank" rel="noreferrer" className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-xs font-bold"><Download size={13} /> 기준 이미지 원본 열기</a></article>
      <article className="rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold">미세 움직임 프롬프트</h2><p className="mt-1 text-xs text-muted-foreground">카메라와 구도를 고정하고 한두 가지 효과만 사용합니다.</p></div><button onClick={generatePrompt} disabled={generating} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} 프롬프트 생성</button></div><textarea value={motionPrompt} onChange={(event) => setMotionPrompt(event.target.value)} placeholder="선택한 배경을 기준으로 프롬프트를 생성하거나 직접 입력하세요." className="mt-4 min-h-60 w-full resize-y rounded-xl border border-border bg-stone-50 p-3 text-xs leading-6 outline-none focus:border-sky-500" /><button onClick={copyPromptAndOpenGemini} disabled={!motionPrompt.trim()} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs font-bold text-sky-800 disabled:opacity-40"><Copy size={13} /> 프롬프트 복사 후 Gemini 열기 <ExternalLink size={13} /></button></article></section>

      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm"><h2 className="font-bold">Gemini 결과 루프영상</h2><p className="mt-1 text-xs text-muted-foreground">MP4, MOV 또는 WEBM 파일을 올리면 로컬 프로젝트의 영상 폴더도 자동으로 만들어 저장합니다.</p>{latestVideo ? <><video src={latestVideo.url} controls loop playsInline className="mt-4 aspect-video w-full rounded-xl bg-black object-contain" /><div className="mt-3 grid gap-2 sm:grid-cols-3"><a href={latestVideo.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-xs font-bold"><Download size={13} /> 원본 열기</a><button onClick={saveVideoLocally} disabled={saving} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-xs font-bold disabled:opacity-40">{saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} 폴더 저장</button><button onClick={deleteVideo} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2.5 text-xs font-bold text-red-600"><Trash2 size={13} /> 삭제</button></div><label className="mt-2 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2.5 text-xs font-bold text-white"><Upload size={13} /> 영상 교체<input type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={uploadVideo} disabled={uploading} /></label></> : <label className="mt-4 flex aspect-video cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-sky-300 bg-stone-50 text-center"><input type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={uploadVideo} disabled={uploading} />{uploading ? <Loader2 className="animate-spin text-sky-700" size={27} /> : <Upload className="text-sky-700" size={27} />}<p className="mt-3 text-sm font-bold">Gemini 결과 영상 올리기</p><p className="mt-1 text-xs text-muted-foreground">MP4 · MOV · WEBM</p></label>}</section>
    </>}

    {latestVideo && <Link href={`/studio/longform-japan/projects/${projectId}/premiere`} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 text-sm font-bold text-white">Premiere 편집 패키지로 <ArrowRight size={16} /></Link>}
  </div>;
}

function ImageIconFallback() {
  return <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><Video size={22} /></div>;
}
