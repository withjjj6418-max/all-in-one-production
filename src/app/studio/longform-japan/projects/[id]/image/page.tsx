"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Copy, Download, ExternalLink, FolderOpen, ImageIcon, Loader2, Save, Sparkles, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getProjectFolderHandle, saveProjectFolderHandle, writeBlobToFolder } from "@/lib/project-folder";

const VISUAL_BUCKET = "japan-longform-visuals";
const FLOW_URL = "https://labs.google/fx/tools/flow";

type AssetKind = "thumbnail" | "background";
type VisualAsset = {
  id: string;
  asset_kind: AssetKind;
  provider: "flow" | "manual";
  prompt: string;
  file_name: string;
  storage_path: string | null;
  url: string;
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

function extensionOf(fileName: string, mimeType = "") {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension && ["png", "jpg", "jpeg", "webp"].includes(extension)) return extension === "jpeg" ? "jpg" : extension;
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/jpeg") return "jpg";
  return "png";
}

export default function JapanLongformImagePage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const supabase = useMemo(() => createClient(), []);
  const [projectTitle, setProjectTitle] = useState("");
  const [userId, setUserId] = useState("");
  const [script, setScript] = useState("");
  const [assets, setAssets] = useState<VisualAsset[]>([]);
  const [thumbnailPrompt, setThumbnailPrompt] = useState("");
  const [backgroundPrompt, setBackgroundPrompt] = useState("");
  const [projectFolder, setProjectFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingPromptKind, setGeneratingPromptKind] = useState<AssetKind | null>(null);
  const [uploadingKind, setUploadingKind] = useState<AssetKind | null>(null);
  const [savingAssetId, setSavingAssetId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "notice"; text: string } | null>(null);

  const latestThumbnail = assets.find((asset) => asset.asset_kind === "thumbnail") || null;
  const latestBackground = assets.find((asset) => asset.asset_kind === "background") || null;

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) { setMessage({ kind: "error", text: "로그인이 필요합니다." }); setLoading(false); return; }
      setUserId(user.id);
      const [projectResult, scriptResult, assetsResult] = await Promise.all([
        supabase.from("projects").select("title").eq("id", projectId).eq("production_type", "longform_japan").maybeSingle(),
        supabase.from("japan_longform_scripts").select("verified_japanese").eq("project_id", projectId).maybeSingle(),
        supabase.from("japan_longform_visual_assets").select("id, asset_kind, provider, prompt, file_name, storage_path, url, created_at").eq("project_id", projectId).in("asset_kind", ["thumbnail", "background"]).order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      setProjectTitle(projectResult.data?.title || "일본 롱폼 프로젝트");
      setScript(scriptResult.data?.verified_japanese || "");
      const loadedAssets = (assetsResult.data || []) as VisualAsset[];
      setAssets(loadedAssets);
      const thumbnail = loadedAssets.find((asset) => asset.asset_kind === "thumbnail");
      const background = loadedAssets.find((asset) => asset.asset_kind === "background");
      if (thumbnail?.prompt) setThumbnailPrompt(thumbnail.prompt);
      if (background?.prompt) setBackgroundPrompt(background.prompt);
      if (projectResult.error || scriptResult.error || assetsResult.error) setMessage({ kind: "error", text: "이미지 작업 정보를 모두 불러오지 못했습니다." });
      try { setProjectFolder(await getProjectFolderHandle(projectId)); } catch { /* IndexedDB 미지원 */ }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [projectId, supabase]);

  async function generatePrompt(kind: AssetKind) {
    setGeneratingPromptKind(kind);
    setMessage(null);
    try {
      const response = await fetch("/api/longform-japan/visual-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, kind }),
      });
      const result = await response.json() as { prompt?: string; error?: string };
      if (!response.ok || !result.prompt) throw new Error(result.error || "프롬프트를 만들지 못했습니다.");
      if (kind === "thumbnail") setThumbnailPrompt(result.prompt);
      else setBackgroundPrompt(result.prompt);
      setMessage({ kind: "notice", text: `${kind === "thumbnail" ? "썸네일" : "외부 전경 배경"} 프롬프트를 만들었습니다.` });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "프롬프트 생성에 실패했습니다." });
    } finally {
      setGeneratingPromptKind(null);
    }
  }

  async function copyPrompt(prompt: string, label: string) {
    if (!prompt.trim()) return setMessage({ kind: "error", text: `${label} 프롬프트를 먼저 작성해주세요.` });
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage({ kind: "notice", text: `${label} 프롬프트를 복사했습니다. Flow에 붙여넣으세요.` });
    } catch {
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

  async function writeImageLocally(blob: Blob, kind: AssetKind, extension: string) {
    if (!projectFolder) return false;
    const handle = projectFolder as WritableDirectoryHandle;
    const permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") return false;
    const imageFolder = await projectFolder.getDirectoryHandle("이미지", { create: true });
    const suffix = kind === "thumbnail" ? "썸네일" : "어두운배경";
    await writeBlobToFolder(imageFolder, `${safeFileName(projectTitle)}_${suffix}.${extension}`, blob);
    return true;
  }

  async function uploadAsset(kind: AssetKind, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !userId) return;
    if (!file.type.startsWith("image/")) return setMessage({ kind: "error", text: "PNG, JPG 또는 WEBP 이미지를 선택해주세요." });
    const prompt = kind === "thumbnail" ? thumbnailPrompt.trim() : backgroundPrompt.trim();
    if (!prompt) return setMessage({ kind: "error", text: "사용한 Flow 프롬프트를 먼저 입력해주세요." });

    setUploadingKind(kind);
    setMessage(null);
    let localSaved = false;
    let path = "";
    try {
      const extension = extensionOf(file.name, file.type);
      if (projectFolder) localSaved = await writeImageLocally(file, kind, extension);
      path = `${userId}/${projectId}/${kind}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from(VISUAL_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const url = supabase.storage.from(VISUAL_BUCKET).getPublicUrl(path).data.publicUrl;
      const { data, error: insertError } = await supabase.from("japan_longform_visual_assets").insert({
        project_id: projectId,
        user_id: userId,
        asset_kind: kind,
        provider: "flow",
        prompt,
        file_name: file.name,
        storage_path: path,
        url,
      }).select("id, asset_kind, provider, prompt, file_name, storage_path, url, created_at").single();
      if (insertError) {
        await supabase.storage.from(VISUAL_BUCKET).remove([path]);
        throw insertError;
      }
      setAssets((current) => [data as VisualAsset, ...current]);
      setMessage({ kind: "notice", text: localSaved ? "프로젝트에 기록하고 로컬 이미지 폴더에도 저장했습니다." : "프로젝트에 이미지를 저장했습니다. ‘폴더 저장’을 누르면 로컬 폴더 권한을 확인하고 저장합니다." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "이미지 저장에 실패했습니다." });
    } finally {
      setUploadingKind(null);
    }
  }

  async function saveAssetLocally(asset: VisualAsset) {
    if (!projectFolder) return setMessage({ kind: "error", text: "프로젝트 폴더를 먼저 연결해주세요." });
    setSavingAssetId(asset.id);
    try {
      const permission = await (projectFolder as WritableDirectoryHandle).requestPermission({ mode: "readwrite" });
      if (permission !== "granted") throw new Error("프로젝트 폴더 쓰기 권한을 허용해주세요.");
      const response = await fetch(asset.url);
      if (!response.ok) throw new Error("저장된 이미지를 불러오지 못했습니다.");
      const saved = await writeImageLocally(await response.blob(), asset.asset_kind, extensionOf(asset.file_name, response.headers.get("content-type") || ""));
      if (!saved) throw new Error("프로젝트 폴더 쓰기 권한을 허용해주세요.");
      setMessage({ kind: "notice", text: `로컬 ${projectFolder.name} / 이미지 폴더에 저장했습니다.` });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "로컬 폴더 저장에 실패했습니다." });
    } finally {
      setSavingAssetId(null);
    }
  }

  async function deleteAsset(asset: VisualAsset) {
    if (!window.confirm("이 이미지를 프로젝트에서 삭제할까요?")) return;
    const { error } = await supabase.from("japan_longform_visual_assets").delete().eq("id", asset.id);
    if (error) return setMessage({ kind: "error", text: "이미지 기록을 삭제하지 못했습니다." });
    if (asset.storage_path) await supabase.storage.from(VISUAL_BUCKET).remove([asset.storage_path]);
    setAssets((current) => current.filter((item) => item.id !== asset.id));
    setMessage({ kind: "notice", text: "이미지를 삭제했습니다. 로컬에 저장된 파일은 그대로 유지됩니다." });
  }

  if (loading) return <div className="flex min-h-72 items-center justify-center"><Loader2 className="animate-spin text-sky-700" size={28} /></div>;

  return <div className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><Link href={`/studio/longform-japan/projects/${projectId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-sky-700"><ArrowLeft size={15} /> 워크벤치</Link><p className="mt-5 text-sm font-bold text-sky-700">{projectTitle}</p><h1 className="mt-1 flex items-center gap-2 text-3xl font-bold"><ImageIcon className="text-sky-700" /> Flow 이미지 제작</h1><p className="mt-2 text-sm text-muted-foreground">썸네일은 강한 핵심 장면으로, 어두운 배경은 이야기의 메인 장소 외부 전경으로 제작합니다.</p></div><a href={FLOW_URL} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-700 bg-white px-4 py-3 text-sm font-bold text-sky-700">Flow 열기 <ExternalLink size={15} /></a></header>

    {message && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${message.kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-sky-200 bg-sky-50 text-sky-800"}`}>{message.text}</div>}
    {!script.trim() && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">최종 일본어 대본이 없습니다. 번역 단계에서 검수 대본을 먼저 저장해주세요.</div>}

    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm sm:flex-row sm:items-center"><FolderOpen size={19} className="shrink-0 text-sky-700" /><div className="min-w-0 flex-1"><p className="text-sm font-bold">내 컴퓨터 프로젝트 폴더</p><p className="mt-1 truncate text-xs text-muted-foreground">{projectFolder ? `${projectFolder.name} / 이미지에 결과 자동 저장` : "TTS에서 연결한 폴더를 함께 사용하거나 여기서 새로 연결할 수 있습니다."}</p></div><button onClick={connectProjectFolder} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold"><FolderOpen size={13} /> {projectFolder ? "폴더 변경" : "폴더 연결"}</button></section>

    <section className="grid gap-5 lg:grid-cols-2">
      <AssetPanel kind="thumbnail" title="썸네일용 이미지" description="작게 보여도 주제가 읽히는 강한 장면 한 장" prompt={thumbnailPrompt} onPromptChange={setThumbnailPrompt} generating={generatingPromptKind === "thumbnail"} generationDisabled={generatingPromptKind !== null || !script.trim()} onGenerate={() => generatePrompt("thumbnail")} asset={latestThumbnail} uploading={uploadingKind === "thumbnail"} saving={savingAssetId === latestThumbnail?.id} onCopy={() => copyPrompt(thumbnailPrompt, "썸네일")} onUpload={(event) => uploadAsset("thumbnail", event)} onSaveLocal={() => latestThumbnail && saveAssetLocally(latestThumbnail)} onDelete={() => latestThumbnail && deleteAsset(latestThumbnail)} />
      <AssetPanel kind="background" title="아주 어두운 외부 전경" description="메인 장소의 건물 외부·산속 저택 전경·비 오는 외부처럼 넓게 보이는 장면" prompt={backgroundPrompt} onPromptChange={setBackgroundPrompt} generating={generatingPromptKind === "background"} generationDisabled={generatingPromptKind !== null || !script.trim()} onGenerate={() => generatePrompt("background")} asset={latestBackground} uploading={uploadingKind === "background"} saving={savingAssetId === latestBackground?.id} onCopy={() => copyPrompt(backgroundPrompt, "배경")} onUpload={(event) => uploadAsset("background", event)} onSaveLocal={() => latestBackground && saveAssetLocally(latestBackground)} onDelete={() => latestBackground && deleteAsset(latestBackground)} />
    </section>

    {latestBackground && <Link href={`/studio/longform-japan/projects/${projectId}/scenes`} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 text-sm font-bold text-white">주요 장면 일러스트로 <ArrowRight size={16} /></Link>}
  </div>;
}

function AssetPanel({ kind, title, description, prompt, onPromptChange, generating, generationDisabled, onGenerate, asset, uploading, saving, onCopy, onUpload, onSaveLocal, onDelete }: {
  kind: AssetKind;
  title: string;
  description: string;
  prompt: string;
  onPromptChange: (value: string) => void;
  generating: boolean;
  generationDisabled: boolean;
  onGenerate: () => void;
  asset: VisualAsset | null;
  uploading: boolean;
  saving: boolean;
  onCopy: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onSaveLocal: () => void;
  onDelete: () => void;
}) {
  return <article className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm"><div className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div><button onClick={onGenerate} disabled={generationDisabled} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} {kind === "thumbnail" ? "썸네일 생성" : "배경 생성"}</button></div><textarea value={prompt} onChange={(event) => onPromptChange(event.target.value)} placeholder={`‘${kind === "thumbnail" ? "썸네일" : "배경"} 생성’을 누르거나 직접 입력하세요.`} className="mt-4 min-h-52 w-full resize-y rounded-xl border border-border bg-stone-50 p-3 text-xs leading-6 outline-none focus:border-sky-500" /><button onClick={onCopy} disabled={!prompt.trim()} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs font-bold text-sky-800 disabled:opacity-40"><Copy size={13} /> 프롬프트 복사</button></div><div className="border-t border-border bg-stone-50 p-5">{asset ? <><div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-black"><Image src={asset.url} alt={title} fill unoptimized sizes="(min-width: 1024px) 50vw, 100vw" className="object-contain" /></div><div className="mt-3 grid grid-cols-2 gap-2"><a href={asset.url} download={asset.file_name} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs font-bold"><Download size={13} /> 원본 열기</a><button onClick={onSaveLocal} disabled={saving} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs font-bold disabled:opacity-40">{saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} 폴더 저장</button></div><div className="mt-2 flex gap-2"><label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white"><Upload size={13} /> 이미지 교체<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onUpload} disabled={uploading} /></label><button onClick={onDelete} className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 text-red-600" aria-label="이미지 삭제"><Trash2 size={14} /></button></div></> : <label className="flex aspect-video cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-sky-300 bg-white text-center"><input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onUpload} disabled={uploading} />{uploading ? <Loader2 className="animate-spin text-sky-700" size={25} /> : <Upload className="text-sky-700" size={25} />}<p className="mt-3 text-sm font-bold">Flow 결과 이미지 올리기</p><p className="mt-1 text-xs text-muted-foreground">PNG · JPG · WEBP</p></label>}</div></article>;
}
