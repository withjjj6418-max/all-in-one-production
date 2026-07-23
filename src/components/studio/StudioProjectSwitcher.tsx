"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { ChevronDown, FolderKanban, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ProductionType } from "@/lib/project-workflows";

type ProjectOption = {
  id: number;
  title: string;
  category: string | null;
  status: string | null;
  uploaded: boolean | null;
};

const studioPaths: Record<ProductionType, string> = {
  shorts_story: "/studio/shorts-story",
  shorts_haejja: "/studio/shorts-haejja",
  longform_japan: "/studio/longform-japan",
  longform_movie: "/studio/longform-movie",
};

const storageKeys: Partial<Record<ProductionType, string>> = {
  shorts_story: "last-shorts-story-project-id",
  longform_japan: "last-longform-japan-project-id",
};

export function StudioProjectSwitcher({
  productionType,
  studioLabel,
}: {
  productionType: ProductionType;
  studioLabel: string;
}) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const currentProjectId = Number(params.id);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadProjects() {
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from("projects")
        .select("id, title, category, status, uploaded")
        .eq("production_type", productionType)
        .order("updated_at", { ascending: false });
      if (!active) return;
      setProjects((data || []) as ProjectOption[]);
      setError(Boolean(queryError));
      setLoading(false);
    }
    loadProjects();
    return () => { active = false; };
  }, [productionType, supabase]);

  function changeProject(nextProjectId: number) {
    if (!Number.isInteger(nextProjectId) || nextProjectId === currentProjectId) return;
    const storageKey = storageKeys[productionType];
    if (storageKey) window.localStorage.setItem(storageKey, String(nextProjectId));
    const nextPath = pathname.replace(/\/projects\/\d+(?=\/|$)/, `/projects/${nextProjectId}`);
    router.push(`${nextPath}${window.location.search}`);
  }

  const currentProject = projects.find((project) => project.id === currentProjectId);

  return <section className="mx-auto mb-5 max-w-7xl rounded-2xl border border-border bg-white px-4 py-3 shadow-sm sm:px-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 items-center gap-3 sm:w-52">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><FolderKanban size={17} /></div>
        <div className="min-w-0"><p className="text-[11px] font-bold text-muted-foreground">{studioLabel}</p><p className="truncate text-sm font-bold">{currentProject?.title || "프로젝트 불러오는 중"}</p></div>
      </div>
      <div className="relative min-w-0 flex-1">
        <select
          value={Number.isInteger(currentProjectId) ? currentProjectId : ""}
          onChange={(event) => changeProject(Number(event.target.value))}
          disabled={loading || error}
          aria-label={`${studioLabel} 프로젝트 변경`}
          className="h-11 w-full appearance-none rounded-xl border border-border bg-stone-50 pl-3 pr-10 text-sm font-semibold outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100 disabled:opacity-50"
        >
          {loading && <option value={currentProjectId}>프로젝트 목록 불러오는 중</option>}
          {!loading && error && <option value={currentProjectId}>프로젝트 목록을 불러오지 못했습니다</option>}
          {!loading && !error && projects.map((project) => <option key={project.id} value={project.id}>
            {project.category?.trim() ? `[${project.category.trim()}] ` : ""}{project.title}{project.uploaded ? " · 업로드 완료" : project.status === "작업 완료" ? " · 작업 완료" : ""}
          </option>)}
        </select>
        {loading ? <Loader2 size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" /> : <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />}
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <p className="text-[11px] text-muted-foreground">현재 작업 단계는 유지됩니다.</p>
        <Link href={studioPaths[productionType]} className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-stone-50 hover:text-foreground">전체 프로젝트</Link>
      </div>
    </div>
  </section>;
}
