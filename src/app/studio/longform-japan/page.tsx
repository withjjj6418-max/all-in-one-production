"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown, ArrowRight, ArrowUp, CheckCircle2, Clock3, FolderKanban,
  Languages, Loader2, Pencil, Plus, Search, Trash2, Upload, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { productionTypes } from "@/lib/project-workflows";
import { getJapanLongformWorkflowState } from "@/features/studios/longform-japan";

type Project = {
  id: number;
  title: string;
  status: string | null;
  progress: number | null;
  category: string | null;
  memo: string | null;
  updated_at: string | null;
  uploaded?: boolean | null;
  workflowProgress: number;
  workflowLabel: string;
};

type ProjectView = "active" | "work-complete" | "uploaded";
type SortKey = "progress" | "name" | "updated";

function isUploaded(project: Project) {
  return project.uploaded === true || project.status === "업로드 완료";
}

function isWorkComplete(project: Project) {
  return !isUploaded(project) && project.status === "작업 완료";
}

function formatDate(value: string | null) {
  if (!value) return "최근 수정 기록 없음";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function LongformJapanStudioPage() {
  const supabase = useMemo(() => createClient(), []);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schemaReady, setSchemaReady] = useState(true);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ProjectView>("active");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "updated", direction: "desc" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formMemo, setFormMemo] = useState("");

  useEffect(() => {
    let active = true;
    async function loadProjects() {
      const projectRes = await supabase.from("projects")
        .select("id, title, status, progress, category, memo, updated_at, uploaded")
        .eq("production_type", productionTypes.longformJapan)
        .order("updated_at", { ascending: false });
      if (!active) return;
      if (projectRes.error) {
        console.error("Failed to load Japan longform projects:", projectRes.error);
        setLoading(false);
        return;
      }

      const rows = (projectRes.data ?? []) as Omit<Project, "workflowProgress" | "workflowLabel">[];
      const ids = rows.map((project) => project.id);
      if (!ids.length) {
        setProjects([]);
        setLoading(false);
        return;
      }

      const [sourcesRes, scriptsRes, voiceRunsRes, visualsRes, scenesRes, editPackagesRes] = await Promise.all([
        supabase.from("japan_longform_sources").select("project_id").in("project_id", ids),
        supabase.from("japan_longform_scripts").select("project_id, adapted_korean, final_korean, verified_japanese").in("project_id", ids),
        supabase.from("japan_longform_voice_runs").select("project_id").in("project_id", ids),
        supabase.from("japan_longform_visual_assets").select("project_id, asset_kind").in("project_id", ids),
        supabase.from("japan_longform_story_scenes").select("project_id").in("project_id", ids),
        supabase.from("japan_longform_edit_packages").select("project_id, status").in("project_id", ids),
      ]);
      if (!active) return;

      const foundationResults = [sourcesRes, scriptsRes, voiceRunsRes, visualsRes, scenesRes, editPackagesRes];
      setSchemaReady(foundationResults.every((result) => !result.error));
      const sourceProjects = new Set((sourcesRes.data ?? []).map((row) => row.project_id));
      const scriptRows = new Map((scriptsRes.data ?? []).map((row) => [row.project_id, row]));
      const voiceProjects = new Set((voiceRunsRes.data ?? []).map((row) => row.project_id));
      const imageProjects = new Set((visualsRes.data ?? []).filter((row) => row.asset_kind === "thumbnail" || row.asset_kind === "background").map((row) => row.project_id));
      const motionProjects = new Set((visualsRes.data ?? []).filter((row) => row.asset_kind === "loop_video").map((row) => row.project_id));
      const sceneProjects = new Set((scenesRes.data ?? []).map((row) => row.project_id));
      const editProjects = new Set((editPackagesRes.data ?? []).filter((row) => row.status === "ready" || row.status === "done").map((row) => row.project_id));

      setProjects(rows.map((project) => {
        const script = scriptRows.get(project.id);
        const workflow = getJapanLongformWorkflowState({
          source: sourceProjects.has(project.id),
          adapt: Boolean(script?.adapted_korean),
          script: Boolean(script?.final_korean),
          translate: Boolean(script?.verified_japanese),
          voice: voiceProjects.has(project.id),
          image: imageProjects.has(project.id),
          scenes: sceneProjects.has(project.id),
          motion: motionProjects.has(project.id),
          premiere: editProjects.has(project.id),
          upload: project.uploaded === true,
        });
        return { ...project, workflowProgress: workflow.progress, workflowLabel: workflow.label };
      }));
      setLoading(false);
    }
    loadProjects();
    return () => { active = false; };
  }, [supabase]);

  const categories = Array.from(new Set(projects.map((project) => project.category?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "ko"));
  const visibleProjects = projects.filter((project) => {
    const keyword = query.trim().toLocaleLowerCase("ko-KR");
    return !keyword || project.title.toLocaleLowerCase("ko-KR").includes(keyword) || project.category?.toLocaleLowerCase("ko-KR").includes(keyword);
  });
  const activeCount = projects.filter((project) => !isWorkComplete(project) && !isUploaded(project)).length;
  const workCompleteCount = projects.filter(isWorkComplete).length;
  const uploadedCount = projects.filter(isUploaded).length;
  const currentProjects = visibleProjects.filter((project) => view === "uploaded" ? isUploaded(project) : view === "work-complete" ? isWorkComplete(project) : !isWorkComplete(project) && !isUploaded(project));
  const sortedProjects = [...currentProjects].sort((a, b) => {
    const comparison = sort.key === "progress" ? a.workflowProgress - b.workflowProgress
      : sort.key === "name" ? a.title.localeCompare(b.title, "ko")
        : new Date(a.updated_at || 0).getTime() - new Date(b.updated_at || 0).getTime();
    return sort.direction === "asc" ? comparison : -comparison;
  });
  const groups = sortedProjects.reduce<Record<string, Project[]>>((result, project) => {
    const category = project.category?.trim() || "미분류";
    (result[category] ||= []).push(project);
    return result;
  }, {});
  const categoryGroups = Object.entries(groups).sort(([a], [b]) => a === "미분류" ? 1 : b === "미분류" ? -1 : a.localeCompare(b, "ko"));

  const openCreate = () => {
    setEditingProject(null);
    setFormTitle("");
    setFormCategory("");
    setFormMemo("");
    setModalOpen(true);
  };

  const openEdit = (project: Project) => {
    setEditingProject(project);
    setFormTitle(project.title);
    setFormCategory(project.category || "");
    setFormMemo(project.memo || "");
    setModalOpen(true);
  };

  const saveProject = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formTitle.trim()) return;
    setSaving(true);
    const now = new Date().toISOString();
    const values = { title: formTitle.trim(), category: formCategory.trim() || null, memo: formMemo.trim() || null, updated_at: now };

    if (editingProject) {
      const { error } = await supabase.from("projects").update(values).eq("id", editingProject.id).eq("production_type", productionTypes.longformJapan);
      if (error) window.alert("프로젝트 수정에 실패했습니다.");
      else {
        setProjects((current) => current.map((project) => project.id === editingProject.id ? { ...project, ...values } : project));
        setModalOpen(false);
      }
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) window.alert("로그인이 필요합니다.");
      else {
        const { data, error } = await supabase.from("projects").insert({
          ...values,
          user_id: user.id,
          production_type: productionTypes.longformJapan,
          status: "시작 전",
          progress: 0,
          uploaded: false,
        }).select("id, title, status, progress, category, memo, updated_at, uploaded").single();
        if (error || !data) window.alert("일본 롱폼 프로젝트 생성에 실패했습니다.");
        else {
          const project = { ...data, workflowProgress: 0, workflowLabel: "시작 전" } as Project;
          setProjects((current) => [project, ...current]);
          window.localStorage.setItem("last-longform-japan-project-id", String(project.id));
          setModalOpen(false);
        }
      }
    }
    setSaving(false);
  };

  const deleteProject = async (project: Project) => {
    if (!window.confirm(`‘${project.title}’ 일본 롱폼 프로젝트와 연결된 데이터를 모두 삭제할까요?`)) return;
    const { error } = await supabase.from("projects").delete().eq("id", project.id).eq("production_type", productionTypes.longformJapan);
    if (error) return window.alert("프로젝트 삭제에 실패했습니다.");
    setProjects((current) => current.filter((item) => item.id !== project.id));
  };

  return <div className="mx-auto max-w-6xl space-y-6">
    <section className="rounded-3xl border border-border bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="mb-3 inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700"><Languages size={14} /> 롱폼(일본)</div><h1 className="text-3xl font-bold tracking-tight">일본 롱폼 제작 스튜디오</h1><p className="mt-2 text-sm text-muted-foreground">한국어 원문부터 일본어 음성·영상·업로드까지 전용 흐름으로 관리합니다.</p></div>
        <button type="button" onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-olive px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-brand-olive-dark"><Plus size={16} /> 새 프로젝트</button>
      </div>
    </section>

    {!schemaReady && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">Supabase에서 `20260721_longform_japan_foundation.sql`을 실행하면 단계별 진행도가 연결됩니다.</div>}

    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <label className="relative flex-1"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="프로젝트 또는 카테고리 검색" className="h-11 w-full rounded-xl border border-border bg-white pl-10 pr-4 text-sm outline-none focus:border-brand-olive" /></label>
      <div className="grid grid-cols-3 rounded-xl border border-border bg-white p-1 shadow-sm"><ViewButton active={view === "active"} onClick={() => setView("active")} icon={FolderKanban} label="진행 중" count={activeCount} /><ViewButton active={view === "work-complete"} onClick={() => setView("work-complete")} icon={CheckCircle2} label="작업 완료" count={workCompleteCount} /><ViewButton active={view === "uploaded"} onClick={() => setView("uploaded")} icon={Upload} label="업로드 완료" count={uploadedCount} /></div>
    </div>

    <div className="flex flex-wrap items-center justify-end gap-1.5"><span className="mr-1 text-[11px] font-bold text-muted-foreground">카드 정렬</span>{([{ key: "progress", label: "진행도순" }, { key: "name", label: "이름순" }, { key: "updated", label: "수정순" }] as const).map((item) => { const active = sort.key === item.key; const DirectionIcon = sort.direction === "asc" ? ArrowUp : ArrowDown; return <button key={item.key} type="button" onClick={() => setSort((current) => current.key === item.key ? { ...current, direction: current.direction === "asc" ? "desc" : "asc" } : { key: item.key, direction: item.key === "name" ? "asc" : "desc" })} className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-bold ${active ? "border-brand-olive bg-brand-cream text-brand-olive-dark" : "border-border bg-white text-muted-foreground"}`}>{item.label}{active && <DirectionIcon size={12} />}</button>; })}</div>

    {loading ? <div className="flex min-h-64 items-center justify-center rounded-2xl border border-border bg-white"><Loader2 className="animate-spin text-brand-olive" /></div>
      : currentProjects.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white px-6 text-center"><Languages size={35} className="text-muted-foreground/40" /><p className="mt-3 font-bold">표시할 일본 롱폼 프로젝트가 없습니다</p><p className="mt-1 text-sm text-muted-foreground">새 프로젝트를 만들어 첫 제작을 시작하세요.</p></div>
        : <div className="space-y-8">{categoryGroups.map(([category, categoryProjects]) => <section key={category}><div className="mb-3 flex items-center gap-2 px-1"><FolderKanban size={17} className="text-sky-700" /><h2 className="font-bold">{category}</h2><span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-muted-foreground shadow-sm">{categoryProjects.length}</span></div><div className="grid gap-3 md:grid-cols-3">{categoryProjects.map((project) => <ProjectCard key={project.id} project={project} onEdit={() => openEdit(project)} onDelete={() => deleteProject(project)} />)}</div></section>)}</div>}

    {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl border border-border bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-border px-6 py-4"><h2 className="flex items-center gap-2 font-bold"><Languages size={18} className="text-sky-700" />{editingProject ? "프로젝트 편집" : "일본 롱폼 프로젝트 만들기"}</h2><button type="button" onClick={() => setModalOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><X size={17} /></button></div><form onSubmit={saveProject} className="space-y-4 p-6">
      <label className="block"><span className="text-xs font-bold text-muted-foreground">카테고리</span><input list="japan-longform-categories" value={formCategory} onChange={(event) => setFormCategory(event.target.value)} placeholder="예: 괴담, 사건, 미스터리" className="mt-1.5 h-11 w-full rounded-xl border border-border px-3 text-sm outline-none focus:border-brand-olive" /><datalist id="japan-longform-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist></label>
      <label className="block"><span className="text-xs font-bold text-muted-foreground">제목 *</span><input required value={formTitle} onChange={(event) => setFormTitle(event.target.value)} placeholder="프로젝트 제목" className="mt-1.5 h-11 w-full rounded-xl border border-border px-3 text-sm outline-none focus:border-brand-olive" /></label>
      <label className="block"><span className="text-xs font-bold text-muted-foreground">메모 (선택)</span><textarea value={formMemo} onChange={(event) => setFormMemo(event.target.value)} placeholder="소재나 제작 방향을 기록하세요" className="mt-1.5 min-h-28 w-full rounded-xl border border-border p-3 text-sm leading-6 outline-none focus:border-brand-olive" /></label>
      <div className="flex gap-3 border-t border-border pt-4"><button type="button" onClick={() => setModalOpen(false)} className="h-11 flex-1 rounded-xl bg-muted text-sm font-bold text-muted-foreground">취소</button><button type="submit" disabled={saving} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-olive text-sm font-bold text-white disabled:opacity-50">{saving && <Loader2 size={15} className="animate-spin" />}{editingProject ? "저장하기" : "만들기"}</button></div>
    </form></div></div>}
  </div>;
}

function ViewButton({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: typeof FolderKanban; label: string; count: number }) {
  return <button onClick={onClick} className={`flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold transition sm:text-sm ${active ? "bg-brand-olive text-white" : "text-muted-foreground hover:bg-brand-cream"}`}><Icon size={14} /><span>{label}</span><span className="text-[10px] opacity-70">{count}</span></button>;
}

function ProjectCard({ project, onEdit, onDelete }: { project: Project; onEdit: () => void; onDelete: () => void }) {
  const completedLabel = isUploaded(project) ? "업로드 완료" : isWorkComplete(project) ? "작업 완료" : null;
  return <article className="rounded-2xl border border-border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"><div className="flex items-start justify-between gap-3"><Link href={`/studio/longform-japan/projects/${project.id}`} className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">{project.category?.trim() || "미분류"}</span>{completedLabel && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">{completedLabel}</span>}</div><h3 className="truncate text-base font-bold">{project.title}</h3><div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 size={13} />{formatDate(project.updated_at)}</div></Link><div className="flex shrink-0 gap-1"><button type="button" onClick={onEdit} aria-label="수정" className="rounded-lg p-2 text-muted-foreground hover:bg-sky-50 hover:text-sky-700"><Pencil size={14} /></button><button type="button" onClick={onDelete} aria-label="삭제" className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button></div></div><Link href={`/studio/longform-japan/projects/${project.id}`} className="mt-4 block"><div className="mb-2 flex items-center justify-between text-xs"><span className="font-semibold text-muted-foreground">{project.workflowLabel}</span><span className="font-bold text-sky-700">{project.workflowProgress}%</span></div><div className="flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-sky-700" style={{ width: `${project.workflowProgress}%` }} /></div><ArrowRight size={15} className="text-muted-foreground" /></div></Link></article>;
}
