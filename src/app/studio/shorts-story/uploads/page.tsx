"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Loader2, Search, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type UploadedProject = {
  id: number;
  title: string;
  category: string | null;
  updated_at: string | null;
};

type PublishRecord = {
  project_id: number;
  final_title: string;
  youtube_url: string;
  uploaded_at: string | null;
  memo: string;
};

function formatDate(value: string | null) {
  if (!value) return "날짜 미등록";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`));
}

export default function StoryUploadListPage() {
  const supabase = useMemo(() => createClient(), []);
  const [projects, setProjects] = useState<UploadedProject[]>([]);
  const [records, setRecords] = useState<Record<number, PublishRecord>>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [schemaReady, setSchemaReady] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const projectRes = await supabase.from("projects").select("id, title, category, updated_at").eq("production_type", "shorts_story").eq("uploaded", true).order("updated_at", { ascending: false });
      if (!active) return;
      const loadedProjects = (projectRes.data ?? []) as UploadedProject[];
      setProjects(loadedProjects);
      if (loadedProjects.length) {
        const recordRes = await supabase.from("story_publish_records").select("project_id, final_title, youtube_url, uploaded_at, memo").in("project_id", loadedProjects.map((item) => item.id));
        if (!active) return;
        if (recordRes.error?.code === "42P01" || recordRes.error?.code === "PGRST205") setSchemaReady(false);
        else setRecords(Object.fromEntries(((recordRes.data ?? []) as PublishRecord[]).map((item) => [item.project_id, item])));
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [supabase]);

  const visibleProjects = projects.filter((project) => {
    const keyword = query.trim().toLocaleLowerCase("ko-KR");
    const record = records[project.id];
    return !keyword || [project.title, project.category, record?.final_title, record?.memo].some((value) => value?.toLocaleLowerCase("ko-KR").includes(keyword));
  });

  if (!schemaReady) return <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-7 shadow-sm"><h1 className="text-lg font-bold">업로드 기록 테이블 설정이 필요합니다</h1><p className="mt-3 text-sm text-muted-foreground">Supabase에서 `20260718_story_publish.sql`을 실행해주세요.</p></div>;

  return <div className="mx-auto max-w-6xl space-y-5">
    <div><Link href="/studio/shorts-story" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-brand-olive"><ArrowLeft size={15} /> 사연 프로젝트</Link><div className="mt-3"><h1 className="text-2xl font-bold sm:text-3xl">업로드 목록</h1><p className="mt-1 text-sm text-muted-foreground">업로드를 완료한 숏폼(사연) 영상과 YouTube 링크를 모아봅니다.</p></div></div>
    <label className="flex h-11 items-center gap-2 rounded-xl border border-border bg-white px-3.5 shadow-sm focus-within:border-brand-olive"><Search size={16} className="text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="프로젝트, 최종 제목 또는 메모 검색" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /><span className="text-xs font-bold text-muted-foreground">{visibleProjects.length}개</span></label>
    {loading ? <div className="flex min-h-64 items-center justify-center rounded-2xl border border-border bg-white"><Loader2 className="animate-spin text-brand-olive" /></div> : visibleProjects.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white"><Upload size={32} className="text-muted-foreground/40" /><p className="mt-3 font-bold">등록된 업로드 결과가 없습니다</p><p className="mt-1 text-sm text-muted-foreground">프로젝트의 마지막 단계에서 YouTube 링크를 등록해주세요.</p></div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleProjects.map((project) => { const record = records[project.id]; return <article key={project.id} className="flex min-h-56 flex-col rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className="rounded-full bg-brand-cream px-2.5 py-1 text-[11px] font-bold text-brand-olive-dark">{project.category || "미분류"}</span><h2 className="mt-3 line-clamp-2 font-bold">{record?.final_title || project.title}</h2><p className="mt-1 truncate text-xs text-muted-foreground">프로젝트: {project.title}</p></div><Upload size={18} className="shrink-0 text-emerald-600" /></div><p className="mt-3 flex-1 line-clamp-3 text-xs leading-5 text-muted-foreground">{record?.memo || "등록된 메모가 없습니다."}</p><div className="mt-4 flex items-center justify-between border-t border-border pt-3"><span className="text-xs font-semibold text-muted-foreground">{formatDate(record?.uploaded_at || project.updated_at?.slice(0, 10) || null)}</span><div className="flex gap-2">{record?.youtube_url && <a href={record.youtube_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold hover:border-brand-olive"><ExternalLink size={12} /> YouTube</a>}<Link href={`/studio/shorts-story/projects/${project.id}/publish`} className="rounded-lg bg-brand-olive px-2.5 py-1.5 text-xs font-bold text-white">수정</Link></div></div></article>; })}</div>}
  </div>;
}
