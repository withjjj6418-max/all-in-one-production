"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  FileText,
  Clock,
  Trash2,
  Loader2,
  Edit2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/* ─── 타입 ─── */
type SortKey = "updated" | "name" | "progress";

type Project = {
  id: number;
  title: string;
  status: string | null;
  progress: number;
  memo: string | null;
  updated_at: string | null;
};

/* ─── 설정 ─── */
const sortOptions: { key: SortKey; label: string }[] = [
  { key: "updated", label: "수정일" },
  { key: "name", label: "이름" },
  { key: "progress", label: "진행도" },
];

const bgColors = ["bg-amber-100", "bg-sky-100", "bg-rose-100", "bg-violet-100", "bg-emerald-100", "bg-orange-100"];

/* ================================================================
   메인 페이지
   ================================================================ */
export default function ProjectsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  
  // 편집 모달 관련 상태
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Project>>({});

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("projects")
      .select("id, title, status, progress, memo, updated_at")
      .order("updated_at", { ascending: false });
    if (error) console.error("fetch error:", error);
    setProjects(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleSortClick = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      if (key === "name") {
        setSortDir("asc");
      } else {
        setSortDir("desc");
      }
    }
  };

  const getSortedProjects = () => {
    const list = [...projects];
    list.sort((a, b) => {
      if (sortKey === "progress") {
        const aIs100 = a.progress === 100;
        const bIs100 = b.progress === 100;
        
        if (aIs100 && !bIs100) return 1;
        if (!aIs100 && bIs100) return -1;
        if (aIs100 && bIs100) return 0;
        
        const diff = a.progress - b.progress;
        return sortDir === "asc" ? diff : -diff;
      }
      
      if (sortKey === "name") {
        const compare = a.title.localeCompare(b.title, "ko");
        return sortDir === "asc" ? compare : -compare;
      }
      
      if (sortKey === "updated") {
        const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        const diff = aTime - bTime;
        return sortDir === "asc" ? diff : -diff;
      }
      
      return 0;
    });
    return list;
  };

  const handleCreate = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('로그인 세션이 만료되었습니다. 다시 로그인해주세요.');
        window.location.href = '/login';
        return;
      }

      const { error } = await supabase
        .from("projects")
        .insert({ 
          title: "새 프로젝트", 
          status: "시작 전", 
          progress: 0,
          updated_at: new Date().toISOString(),
          user_id: user.id
        });
      if (error) {
        console.error("insert error details:", error.message, error.details, error.hint);
        return;
      }
      fetchProjects();
    } catch (err) {
      console.error("Error in handleCreate:", err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("정말 이 프로젝트를 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) {
      console.error("delete error:", error);
      return;
    }
    fetchProjects();
  };

  const openEditModal = (project: Project) => {
    setSelectedProject(project);
    setEditForm({
      title: project.title,
      status: project.status,
      progress: project.progress,
      memo: project.memo,
    });
    setIsModalOpen(true);
  };

  const handleUpdate = async () => {
    if (!selectedProject) return;
    const { error } = await supabase
      .from("projects")
      .update({
        ...editForm,
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedProject.id);

    if (error) {
      alert("업데이트 중 오류가 발생했습니다.");
      console.error(error);
      return;
    }

    setIsModalOpen(false);
    fetchProjects();
  };

  /* 시간 표시 헬퍼 */
  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return "방금 전";
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
          {sortOptions.map((opt) => {
            const isActive = sortKey === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => handleSortClick(opt.key)}
                className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-brand-olive text-white"
                    : "text-muted-foreground hover:bg-brand-cream hover:text-foreground"
                }`}
              >
                <span>{opt.label}</span>
                {isActive && (
                  sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                )}
              </button>
            );
          })}
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
      ) : (
        <div className="space-y-4">
          {getSortedProjects().map((project, idx) => (
            <ListCard
              key={project.id}
              project={project}
              color={bgColors[idx % bgColors.length]}
              timeAgo={timeAgo}
              onDelete={handleDelete}
              onEdit={() => openEditModal(project)}
              onClick={() => router.push(`/projects/${project.id}`)}
            />
          ))}
        </div>
      )}

      {/* ── 편집 모달 ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-200 rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="mb-5 text-xl font-bold text-gray-800">프로젝트 편집</h2>
            
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">제목</label>
                <input
                  type="text"
                  value={editForm.title || ""}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-pink focus:ring-1 focus:ring-brand-pink"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">상태</label>
                <select
                  value={editForm.status || "시작 전"}
                  onChange={(e) => {
                    const newStatus = e.target.value;
                    const statusProgressMap: Record<string, number> = {
                      "시작 전": 0,
                      "리서치": 15,
                      "대본 작성": 30,
                      "대본 완성": 40,
                      "녹음 중": 55,
                      "편집 중": 70,
                      "검토 중": 85,
                      "업로드 완료": 100,
                    };
                    setEditForm({ 
                      ...editForm, 
                      status: newStatus, 
                      progress: statusProgressMap[newStatus] ?? editForm.progress 
                    });
                  }}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-pink focus:ring-1 focus:ring-brand-pink"
                >
                  {["시작 전", "리서치", "대본 작성", "대본 완성", "녹음 중", "편집 중", "검토 중", "업로드 완료"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-1 flex justify-between">
                  <label className="text-sm font-medium text-gray-600">진행률</label>
                  <span className="text-sm font-bold text-brand-pink">{editForm.progress}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={editForm.progress || 0}
                  onChange={(e) => setEditForm({ ...editForm, progress: parseInt(e.target.value) })}
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-100 accent-brand-pink"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">메모</label>
                <textarea
                  value={editForm.memo || ""}
                  onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-pink focus:ring-1 focus:ring-brand-pink"
                  placeholder="메모를 입력하세요..."
                />
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-200"
              >
                취소
              </button>
              <button
                onClick={handleUpdate}
                className="flex-1 rounded-xl bg-brand-pink py-3 text-sm font-semibold text-white transition hover:bg-brand-pink-dark shadow-md"
              >
                저장하기
              </button>
            </div>
          </div>
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
   리스트 카드
   ================================================================ */
function ListCard({ project, color, timeAgo, onDelete, onEdit, onClick }: { project: Project; color: string; timeAgo: (d: string | null) => string; onDelete: (id: number) => void; onEdit: () => void; onClick: () => void }) {
  return (
    <div 
      onClick={onClick}
      className="group flex cursor-pointer items-center gap-4 rounded-xl border border-border bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
    >
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

      {/* 액션 버튼 */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onEdit();
          }}
          className="rounded-md p-2 text-muted-foreground transition hover:bg-brand-olive/10 hover:text-brand-olive"
        >
          <Edit2 size={18} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDelete(project.id);
          }}
          className="rounded-md p-2 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-500"
        >
          <Trash2 size={18} />
        </button>
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
