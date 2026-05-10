"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LayoutGrid,
  List,
  Plus,
  FileText,
  Clock,
  RectangleHorizontal,
  Smartphone,
  Scissors,
  Trash2,
  Loader2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

/* ─── 타입 ─── */
type SortKey = "modified" | "name" | "progress";
type ViewMode = "grid" | "list";
type CardSize = "sm" | "md" | "lg";

type Project = {
  id: number;
  title: string;
  status: string | null;
  progress: number;
  memo: string | null;
  updated_at: string;
  created_at: string;
};

/* ─── 설정 ─── */
const sortOptions: { key: SortKey; label: string }[] = [
  { key: "modified", label: "수정일" },
  { key: "name", label: "이름" },
  { key: "progress", label: "진행도" },
];

const cardSizeOptions: { key: CardSize; label: string }[] = [
  { key: "sm", label: "소" },
  { key: "md", label: "중" },
  { key: "lg", label: "대" },
];

const gridColsMap: Record<CardSize, string> = {
  sm: "grid-cols-4",
  md: "grid-cols-3",
  lg: "grid-cols-2",
};

const thumbHeightMap: Record<CardSize, string> = {
  sm: "h-32",
  md: "h-40",
  lg: "h-52",
};

const bgColors = ["bg-amber-100", "bg-sky-100", "bg-rose-100", "bg-violet-100", "bg-emerald-100", "bg-orange-100"];

/* ================================================================
   메인 페이지
   ================================================================ */
export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>("modified");
  const [view, setView] = useState<ViewMode>("grid");
  const [cardSize, setCardSize] = useState<CardSize>("md");

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    const orderCol = sort === "modified" ? "updated_at" : sort === "name" ? "title" : "progress";
    const asc = sort === "name";
    const { data } = await supabase.from("projects").select("*").order(orderCol, { ascending: asc });
    setProjects(data ?? []);
    setLoading(false);
  }, [sort]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleCreate = async () => {
    const { error } = await supabase.from("projects").insert({ title: "새 프로젝트", status: "시작 전", progress: 0 });
    if (!error) fetchProjects();
  };

  const handleDelete = async (id: number) => {
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (!error) fetchProjects();
  };

  /* 시간 표시 헬퍼 */
  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "방금 전";
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    return `${Math.floor(hours / 24)}일 전`;
  };

  return (
    <div className="relative min-h-[calc(100vh-60px)]">
      {/* ── 상단 헤더 ── */}
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          모든 프로젝트
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          콘텐츠가 방향을 만든다
        </p>
        <span className="mt-2 inline-block rounded-md bg-brand-olive/10 px-2.5 py-1 text-xs font-medium text-brand-olive-dark">
          총 {projects.length}개의 프로젝트
        </span>
      </div>

      {/* ── 정렬 / 필터 바 ── */}
      <div className="mb-5 flex items-center justify-between rounded-xl border border-border bg-white p-3 shadow-sm">
        {/* 왼쪽: 정렬 */}
        <div className="flex items-center gap-1">
          {sortOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSort(opt.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                sort === opt.key
                  ? "bg-brand-olive text-white"
                  : "text-muted-foreground hover:bg-brand-cream hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* 오른쪽: 뷰 + 크기 */}
        <div className="flex items-center gap-3">
          {/* 카드 크기 */}
          <div className="flex items-center gap-1 border-r border-border pr-3">
            {cardSizeOptions.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setCardSize(opt.key)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-150 ${
                  cardSize === opt.key
                    ? "bg-brand-pink/20 text-brand-olive-dark"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 뷰 모드 */}
          <div className="flex gap-1">
            <button
              onClick={() => setView("grid")}
              className={`rounded-md p-1.5 transition-all duration-150 ${
                view === "grid"
                  ? "bg-brand-olive/10 text-brand-olive"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setView("list")}
              className={`rounded-md p-1.5 transition-all duration-150 ${
                view === "list"
                  ? "bg-brand-olive/10 text-brand-olive"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── 로딩 ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-brand-olive" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText size={40} className="mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">아직 프로젝트가 없습니다.</p>
          <p className="text-xs text-muted-foreground">아래 버튼으로 첫 프로젝트를 만들어보세요!</p>
        </div>
      ) : view === "grid" ? (
        <div className={`grid gap-4 ${gridColsMap[cardSize]}`}>
          {projects.map((project, i) => (
            <GridCard
              key={project.id}
              project={project}
              thumbHeight={thumbHeightMap[cardSize]}
              color={bgColors[i % bgColors.length]}
              timeAgo={timeAgo}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project, i) => (
            <ListCard
              key={project.id}
              project={project}
              color={bgColors[i % bgColors.length]}
              timeAgo={timeAgo}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* ── 플로팅 버튼 ── */}
      <button
        onClick={handleCreate}
        className="fixed bottom-8 right-8 z-40 flex items-center gap-2 rounded-full bg-brand-pink px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition-all duration-200 hover:bg-brand-pink-dark hover:shadow-xl"
      >
        <Plus size={18} strokeWidth={2.5} />
        새 프로젝트
      </button>
    </div>
  );
}

/* ================================================================
   그리드 카드
   ================================================================ */
function GridCard({
  project,
  thumbHeight,
  color,
  timeAgo,
  onDelete,
}: {
  project: Project;
  thumbHeight: string;
  color: string;
  timeAgo: (d: string) => string;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-white shadow-sm transition-all duration-200 hover:shadow-md">
      {/* 썸네일 */}
      <div
        className={`${thumbHeight} ${color} flex items-center justify-center transition-all duration-200 group-hover:brightness-95`}
      >
        <FileText size={32} className="text-muted-foreground/40" />
      </div>

      {/* 정보 */}
      <div className="p-4">
        {/* 태그 */}
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Tag color="olive">{project.status ?? "대본"}</Tag>
          <Tag color="pink">
            <span className="flex items-center gap-1">
              <RectangleHorizontal size={11} />
              정방형
            </span>
          </Tag>
          <Tag color="muted">
            <span className="flex items-center gap-1">
              <Scissors size={11} />
              {project.progress}%
            </span>
          </Tag>
        </div>

        {/* 이름 + 삭제 */}
        <div className="flex items-start justify-between">
          <h3 className="text-sm font-semibold text-foreground group-hover:text-brand-olive-dark">
            {project.title}
          </h3>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(project.id); }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-all"
          >
            <Trash2 size={13} />
          </button>
        </div>

        {/* 수정 시간 */}
        <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock size={12} />
          {timeAgo(project.updated_at)}
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   리스트 카드
   ================================================================ */
function ListCard({ project, color, timeAgo, onDelete }: { project: Project; color: string; timeAgo: (d: string) => string; onDelete: (id: number) => void }) {
  return (
    <div className="group flex cursor-pointer items-center gap-4 rounded-xl border border-border bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md">
      {/* 썸네일 */}
      <div
        className={`${color} flex h-14 w-14 shrink-0 items-center justify-center rounded-lg`}
      >
        <FileText size={22} className="text-muted-foreground/40" />
      </div>

      {/* 이름 + 시간 */}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-brand-olive-dark">
          {project.title}
        </h3>
        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock size={12} />
          {timeAgo(project.updated_at)}
        </div>
      </div>

      {/* 태그 */}
      <div className="flex shrink-0 gap-1.5">
        <Tag color="olive">{project.status ?? "대본"}</Tag>
        <Tag color="muted">{project.progress}%</Tag>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onDelete(project.id); }}
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-all"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/* ================================================================
   태그 컴포넌트
   ================================================================ */
function Tag({
  children,
  color,
}: {
  children: React.ReactNode;
  color: "olive" | "pink" | "muted";
}) {
  const colorMap = {
    olive: "bg-brand-olive/10 text-brand-olive-dark",
    pink: "bg-brand-pink/15 text-brand-pink-dark",
    muted: "bg-muted text-muted-foreground",
  };

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${colorMap[color]}`}
    >
      {children}
    </span>
  );
}
