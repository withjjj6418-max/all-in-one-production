"use client";

import { useState } from "react";
import {
  LayoutGrid,
  List,
  Plus,
  FileText,
  Clock,
  RectangleHorizontal,
  Smartphone,
  Scissors,
} from "lucide-react";

/* ─── 타입 ─── */
type SortKey = "modified" | "name" | "progress";
type ViewMode = "grid" | "list";
type CardSize = "sm" | "md" | "lg";

/* ─── 더미 데이터 ─── */
const projects = [
  {
    id: 1,
    name: "호르무즈 해협",
    tags: { type: "대본", ratio: "정방형", cuts: 17 },
    modified: "8분 전",
    color: "bg-amber-100",
  },
  {
    id: 2,
    name: "임시 프로젝트 03/22",
    tags: { type: "대본", ratio: "세로", cuts: 0 },
    modified: "34분 전",
    color: "bg-sky-100",
  },
  {
    id: 3,
    name: "새 프로젝트",
    tags: { type: "대본", ratio: "세로", cuts: 0 },
    modified: "34분 전",
    color: "bg-rose-100",
  },
];

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

/* ================================================================
   메인 페이지
   ================================================================ */
export default function ProjectsPage() {
  const [sort, setSort] = useState<SortKey>("modified");
  const [view, setView] = useState<ViewMode>("grid");
  const [cardSize, setCardSize] = useState<CardSize>("md");

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

      {/* ── 프로젝트 카드 ── */}
      {view === "grid" ? (
        <div className={`grid gap-4 ${gridColsMap[cardSize]}`}>
          {projects.map((project) => (
            <GridCard
              key={project.id}
              project={project}
              thumbHeight={thumbHeightMap[cardSize]}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <ListCard key={project.id} project={project} />
          ))}
        </div>
      )}

      {/* ── 플로팅 버튼 ── */}
      <button className="fixed bottom-8 right-8 z-40 flex items-center gap-2 rounded-full bg-brand-pink px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition-all duration-200 hover:bg-brand-pink-dark hover:shadow-xl">
        <Plus size={18} strokeWidth={2.5} />
        새 프로젝트
      </button>
    </div>
  );
}

/* ================================================================
   그리드 카드
   ================================================================ */
type Project = (typeof projects)[number];

function GridCard({
  project,
  thumbHeight,
}: {
  project: Project;
  thumbHeight: string;
}) {
  return (
    <div className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-white shadow-sm transition-all duration-200 hover:shadow-md">
      {/* 썸네일 */}
      <div
        className={`${thumbHeight} ${project.color} flex items-center justify-center transition-all duration-200 group-hover:brightness-95`}
      >
        <FileText size={32} className="text-muted-foreground/40" />
      </div>

      {/* 정보 */}
      <div className="p-4">
        {/* 태그 */}
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Tag color="olive">{project.tags.type}</Tag>
          <Tag color="pink">
            {project.tags.ratio === "정방형" ? (
              <span className="flex items-center gap-1">
                <RectangleHorizontal size={11} />
                정방형
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Smartphone size={11} />
                세로
              </span>
            )}
          </Tag>
          <Tag color="muted">
            <span className="flex items-center gap-1">
              <Scissors size={11} />
              {project.tags.cuts}컷
            </span>
          </Tag>
        </div>

        {/* 이름 */}
        <h3 className="text-sm font-semibold text-foreground group-hover:text-brand-olive-dark">
          {project.name}
        </h3>

        {/* 수정 시간 */}
        <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock size={12} />
          {project.modified}
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   리스트 카드
   ================================================================ */
function ListCard({ project }: { project: Project }) {
  return (
    <div className="group flex cursor-pointer items-center gap-4 rounded-xl border border-border bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md">
      {/* 썸네일 */}
      <div
        className={`${project.color} flex h-14 w-14 shrink-0 items-center justify-center rounded-lg`}
      >
        <FileText size={22} className="text-muted-foreground/40" />
      </div>

      {/* 이름 + 시간 */}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-brand-olive-dark">
          {project.name}
        </h3>
        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock size={12} />
          {project.modified}
        </div>
      </div>

      {/* 태그 */}
      <div className="flex shrink-0 gap-1.5">
        <Tag color="olive">{project.tags.type}</Tag>
        <Tag color="pink">
          {project.tags.ratio === "정방형" ? "정방형" : "세로"}
        </Tag>
        <Tag color="muted">
          {project.tags.cuts}컷
        </Tag>
      </div>
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
