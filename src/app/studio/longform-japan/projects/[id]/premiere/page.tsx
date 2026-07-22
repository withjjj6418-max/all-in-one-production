"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, Copy, FileText, Film, FolderOpen, ImageIcon, Loader2, Save, Sparkles, Tags, Video, Volume2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getProjectFolderHandle, saveProjectFolderHandle, writeBlobToFolder } from "@/lib/project-folder";

type EditPackage = {
  edit_notes: string;
  status: "preparing" | "ready" | "done";
  title_candidates: unknown;
  selected_title: string;
  youtube_description: string;
  youtube_tags: string[];
  timeline_text: string;
};

type VisualAsset = { id: string; asset_kind: "thumbnail" | "background" | "loop_video"; url: string; file_name: string };
type WritableDirectoryHandle = FileSystemDirectoryHandle & { requestPermission: (options?: { mode?: "read" | "readwrite" }) => Promise<PermissionState> };
type DirectoryPickerWindow = Window & { showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle> };

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export default function JapanLongformPremierePage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [titles, setTitles] = useState<string[]>([]);
  const [selectedTitle, setSelectedTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [timeline, setTimeline] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [status, setStatus] = useState<EditPackage["status"]>("preparing");
  const [hasVoiceRun, setHasVoiceRun] = useState(false);
  const [assets, setAssets] = useState<VisualAsset[]>([]);
  const [projectFolder, setProjectFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingFile, setSavingFile] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "notice"; text: string } | null>(null);

  const thumbnail = assets.find((item) => item.asset_kind === "thumbnail") || null;
  const background = assets.find((item) => item.asset_kind === "background") || null;
  const loopVideo = assets.find((item) => item.asset_kind === "loop_video") || null;

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) { setMessage({ kind: "error", text: "로그인이 필요합니다." }); setLoading(false); return; }
      setUserId(user.id);
      const [projectResult, packageResult, voiceResult, assetsResult] = await Promise.all([
        supabase.from("projects").select("title").eq("id", projectId).eq("production_type", "longform_japan").maybeSingle(),
        supabase.from("japan_longform_edit_packages").select("edit_notes, status, title_candidates, selected_title, youtube_description, youtube_tags, timeline_text").eq("project_id", projectId).maybeSingle(),
        supabase.from("japan_longform_voice_runs").select("id").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("japan_longform_visual_assets").select("id, asset_kind, url, file_name").eq("project_id", projectId).in("asset_kind", ["thumbnail", "background", "loop_video"]).order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      setProjectTitle(projectResult.data?.title || "일본 롱폼 프로젝트");
      if (packageResult.data) {
        const record = packageResult.data as EditPackage;
        setTitles(stringArray(record.title_candidates));
        setSelectedTitle(record.selected_title || "");
        setDescription(record.youtube_description || "");
        setTags(record.youtube_tags || []);
        setTimeline(record.timeline_text || "");
        setEditNotes(record.edit_notes || "");
        setStatus(record.status || "preparing");
      }
      setHasVoiceRun(Boolean(voiceResult.data));
      setAssets((assetsResult.data || []) as VisualAsset[]);
      if (projectResult.error || packageResult.error || voiceResult.error || assetsResult.error) setMessage({ kind: "error", text: "Premiere 패키지 정보를 모두 불러오지 못했습니다. 최신 SQL 적용 여부를 확인해주세요." });
      try { setProjectFolder(await getProjectFolderHandle(projectId)); } catch { /* IndexedDB 미지원 */ }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [projectId, supabase]);

  function packageValues(overrides?: Partial<{ titles: string[]; selectedTitle: string; description: string; tags: string[]; timeline: string; status: EditPackage["status"] }>) {
    return {
      project_id: projectId,
      user_id: userId,
      edit_notes: editNotes,
      status: overrides?.status ?? status,
      title_candidates: overrides?.titles ?? titles,
      selected_title: overrides?.selectedTitle ?? selectedTitle.trim(),
      youtube_description: overrides?.description ?? description.trim(),
      youtube_tags: overrides?.tags ?? tags,
      timeline_text: overrides?.timeline ?? timeline,
      updated_at: new Date().toISOString(),
    };
  }

  async function generateMetadata() {
    setGenerating(true);
    setMessage(null);
    try {
      const response = await fetch("/api/longform-japan/youtube-metadata", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId }) });
      const result = await response.json() as { titles?: string[]; description?: string; tags?: string[]; timeline?: string; error?: string };
      if (!response.ok || !result.titles || !result.description || !result.tags || !result.timeline) throw new Error(result.error || "업로드 정보를 만들지 못했습니다.");
      const nextSelected = result.titles[0] || "";
      const { error } = await supabase.from("japan_longform_edit_packages").upsert({
        ...packageValues({ titles: result.titles, selectedTitle: nextSelected, description: result.description, tags: result.tags, timeline: result.timeline }),
        metadata_generated_at: new Date().toISOString(),
      }, { onConflict: "project_id" });
      if (error) throw error;
      setTitles(result.titles);
      setSelectedTitle(nextSelected);
      setDescription(result.description);
      setTags(result.tags);
      setTimeline(result.timeline);
      setMessage({ kind: "notice", text: "제목 3개, 설명, 타임라인과 검색용 태그 15개를 생성해 저장했습니다." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "YouTube 업로드 정보 생성에 실패했습니다." });
    } finally {
      setGenerating(false);
    }
  }

  async function savePackage(nextStatus = status) {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase.from("japan_longform_edit_packages").upsert(packageValues({ status: nextStatus }), { onConflict: "project_id" });
    setSaving(false);
    if (error) return setMessage({ kind: "error", text: "Premiere 패키지를 저장하지 못했습니다." });
    setStatus(nextStatus);
    setMessage({ kind: "notice", text: nextStatus === "ready" ? "Premiere 편집 패키지를 준비 완료로 표시했습니다." : "YouTube 업로드 정보를 저장했습니다." });
  }

  async function copyUploadInfo() {
    const text = `${selectedTitle.trim()}\n\n${description.trim()}\n\n【タグ】\n${tags.join(", ")}`;
    try { await navigator.clipboard.writeText(text); setMessage({ kind: "notice", text: "제목·설명·태그를 한 번에 복사했습니다." }); }
    catch { setMessage({ kind: "error", text: "클립보드 복사에 실패했습니다." }); }
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

  async function saveUploadInfoFile() {
    if (!projectFolder) return setMessage({ kind: "error", text: "프로젝트 폴더를 먼저 연결해주세요." });
    setSavingFile(true);
    try {
      const permission = await (projectFolder as WritableDirectoryHandle).requestPermission({ mode: "readwrite" });
      if (permission !== "granted") throw new Error("프로젝트 폴더 쓰기 권한을 허용해주세요.");
      const uploadFolder = await projectFolder.getDirectoryHandle("업로드", { create: true });
      const content = `제목\r\n${selectedTitle.trim()}\r\n\r\n설명\r\n${description.trim()}\r\n\r\n태그\r\n${tags.join(", ")}`;
      await writeBlobToFolder(uploadFolder, "YouTube_업로드정보.txt", new Blob(["\ufeff", content], { type: "text/plain;charset=utf-8" }));
      setMessage({ kind: "notice", text: `${projectFolder.name} / 업로드 폴더에 TXT로 저장했습니다.` });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "업로드 정보 파일 저장에 실패했습니다." });
    } finally {
      setSavingFile(false);
    }
  }

  if (loading) return <div className="flex min-h-72 items-center justify-center"><Loader2 className="animate-spin text-sky-700" size={28} /></div>;

  return <div className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><Link href={`/studio/longform-japan/projects/${projectId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-sky-700"><ArrowLeft size={15} /> 워크벤치</Link><p className="mt-5 text-sm font-bold text-sky-700">{projectTitle}</p><h1 className="mt-1 flex items-center gap-2 text-3xl font-bold"><Film className="text-sky-700" /> Premiere 편집 패키지</h1><p className="mt-2 text-sm text-muted-foreground">제작 파일과 YouTube 제목·설명·태그를 최종 업로드 전에 한곳에서 정리합니다.</p></div><button onClick={() => savePackage(status === "ready" ? "preparing" : "ready")} disabled={saving} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold ${status === "ready" ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-sky-700 text-white"}`}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}{status === "ready" ? "준비 완료됨" : "편집 패키지 준비 완료"}</button></header>

    {message && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${message.kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-sky-200 bg-sky-50 text-sky-800"}`}>{message.text}</div>}

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><AssetStatus icon={Volume2} label="최종 TTS · SRT" ready={hasVoiceRun} href={`/studio/longform-japan/projects/${projectId}/voice`} /><AssetStatus icon={ImageIcon} label="썸네일" ready={Boolean(thumbnail)} href={`/studio/longform-japan/projects/${projectId}/image`} /><AssetStatus icon={ImageIcon} label="어두운 배경" ready={Boolean(background)} href={`/studio/longform-japan/projects/${projectId}/image`} /><AssetStatus icon={Video} label="루프영상" ready={Boolean(loopVideo)} href={`/studio/longform-japan/projects/${projectId}/motion`} /></section>

    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="flex items-center gap-2 text-lg font-bold"><Sparkles size={18} className="text-sky-700" /> YouTube 업로드 정보</h2><p className="mt-1 text-xs text-muted-foreground">일본어 최종대본과 TTS 구간을 기준으로 생성하며 모든 내용은 직접 수정할 수 있습니다.</p></div><button onClick={generateMetadata} disabled={generating || !hasVoiceRun} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">{generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {titles.length ? "AI로 다시 추천" : "AI 업로드 정보 생성"}</button></div>

      <div className="mt-6 space-y-5"><div><label className="text-sm font-bold">AI 추천 제목 3개</label><div className="mt-2 grid gap-2">{titles.length ? titles.map((title, index) => <button key={`${title}-${index}`} type="button" onClick={() => setSelectedTitle(title)} className={`flex items-start gap-3 rounded-xl border p-3 text-left text-sm ${selectedTitle === title ? "border-sky-500 bg-sky-50" : "border-border hover:border-sky-200"}`}><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${selectedTitle === title ? "bg-sky-700 text-white" : "bg-muted text-muted-foreground"}`}>{index + 1}</span><span className="font-semibold leading-6">{title}</span></button>) : <p className="rounded-xl bg-stone-50 p-4 text-sm text-muted-foreground">아직 추천 제목이 없습니다.</p>}</div><label className="mt-3 block text-xs font-bold text-muted-foreground">최종 선택 제목</label><input value={selectedTitle} onChange={(event) => setSelectedTitle(event.target.value)} placeholder="최종 업로드 제목" className="mt-1 w-full rounded-xl border border-border px-3 py-2.5 text-sm outline-none focus:border-sky-500" /></div>

        <div><div className="flex items-center justify-between"><label className="text-sm font-bold">설명 · 구독 요청 · 타임라인</label><span className="text-xs text-muted-foreground">{description.length.toLocaleString()}자</span></div><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="영상 내용 소개와 타임라인이 여기에 생성됩니다." className="mt-2 min-h-80 w-full resize-y rounded-xl border border-border bg-stone-50 p-4 text-sm leading-7 outline-none focus:border-sky-500" /></div>

        <div><div className="flex items-center justify-between"><label className="flex items-center gap-1.5 text-sm font-bold"><Tags size={15} /> 검색용 추천 태그</label><span className={`text-xs font-bold ${tags.length === 15 ? "text-emerald-700" : "text-muted-foreground"}`}>{tags.length}/15</span></div><textarea value={tags.join(", ")} onChange={(event) => setTags(event.target.value.split(",").map((tag) => tag.trim().replace(/^#+/, "")).filter(Boolean).slice(0, 15))} placeholder="쉼표로 태그를 구분하세요." className="mt-2 min-h-24 w-full resize-y rounded-xl border border-border px-3 py-3 text-sm leading-6 outline-none focus:border-sky-500" /><div className="mt-2 flex flex-wrap gap-1.5">{tags.map((tag) => <span key={tag} className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-800">{tag}</span>)}</div></div>

        <div><label className="text-sm font-bold">Premiere 편집 메모</label><textarea value={editNotes} onChange={(event) => setEditNotes(event.target.value)} placeholder="편집 중 기억할 내용을 적어두세요." className="mt-2 min-h-28 w-full resize-y rounded-xl border border-border px-3 py-3 text-sm leading-6 outline-none focus:border-sky-500" /></div>

        <div className="grid gap-2 sm:grid-cols-2"><button onClick={() => savePackage()} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-40">{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} 수정 내용 저장</button><button onClick={copyUploadInfo} disabled={!selectedTitle.trim() || !description.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-700 px-4 py-3 text-sm font-bold text-sky-700 disabled:opacity-40"><Copy size={15} /> 제목·설명·태그 복사</button></div></div>
    </section>

    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm sm:flex-row sm:items-center"><FolderOpen size={19} className="shrink-0 text-sky-700" /><div className="min-w-0 flex-1"><p className="text-sm font-bold">업로드 정보 로컬 보관</p><p className="mt-1 truncate text-xs text-muted-foreground">{projectFolder ? `${projectFolder.name} / 업로드 / YouTube_업로드정보.txt` : "프로젝트 폴더를 연결하면 업로드 정보도 TXT로 보관할 수 있습니다."}</p></div><button onClick={connectProjectFolder} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold"><FolderOpen size={13} /> {projectFolder ? "폴더 변경" : "폴더 연결"}</button><button onClick={saveUploadInfoFile} disabled={!projectFolder || !selectedTitle.trim() || savingFile} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{savingFile ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} TXT 저장</button></section>

    {timeline && <details className="rounded-2xl border border-border bg-white p-4 text-sm shadow-sm"><summary className="cursor-pointer font-bold">TTS 기준 자동 타임라인 확인</summary><pre className="mt-3 whitespace-pre-wrap rounded-xl bg-stone-50 p-4 text-xs leading-6">{timeline}</pre></details>}
  </div>;
}

function AssetStatus({ icon: Icon, label, ready, href }: { icon: typeof Volume2; label: string; ready: boolean; href: string }) {
  return <Link href={href} className={`rounded-xl border p-3 transition hover:-translate-y-0.5 ${ready ? "border-emerald-200 bg-emerald-50" : "border-border bg-white"}`}><div className="flex items-center gap-2"><Icon size={16} className={ready ? "text-emerald-700" : "text-muted-foreground"} /><span className="text-xs font-bold">{label}</span><span className={`ml-auto text-[10px] font-bold ${ready ? "text-emerald-700" : "text-muted-foreground"}`}>{ready ? "준비됨" : "미완료"}</span></div></Link>;
}
