"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, BookOpenText, CheckCircle, Clock3, FolderKanban, Loader2,
  ArrowDown, ArrowUp, Pencil, Plus, Search, Trash2, Upload, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getStoryProjectProgress,
  getStoryWorkflowState,
  productionTypes,
  storyStatusProgressMap,
  storyWorkflowStages,
  type StoryWorkflowStatus,
} from "@/lib/project-workflows";

type Project = {
  id: number;
  title: string;
  status: string | null;
  progress: number | null;
  category: string | null;
  memo: string | null;
  updated_at: string | null;
  uploaded?: boolean | null;
  workflowProgress?: number;
  workflowLabel?: string;
};

type ProjectView = "active" | "work-complete" | "uploaded";
type SortKey = "progress" | "name" | "updated";

function formatDate(value: string | null) {
  if (!value) return "최근 수정 기록 없음";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function isUploaded(project: Project) {
  return project.uploaded === true || project.status === "업로드 완료";
}

function isWorkComplete(project: Project) {
  return !isUploaded(project) && project.status === "작업 완료";
}

function projectProgress(project: Project) {
  return project.workflowProgress ?? getStoryProjectProgress(project);
}

export default function StoryStudioPage() {
  const supabase = useMemo(() => createClient(), []);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ProjectView>("active");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "updated", direction: "desc" });
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [formCategory, setFormCategory] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formStage, setFormStage] = useState<StoryWorkflowStatus>("시작 전");
  const [formMemo, setFormMemo] = useState("");
  const [formWorkComplete, setFormWorkComplete] = useState(false);
  const [formUploaded, setFormUploaded] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadProjects() {
      const { data, error } = await supabase.from("projects").select("id, title, status, progress, category, memo, updated_at, uploaded").eq("production_type", productionTypes.shortsStory).order("updated_at", { ascending: false });
      if (!active) return;
      if (error) console.error("Failed to load story projects:", error);
      const projectRows = (data ?? []) as Project[];
      const projectIds = projectRows.map((project) => project.id);
      if (projectIds.length === 0) {
        setProjects([]);
        setLoading(false);
        return;
      }

      const [scriptsRes, sourcesRes, adaptationsRes, soundsRes, imagesRes, editPackagesRes, voiceRunsRes] = await Promise.all([
        supabase.from("scripts").select("project_id, content").in("project_id", projectIds),
        supabase.from("story_sources").select("project_id").in("project_id", projectIds),
        supabase.from("story_adaptations").select("project_id").in("project_id", projectIds),
        supabase.from("post_sounds").select("project_id").in("project_id", projectIds),
        supabase.from("post_images").select("project_id").in("project_id", projectIds),
        supabase.from("story_edit_packages").select("project_id, status").in("project_id", projectIds),
        supabase.from("story_voice_runs").select("project_id").in("project_id", projectIds).not("combined_audio_url", "is", null),
      ]);
      if (!active) return;

      const scriptProjects = new Set((scriptsRes.data ?? []).filter((row) => Boolean(row.content)).map((row) => row.project_id));
      const sourceProjects = new Set((sourcesRes.data ?? []).map((row) => row.project_id));
      const adaptationProjects = new Set((adaptationsRes.data ?? []).map((row) => row.project_id));
      const soundProjects = new Set((soundsRes.data ?? []).map((row) => row.project_id));
      const imageProjects = new Set((imagesRes.data ?? []).map((row) => row.project_id));
      const editProjects = new Set((editPackagesRes.data ?? []).filter((row) => row.status === "ready" || row.status === "done").map((row) => row.project_id));
      const voiceRunProjects = new Set((voiceRunsRes.data ?? []).map((row) => row.project_id));

      setProjects(projectRows.map((project) => {
        const workflow = getStoryWorkflowState({
          source: sourceProjects.has(project.id),
          adapt: adaptationProjects.has(project.id),
          script: scriptProjects.has(project.id),
          voice: soundProjects.has(project.id) || voiceRunProjects.has(project.id),
          character: imageProjects.has(project.id),
          premiere: editProjects.has(project.id),
          upload: isUploaded(project),
        });
        return { ...project, workflowProgress: workflow.progress, workflowLabel: workflow.label };
      }));
      setLoading(false);
    }
    loadProjects();
    return () => { active = false; };
  }, [supabase]);

  const categories = Array.from(new Set(projects.map((project) => project.category?.trim()).filter((value): value is string => Boolean(value)))).sort((left, right) => left.localeCompare(right, "ko"));
  const visibleProjects = projects.filter((project) => {
    const keyword = query.trim().toLocaleLowerCase("ko-KR");
    return !keyword || project.title.toLocaleLowerCase("ko-KR").includes(keyword) || project.category?.toLocaleLowerCase("ko-KR").includes(keyword);
  });
  const activeCount = projects.filter((project) => !isWorkComplete(project) && !isUploaded(project)).length;
  const workCompleteCount = projects.filter(isWorkComplete).length;
  const uploadedCount = projects.filter(isUploaded).length;
  const currentProjects = visibleProjects.filter((project) => view === "uploaded" ? isUploaded(project) : view === "work-complete" ? isWorkComplete(project) : !isWorkComplete(project) && !isUploaded(project));
  const sortedProjects = [...currentProjects].sort((left, right) => {
    const comparison = sort.key === "progress"
      ? projectProgress(left) - projectProgress(right)
      : sort.key === "name"
        ? left.title.localeCompare(right.title, "ko")
        : new Date(left.updated_at || 0).getTime() - new Date(right.updated_at || 0).getTime();
    return sort.direction === "asc" ? comparison : -comparison;
  });
  const groupedProjects = sortedProjects.reduce<Record<string, Project[]>>((groups, project) => {
    const category = project.category?.trim() || "미분류";
    (groups[category] ||= []).push(project);
    return groups;
  }, {});
  const categoryGroups = Object.entries(groupedProjects).sort(([left], [right]) => left === "미분류" ? 1 : right === "미분류" ? -1 : left.localeCompare(right, "ko"));

  const openEditModal = (project: Project) => {
    const stage = storyWorkflowStages.slice(0, -2).some((item) => item.status === project.status) ? project.status as StoryWorkflowStatus : "Premiere 편집";
    setCreatingProject(false);
    setEditingProject(project);
    setFormCategory(project.category || "");
    setFormTitle(project.title);
    setFormStage(stage);
    setFormMemo(project.memo || "");
    setFormWorkComplete(project.status === "작업 완료" || isUploaded(project));
    setFormUploaded(isUploaded(project));
  };

  const openCreateModal = () => {
    setEditingProject(null);
    setCreatingProject(true);
    setFormCategory("");
    setFormTitle("");
    setFormStage("시작 전");
    setFormMemo("");
    setFormWorkComplete(false);
    setFormUploaded(false);
  };

  const closeProjectModal = () => {
    setEditingProject(null);
    setCreatingProject(false);
  };

  const saveProject = async (event: React.FormEvent) => {
    event.preventDefault();
    if ((!editingProject && !creatingProject) || !formTitle.trim()) return;
    setSaving(true);
    const status = formUploaded ? "업로드 완료" : formWorkComplete ? "작업 완료" : formStage;
    const progress = storyStatusProgressMap[status];
    const now = new Date().toISOString();
    const projectValues = {
      title: formTitle.trim(), category: formCategory.trim() || null, memo: formMemo.trim() || null,
      status, progress, uploaded: formUploaded, updated_at: now,
    };

    if (editingProject) {
      const { error } = await supabase.from("projects").update(projectValues).eq("id", editingProject.id).eq("production_type", productionTypes.shortsStory);
      if (error) {
        window.alert("프로젝트 수정에 실패했습니다.");
      } else {
        setProjects((current) => current.map((project) => project.id === editingProject.id ? {
          ...project,
          ...projectValues,
          workflowProgress: formUploaded ? 100 : project.workflowProgress,
          workflowLabel: formUploaded ? "업로드" : project.workflowLabel,
        } : project));
        closeProjectModal();
      }
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.alert("로그인이 필요합니다.");
      } else {
        const { data, error } = await supabase.from("projects").insert({
          ...projectValues,
          user_id: user.id,
          production_type: productionTypes.shortsStory,
        }).select("id, title, status, progress, category, memo, updated_at, uploaded").single();
        if (error || !data) {
          window.alert("사연 프로젝트 생성에 실패했습니다.");
        } else {
          setProjects((current) => [data as Project, ...current]);
          if (typeof window !== "undefined") window.localStorage.setItem("last-shorts-story-project-id", String(data.id));
          closeProjectModal();
        }
      }
    }
    setSaving(false);
  };

  const deleteProject = async (project: Project) => {
    if (!window.confirm(`‘${project.title}’ 프로젝트와 연결된 모든 작업 데이터를 삭제할까요?`)) return;
    const { error } = await supabase.from("projects").delete().eq("id", project.id).eq("production_type", productionTypes.shortsStory);
    if (error) return window.alert("프로젝트 삭제에 실패했습니다.");
    setProjects((current) => current.filter((item) => item.id !== project.id));
  };

  return <div className="mx-auto max-w-6xl space-y-6">
    <section className="rounded-3xl border border-border bg-white p-6 shadow-sm sm:p-8"><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="mb-3 inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700"><BookOpenText size={14} /> 숏폼(사연)</div><h1 className="text-3xl font-bold tracking-tight">사연 제작 스튜디오</h1><p className="mt-2 text-sm text-muted-foreground">원문부터 업로드까지 프로젝트별 제작 흐름을 이어서 관리합니다.</p></div><button type="button" onClick={openCreateModal} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-olive px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-brand-olive-dark"><Plus size={16} /> 새 프로젝트</button></div></section>

    <div className="flex flex-col gap-3 lg:flex-row lg:items-center"><label className="relative flex-1"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="프로젝트 또는 카테고리 검색" className="h-11 w-full rounded-xl border border-border bg-white pl-10 pr-4 text-sm outline-none focus:border-brand-olive" /></label><div className="grid grid-cols-3 rounded-xl border border-border bg-white p-1 shadow-sm"><ViewButton active={view === "active"} onClick={() => setView("active")} icon={FolderKanban} label="진행 중" count={activeCount} /><ViewButton active={view === "work-complete"} onClick={() => setView("work-complete")} icon={CheckCircle} label="작업 완료" count={workCompleteCount} /><ViewButton active={view === "uploaded"} onClick={() => setView("uploaded")} icon={Upload} label="업로드 완료" count={uploadedCount} /></div></div>
    <div className="flex items-center justify-end gap-1.5"><span className="mr-1 text-[11px] font-bold text-muted-foreground">카드 정렬</span>{([{ key: "progress", label: "진행도순" }, { key: "name", label: "이름순" }, { key: "updated", label: "수정순" }] as const).map((item) => { const active = sort.key === item.key; const DirectionIcon = sort.direction === "asc" ? ArrowUp : ArrowDown; return <button key={item.key} type="button" onClick={() => setSort((current) => current.key === item.key ? { ...current, direction: current.direction === "asc" ? "desc" : "asc" } : { key: item.key, direction: item.key === "name" ? "asc" : "desc" })} className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-bold transition ${active ? "border-brand-olive bg-brand-cream text-brand-olive-dark" : "border-border bg-white text-muted-foreground hover:border-brand-olive/40"}`}>{item.label}{active && <DirectionIcon size={12} />}</button>; })}</div>

    {loading ? <div className="flex min-h-56 items-center justify-center rounded-2xl border border-border bg-white"><Loader2 className="animate-spin text-brand-olive" /></div> : currentProjects.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white px-6 text-center"><FolderKanban size={34} className="text-muted-foreground/40" /><p className="mt-3 font-bold">표시할 프로젝트가 없습니다</p><p className="mt-1 text-sm text-muted-foreground">프로젝트 상태를 수정하면 해당 목록으로 이동합니다.</p></div> : <div className="space-y-8">{categoryGroups.map(([category, categoryProjects]) => <section key={category}><div className="mb-3 flex items-center gap-2 px-1"><FolderKanban size={17} className="text-brand-olive" /><h2 className="font-bold">{category}</h2><span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-muted-foreground shadow-sm">{categoryProjects.length}</span></div><div className="grid gap-3 md:grid-cols-3">{categoryProjects.map((project) => <ProjectCard key={project.id} project={project} onEdit={() => openEditModal(project)} onDelete={() => deleteProject(project)} />)}</div></section>)}</div>}

    {(editingProject || creatingProject) && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeProjectModal(); }}><div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-border px-6 py-4"><h2 className="flex items-center gap-2 font-bold"><FolderKanban size={18} className="text-brand-olive" />{creatingProject ? "사연 프로젝트 만들기" : "프로젝트 편집"}</h2><button type="button" onClick={closeProjectModal} className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><X size={17} /></button></div><form onSubmit={saveProject} className="space-y-4 p-6">
      <label className="block"><span className="text-xs font-bold text-muted-foreground">카테고리</span><input list="story-categories" value={formCategory} onChange={(event) => setFormCategory(event.target.value)} placeholder="카테고리 입력 또는 선택" className="mt-1.5 h-11 w-full rounded-xl border border-border px-3 text-sm outline-none focus:border-brand-olive" /><datalist id="story-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist></label>
      <label className="block"><span className="text-xs font-bold text-muted-foreground">제목 *</span><input required value={formTitle} onChange={(event) => setFormTitle(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-border px-3 text-sm outline-none focus:border-brand-olive" /></label>
      <div className="grid gap-2 sm:grid-cols-2"><CompletionCheck checked={formWorkComplete} title="작업 완료" description="Premiere 작업까지 완료" onChange={(checked) => { setFormWorkComplete(checked); if (!checked) setFormUploaded(false); }} /><CompletionCheck checked={formUploaded} title="업로드 완료" description="YouTube 게시까지 완료" onChange={(checked) => { setFormUploaded(checked); if (checked) setFormWorkComplete(true); }} /></div>
      <label className="block"><span className="text-xs font-bold text-muted-foreground">현재 작업 단계</span><select value={formStage} onChange={(event) => { setFormStage(event.target.value as StoryWorkflowStatus); setFormWorkComplete(false); setFormUploaded(false); }} disabled={formWorkComplete || formUploaded} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold outline-none focus:border-brand-olive disabled:bg-muted disabled:text-muted-foreground">{storyWorkflowStages.slice(0, -2).map((stage) => <option key={stage.status} value={stage.status}>{stage.status}</option>)}</select></label>
      <div><div className="flex items-center justify-between text-xs"><span className="font-bold text-muted-foreground">진행률 · 최종 단계 기준</span><span className="font-extrabold text-brand-olive">{formUploaded ? 100 : formWorkComplete ? 90 : storyStatusProgressMap[formStage]}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand-olive transition-all" style={{ width: `${formUploaded ? 100 : formWorkComplete ? 90 : storyStatusProgressMap[formStage]}%` }} /></div></div>
      <label className="block"><span className="text-xs font-bold text-muted-foreground">메모 (선택)</span><textarea value={formMemo} onChange={(event) => setFormMemo(event.target.value)} className="mt-1.5 min-h-28 w-full rounded-xl border border-border p-3 text-sm leading-6 outline-none focus:border-brand-olive" /></label>
      <div className="flex gap-3 border-t border-border pt-4"><button type="button" onClick={closeProjectModal} className="h-11 flex-1 rounded-xl bg-muted text-sm font-bold text-muted-foreground">취소</button><button type="submit" disabled={saving} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-olive text-sm font-bold text-white disabled:opacity-50">{saving && <Loader2 size={15} className="animate-spin" />}{creatingProject ? "만들기" : "저장하기"}</button></div>
    </form></div></div>}
  </div>;
}

function ViewButton({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: typeof FolderKanban; label: string; count: number }) {
  return <button onClick={onClick} className={`flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold transition sm:text-sm ${active ? "bg-brand-olive text-white" : "text-muted-foreground hover:bg-brand-cream"}`}><Icon size={14} /><span>{label}</span><span className="text-[10px] opacity-70">{count}</span></button>;
}

function CompletionCheck({ checked, title, description, onChange }: { checked: boolean; title: string; description: string; onChange: (checked: boolean) => void }) {
  return <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${checked ? "border-brand-olive bg-brand-cream" : "border-border bg-stone-50"}`}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-olive" /><span><b className="block text-xs">{title}</b><small className="mt-0.5 block text-[10px] text-muted-foreground">{description}</small></span></label>;
}

function ProjectCard({ project, onEdit, onDelete }: { project: Project; onEdit: () => void; onDelete: () => void }) {
  const progress = projectProgress(project);
  const completedLabel = isUploaded(project) ? "업로드 완료" : isWorkComplete(project) ? "작업 완료" : null;
  return <article className="relative rounded-2xl border border-border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-olive/40 hover:shadow-md"><div className="flex items-start justify-between gap-3"><Link href={`/studio/shorts-story/projects/${project.id}`} className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-brand-cream px-2.5 py-1 text-[11px] font-bold text-brand-olive-dark">{project.category?.trim() || "미분류"}</span>{completedLabel && <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${isUploaded(project) ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>{completedLabel}</span>}</div><h3 className="truncate text-base font-bold">{project.title}</h3><div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 size={13} />{formatDate(project.updated_at)}</div></Link><div className="flex shrink-0 gap-1"><button type="button" onClick={onEdit} aria-label="수정" className="rounded-lg p-2 text-muted-foreground hover:bg-brand-cream hover:text-brand-olive"><Pencil size={14} /></button><button type="button" onClick={onDelete} aria-label="삭제" className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button></div></div><Link href={`/studio/shorts-story/projects/${project.id}`} className="mt-4 block"><div className="mb-2 flex items-center justify-between text-xs"><span className="font-semibold text-muted-foreground">{project.workflowLabel || "시작 전"}</span><span className="font-bold text-brand-olive">{progress}%</span></div><div className="flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand-olive" style={{ width: `${progress}%` }} /></div><ArrowRight size={15} className="text-muted-foreground" /></div></Link></article>;
}
