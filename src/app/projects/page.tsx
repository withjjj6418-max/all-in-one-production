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
  Search,
  Folder,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  AlertCircle
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/* ─── 타입 정의 ─── */
type Project = {
  id: number;
  title: string;
  status: string | null;
  progress: number;
  memo: string | null;
  updated_at: string | null;
  category: string | null;
  uploaded?: boolean | null;
};

const bgColors = ["bg-amber-100", "bg-sky-100", "bg-rose-100", "bg-violet-100", "bg-emerald-100", "bg-orange-100"];

const statusOptions = ["시작 전", "리서치", "대본 작성", "대본 완성", "녹음 중", "편집 중", "검토 중", "업로드 완료"];

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

export default function ProjectsPage() {
  const supabase = createClient();
  const router = useRouter();

  /* ─── 상태 관리 ─── */
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("전체");

  // 추가 및 수정 통합 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  
  // 모달 폼 상태
  const [formCategory, setFormCategory] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formStatus, setFormStatus] = useState("시작 전");
  const [formProgress, setFormProgress] = useState(0);
  const [formMemo, setFormMemo] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [formUploaded, setFormUploaded] = useState(false);

  // 유저 정보 및 토스트
  const [userId, setUserId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 카테고리별 독립 페이지네이션 상태
  const [categoryPages, setCategoryPages] = useState<Record<string, number>>({});

  // 정렬 상태
  const [projectSort, setProjectSort] = useState<{
    key: "name" | "updated" | "progress";
    dir: "asc" | "desc";
  }>({ key: "updated", dir: "desc" });

  const [categorySort, setCategorySort] = useState<{
    dir: "asc" | "desc";
  }>({ dir: "asc" });

  // 폴더 접힘 상태 (기본적으로 펼침 상태로 시작하도록 빈 객체 유지하고, 렌더링 시 ?? false로 처리)
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // 카테고리 인라인 수정 상태
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");

  /* ─── 토스트 헬퍼 ─── */
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  /* ─── 데이터 조회 ─── */
  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setProjects([]);
        setLoading(false);
        return;
      }
      setUserId(user.id);

      const { data, error } = await supabase
        .from("projects")
        .select("id, title, status, progress, memo, updated_at, category, uploaded")
        .or("uploaded.eq.false,uploaded.is.null")
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("fetch error:", error);
      } else {
        setProjects(data ?? []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  /* ─── 프로젝트 삭제 ─── */
  const handleDelete = async (id: number) => {
    if (!confirm("정말 이 프로젝트를 삭제하시겠습니까?")) return;
    try {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) {
        alert(`삭제 실패: ${error.message}`);
        return;
      }
      showToast("🗑️ 프로젝트가 삭제되었습니다.");
      fetchProjects();
    } catch (err) {
      console.error(err);
    }
  };

  /* ─── 카테고리 이름 일괄 수정 ─── */
  const startEditCategory = (category: string) => {
    setEditingCategory(category);
    setEditingCategoryName(category);
  };

  const cancelEditCategory = () => {
    setEditingCategory(null);
    setEditingCategoryName("");
  };

  const handleSaveCategoryName = async (originalName: string) => {
    const newName = editingCategoryName.trim();
    if (!newName) {
      alert("카테고리 이름을 입력해 주세요.");
      return;
    }
    if (newName === originalName) {
      cancelEditCategory();
      return;
    }

    try {
      let query = supabase.from("projects").update({ category: newName });
      if (originalName === "미분류") {
        query = query.is("category", null);
      } else {
        query = query.eq("category", originalName);
      }

      const { error } = await query;

      if (error) {
        console.error("카테고리 이름 일괄 변경 실패:", error.message);
        alert(`변경 실패: ${error.message}`);
      } else {
        showToast("🏷️ 카테고리 이름이 일괄 변경되었습니다!");
        fetchProjects();
        cancelEditCategory();
      }
    } catch (err) {
      console.error(err);
      alert("처리 중 예기치 못한 오류가 발생했습니다.");
    }
  };

  /* ─── 모달 열기 ─── */
  const openAddModal = () => {
    setEditingProjectId(null);
    setFormCategory("");
    setNewCategoryName("");
    setFormTitle("새 프로젝트");
    setFormStatus("시작 전");
    setFormProgress(0);
    setFormMemo("");
    setFormUploaded(false);
    setIsModalOpen(true);
  };

  const openAddModalWithCategory = (categoryName: string) => {
    setEditingProjectId(null);
    setFormCategory(categoryName === "미분류" ? "" : categoryName);
    setNewCategoryName("");
    setFormTitle("새 프로젝트");
    setFormStatus("시작 전");
    setFormProgress(0);
    setFormMemo("");
    setFormUploaded(false);
    setIsModalOpen(true);
  };

  const openEditModal = (project: Project) => {
    setEditingProjectId(project.id);
    setFormCategory(project.category || "");
    setNewCategoryName("");
    setFormTitle(project.title || "");
    setFormStatus(project.status || "시작 전");
    setFormProgress(project.progress || 0);
    setFormMemo(project.memo || "");
    setFormUploaded(project.uploaded || false);
    setIsModalOpen(true);
  };

  /* ─── 폼 저장 (추가/수정) ─── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formTitle.trim()) {
      alert("프로젝트 제목은 필수입니다.");
      return;
    }

    const finalCategory = (formCategory === "__new__" ? newCategoryName.trim() : formCategory.trim()) || null;

    try {
      const payload: Record<string, any> = {
        title: formTitle.trim(),
        status: formStatus,
        progress: formProgress,
        memo: formMemo.trim() || null,
        category: finalCategory,
        updated_at: new Date().toISOString(),
        user_id: userId,
      };

      if (editingProjectId) {
        payload.uploaded = formUploaded;
        // 수정 모드
        const { error } = await supabase
          .from("projects")
          .update(payload)
          .eq("id", editingProjectId);

        if (error) {
          alert(`수정 실패: ${error.message}`);
        } else {
          showToast("✏️ 프로젝트가 정상적으로 수정되었습니다!");
          setIsModalOpen(false);
          fetchProjects();
        }
      } else {
        // 추가 모드
        const { error } = await supabase
          .from("projects")
          .insert(payload);

        if (error) {
          alert(`생성 실패: ${error.message}`);
        } else {
          showToast("🎉 새 프로젝트가 안전하게 생성되었습니다!");
          setIsModalOpen(false);
          fetchProjects();
        }
      }
    } catch (err) {
      console.error(err);
      alert("처리 중 예측하지 못한 오류가 발생했습니다.");
    }
  };

  /* ─── 카테고리 접기/펼치기 토글 ─── */
  const toggleCategoryCollapse = (category: string) => {
    setCollapsedCategories((prev) => {
      const currentVal = prev[category] ?? false; // 기본 펼침이므로 기본값 false
      return {
        ...prev,
        [category]: !currentVal,
      };
    });
  };

  /* ─── 페이지 전환 핸들러 ─── */
  const handlePageChange = (category: string, page: number) => {
    setCategoryPages((prev) => ({
      ...prev,
      [category]: page,
    }));
  };

  /* ─── 페이지 번호 생성 헬퍼 ─── */
  const getPageNumbers = (current: number, total: number) => {
    const pages: (number | string)[] = [];
    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      if (current > 3) {
        pages.push("...");
      }
      const start = Math.max(2, current - 1);
      const end = Math.min(total - 1, current + 1);
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (current < total - 2) {
        pages.push("...");
      }
      pages.push(total);
    }
    return pages;
  };

  /* ─── 시간 표시 헬퍼 ─── */
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

  /* ─── 카테고리 추출 ─── */
  const uniqueCategories = Array.from(
    new Set(projects.map((p) => p.category || "미분류"))
  ).sort((a, b) => a.localeCompare(b, "ko"));

  /* ─── 필터링 ─── */
  const filteredProjects = projects.filter((project) => {
    const titleMatch = project.title.toLowerCase().includes(searchQuery.toLowerCase());
    const memoMatch = project.memo?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false;
    const statusMatch = project.status?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false;
    const keywordMatch = searchQuery === "" || titleMatch || memoMatch || statusMatch;

    const categoryMatch = selectedCategory === "전체" || (project.category || "미분류") === selectedCategory;

    return keywordMatch && categoryMatch;
  });

  /* ─── 카테고리 그룹핑 ─── */
  const groupedProjects: { [key: string]: Project[] } = {};
  filteredProjects.forEach((project) => {
    const cat = project.category || "미분류";
    if (!groupedProjects[cat]) {
      groupedProjects[cat] = [];
    }
    groupedProjects[cat].push(project);
  });

  /* ─── 카테고리 내 정렬 ─── */
  Object.keys(groupedProjects).forEach((cat) => {
    groupedProjects[cat] = [...groupedProjects[cat]].sort((a, b) => {
      let comparison = 0;
      if (projectSort.key === "name") {
        comparison = a.title.localeCompare(b.title, "ko");
      } else if (projectSort.key === "updated") {
        const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        comparison = aTime - bTime;
      } else if (projectSort.key === "progress") {
        comparison = a.progress - b.progress;
      }
      return projectSort.dir === "asc" ? comparison : -comparison;
    });
  });

  /* ─── 카테고리 정렬 ─── */
  const sortedCategoryKeys = Object.keys(groupedProjects).sort((a, b) => {
    const comparison = a.localeCompare(b, "ko");
    return categorySort.dir === "asc" ? comparison : -comparison;
  });

  return (
    <div className="px-3 py-3 sm:p-5 space-y-4 max-w-7xl mx-auto min-w-0">
      
      {/* ─── 1. 상단 헤더 ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-brand-olive/10 text-brand-olive rounded-xl shadow-inner">
            <span className="text-2xl leading-none">📂</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800 tracking-tight">프로젝트</h1>
            <p className="text-[11px] text-gray-400 font-medium mt-0.5">콘텐츠가 방향을 만든다</p>
          </div>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-[#7C8C4E] hover:bg-[#6c7b44] text-white rounded-xl text-xs font-semibold shadow-sm hover:shadow transition-all transform hover:-translate-y-0.5 active:translate-y-0 shrink-0"
        >
          <Plus size={14} className="stroke-[2.5]" />
          <span>새 프로젝트</span>
        </button>
      </div>

      {/* ─── 2. 검색 및 카테고리 필터 ─── */}
      <div className="flex flex-col sm:flex-row gap-2 max-w-2xl">
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="검색..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#7C8C4E]/30 focus:border-[#7C8C4E] transition-all bg-gray-50/50 text-gray-700 font-medium"
          />
        </div>
        <div className="w-full sm:w-44 shrink-0">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#7C8C4E]/30 focus:border-[#7C8C4E] transition-all bg-white font-semibold text-gray-600 cursor-pointer"
          >
            <option value="전체">📂 전체 카테고리</option>
            {uniqueCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ─── 3. 정렬 컨트롤 영역 ─── */}
      <div className="flex items-center gap-1.5 flex-wrap p-1 max-w-2xl text-[11px] sm:text-xs">
        {/* 폴더이름 */}
        <button
          onClick={() => {
            setCategorySort((prev) => ({
              dir: prev.dir === "asc" ? "desc" : "asc",
            }));
          }}
          className="flex items-center gap-0.5 px-2.5 py-1 rounded-lg border transition cursor-pointer font-semibold bg-white border-gray-200 text-gray-500 hover:bg-gray-50/80 active:bg-gray-100/50 shadow-sm"
        >
          <span>폴더이름</span>
          {categorySort.dir === "asc" ? <ArrowUp size={10} className="stroke-[2.5]" /> : <ArrowDown size={10} className="stroke-[2.5]" />}
        </button>

        {/* 프로젝트 정렬 버튼들 */}
        {(
          [
            { key: "name", label: "이름" },
            { key: "updated", label: "수정일" },
            { key: "progress", label: "진행도" },
          ] as const
        ).map((item) => {
          const isActive = projectSort.key === item.key;
          return (
            <button
              key={item.key}
              onClick={() => {
                setProjectSort((prev) => ({
                  key: item.key,
                  dir: prev.key === item.key ? (prev.dir === "asc" ? "desc" : "asc") : "asc",
                }));
              }}
              className={`flex items-center gap-0.5 px-2.5 py-1 rounded-lg border transition cursor-pointer font-semibold shadow-sm ${
                isActive
                  ? "bg-[#7C8C4E]/10 border-[#7C8C4E]/30 text-[#7C8C4E]"
                  : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50/80 active:bg-gray-100/50"
              }`}
            >
              <span>{item.label}</span>
              {isActive && (
                projectSort.dir === "asc" ? <ArrowUp size={10} className="stroke-[2.5]" /> : <ArrowDown size={10} className="stroke-[2.5]" />
              )}
            </button>
          );
        })}
      </div>

      {/* ─── 4. 메인 프로젝트 리스트 영역 ─── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <Loader2 size={24} className="animate-spin text-[#7C8C4E]" />
          <p className="text-xs font-semibold text-gray-400">데이터를 불러오는 중입니다...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-white rounded-3xl border border-dashed border-gray-200 shadow-sm space-y-3">
          <div className="p-3 bg-gray-50 rounded-full text-gray-400">
            <Folder size={32} className="stroke-[1.5]" />
          </div>
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-gray-700">아직 등록된 프로젝트가 없어요</h3>
            <p className="text-xs text-gray-400 max-w-sm">콘텐츠 제작을 효율적으로 관리할 프로젝트를 먼저 만들어보세요.</p>
          </div>
          <button
            onClick={openAddModal}
            className="px-4 py-2 bg-[#7C8C4E] hover:bg-[#6c7b44] text-white text-xs font-semibold rounded-xl transition shadow-sm"
          >
            첫 프로젝트 추가하기
          </button>
        </div>
      ) : sortedCategoryKeys.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white rounded-2xl border border-gray-100 shadow-sm space-y-1.5">
          <AlertCircle size={28} className="text-gray-400" />
          <p className="text-xs font-bold text-gray-600">일치하는 프로젝트를 찾지 못했습니다.</p>
          <p className="text-[11px] text-gray-400">검색어나 카테고리 필터를 다시 확인해 보세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedCategoryKeys.map((categoryName) => {
            const list = groupedProjects[categoryName];

            // 페이지네이션 처리
            const itemsPerPage = 10;
            const totalItems = list.length;
            const totalPages = Math.ceil(totalItems / itemsPerPage);

            const currentPage = categoryPages[categoryName] || 1;
            const activePage = Math.min(currentPage, Math.max(1, totalPages));

            const paginatedList = list.slice((activePage - 1) * itemsPerPage, activePage * itemsPerPage);

            // 기본적으로 다 펼쳐진 채 로드되게 설계
            const isSearching = searchQuery.trim() !== "";
            const isFiltering = selectedCategory !== "전체";
            const isSearchingOrFiltering = isSearching || isFiltering;

            const isCollapsed = collapsedCategories[categoryName] ?? false; // 기본 펼침 (?? false)
            const activeCollapsed = isSearchingOrFiltering ? false : isCollapsed;

            return (
              <div
                key={categoryName}
                className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden transition-all hover:shadow-md"
              >
                {/* 카테고리 폴더 타이틀 바 */}
                <div 
                  onClick={() => toggleCategoryCollapse(categoryName)}
                  className="flex items-center justify-between px-4 py-2 bg-gray-50/50 border-b border-gray-100 gap-2 min-w-0 cursor-pointer"
                >
                  {/* 왼쪽: 아이콘, 카테고리명, 개수뱃지 */}
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <Folder size={14} className="text-[#7C8C4E] shrink-0" />
                    
                    {editingCategory === categoryName ? (
                      <div 
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 min-w-0 flex-1 max-w-[80%] sm:max-w-[70%]"
                      >
                        <input
                          type="text"
                          value={editingCategoryName}
                          onChange={(e) => setEditingCategoryName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveCategoryName(categoryName);
                            else if (e.key === "Escape") cancelEditCategory();
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="px-1.5 py-0.5 rounded border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-[#7C8C4E] focus:border-[#7C8C4E] bg-white font-semibold text-gray-700 min-w-0 flex-1 max-w-[120px] sm:max-w-[200px]"
                          maxLength={30}
                          autoFocus
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveCategoryName(categoryName);
                          }}
                          className="p-0.5 rounded hover:bg-gray-200 text-green-600 transition shrink-0 cursor-pointer"
                          title="저장"
                        >
                          <Check size={12} className="stroke-[2.5]" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelEditCategory();
                          }}
                          className="p-0.5 rounded hover:bg-gray-200 text-red-500 transition shrink-0 cursor-pointer"
                          title="취소"
                        >
                          <X size={12} className="stroke-[2.5]" />
                        </button>
                      </div>
                    ) : (
                      <h2 
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditCategory(categoryName);
                        }}
                        className="text-xs font-bold text-gray-800 tracking-tight truncate flex items-center gap-1.5 min-w-0 hover:text-[#7C8C4E] hover:underline cursor-pointer group/title"
                        title="클릭하여 카테고리 이름 변경하기"
                      >
                        <span className="truncate">{categoryName}</span>
                        <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-semibold text-gray-400 bg-gray-200/50 rounded-full group-hover/title:bg-[#7C8C4E]/10 group-hover/title:text-[#7C8C4E] transition-colors">
                          {list.length}
                        </span>
                      </h2>
                    )}
                  </div>

                  {/* 오른쪽: 페이지네이션 및 접기/펼치기 토글 */}
                  <div className="flex items-center gap-1.5 shrink-0 min-w-0">
                    {totalPages > 1 && !activeCollapsed && (
                      <div className="flex items-center gap-0.5 flex-wrap shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePageChange(categoryName, Math.max(1, activePage - 1));
                          }}
                          disabled={activePage === 1}
                          className="p-0.5 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
                          title="이전 페이지"
                        >
                          <ChevronLeft size={12} />
                        </button>
                        
                        {getPageNumbers(activePage, totalPages).map((p, idx) => {
                          if (p === "...") {
                            return (
                              <span key={`ellipsis-${idx}`} className="px-0.5 text-[9px] sm:text-[10px] text-gray-400">
                                ...
                              </span>
                            );
                          }
                          return (
                            <button
                              key={`page-${p}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePageChange(categoryName, p as number);
                              }}
                              className={`px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-bold transition cursor-pointer ${
                                activePage === p
                                  ? "bg-[#7C8C4E]/90 text-white shadow-sm"
                                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                              }`}
                            >
                              {p}
                            </button>
                          );
                        })}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePageChange(categoryName, Math.min(totalPages, activePage + 1));
                          }}
                          disabled={activePage === totalPages}
                          className="p-0.5 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
                          title="다음 페이지"
                        >
                          <ChevronRight size={12} />
                        </button>
                      </div>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openAddModalWithCategory(categoryName);
                      }}
                      className="p-1 rounded text-gray-400 hover:text-[#7C8C4E] hover:bg-gray-200/40 transition shrink-0 ml-1"
                      title={`${categoryName} 카테고리에 새 프로젝트 추가`}
                    >
                      <Plus size={13} className="stroke-[2.5]" />
                    </button>

                    {/* "V" 상태 표시 아이콘 (ChevronDown) */}
                    <div
                      className="p-1 text-gray-400 shrink-0"
                      title={activeCollapsed ? "펼치기" : "접기"}
                    >
                      <ChevronDown
                        size={13}
                        className={`transition-transform duration-200 ${activeCollapsed ? "rotate-180" : ""}`}
                      />
                    </div>
                  </div>
                </div>

                {/* 프로젝트 리스트 나열 (펼쳐진 상태) */}
                {!activeCollapsed && (
                  <div className="animate-in fade-in slide-in-from-top-1 duration-150 p-2 space-y-1.5">
                    {paginatedList.map((project, idx) => (
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
              </div>
            );
          })}
        </div>
      )}

      {/* ─── 5. 프로젝트 추가 및 편집 통합 모달 ─── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-gray-100 overflow-hidden transform transition-all animate-in zoom-in-95 duration-200">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <span className="text-xl">📂</span>
                <span>{editingProjectId ? "프로젝트 편집" : "새 프로젝트 생성"}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* 모달 폼 */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* 카테고리 선택 */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                  카테고리
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-olive/20 focus:border-[#7C8C4E] transition-all bg-white font-semibold text-gray-700 cursor-pointer"
                >
                  <option value="">📁 미분류</option>
                  {uniqueCategories.map((cat) => (
                    <option key={cat} value={cat === "미분류" ? "" : cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="__new__">➕ + 새 카테고리 추가</option>
                </select>

                {formCategory === "__new__" && (
                  <input
                    type="text"
                    required
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="새로운 카테고리 이름을 입력해 주세요"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-olive/20 focus:border-[#7C8C4E] transition-all bg-gray-50/30 font-semibold text-gray-700 animate-in fade-in slide-in-from-top-1 duration-150"
                    maxLength={30}
                  />
                )}
              </div>

              {/* 제목 입력 */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  제목 *
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="프로젝트 제목을 입력하세요"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-olive/20 focus:border-[#7C8C4E] transition-all bg-gray-50/30"
                  maxLength={100}
                />
              </div>

              {/* 업로드 완료 체크박스 (수정 모드일 때만 표시) */}
              {editingProjectId && (
                <div className="flex items-center gap-2.5 py-1 px-1 bg-gray-50/50 rounded-xl border border-gray-100/80">
                  <input
                    type="checkbox"
                    id="formUploaded"
                    checked={formUploaded}
                    onChange={(e) => setFormUploaded(e.target.checked)}
                    className="h-4.5 w-4.5 rounded border-gray-300 text-[#7C8C4E] focus:ring-[#7C8C4E]/30 cursor-pointer accent-[#7C8C4E]"
                  />
                  <label
                    htmlFor="formUploaded"
                    className="text-xs font-bold text-gray-600 cursor-pointer select-none flex-1"
                  >
                    업로드 완료
                    <span className="block text-[10px] font-normal text-gray-400 mt-0.5">이 프로젝트는 업로드까지 끝난 것으로 표시</span>
                  </label>
                </div>
              )}

              {/* 상태 선택 */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  상태
                </label>
                <select
                  value={formStatus}
                  onChange={(e) => {
                    const newStatus = e.target.value;
                    setFormStatus(newStatus);
                    setFormProgress(statusProgressMap[newStatus] ?? formProgress);
                  }}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-olive/20 focus:border-[#7C8C4E] transition-all bg-white font-semibold text-gray-700 cursor-pointer"
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* 진행률 슬라이더 */}
              <div>
                <div className="mb-1.5 flex justify-between text-xs font-bold text-gray-500">
                  <span className="uppercase tracking-wider">진행률</span>
                  <span className="text-[#7C8C4E]">{formProgress}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={formProgress}
                  onChange={(e) => setFormProgress(parseInt(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-100 accent-[#7C8C4E]"
                />
              </div>

              {/* 메모 입력 */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  메모 (선택)
                </label>
                <textarea
                  value={formMemo}
                  onChange={(e) => setFormMemo(e.target.value)}
                  placeholder="프로젝트 진행에 참고할 점을 적어주세요"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-olive/20 focus:border-[#7C8C4E] transition-all bg-gray-50/30 h-24 resize-none"
                  maxLength={500}
                />
              </div>

              {/* 푸터 버튼 */}
              <div className="flex gap-2.5 pt-4 border-t border-gray-100 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm font-semibold transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-[#7C8C4E] hover:bg-[#6c7b44] text-white rounded-xl text-sm font-semibold shadow-md transition"
                >
                  저장하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── 토스트 UI ─── */}
      {toastMessage && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in">
          <div className="bg-gray-800 text-white px-6 py-3 rounded-full shadow-lg font-medium text-sm flex items-center gap-2">
            <Check size={16} className="text-green-400" />
            {toastMessage}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================
   기존 프로젝트 카드 컴포넌트 (디자인 유지 - 2줄로 촘촘하게 축소)
   ================================================================ */
function ListCard({
  project,
  timeAgo,
  onDelete,
  onEdit,
  onClick
}: {
  project: Project;
  color: string;
  timeAgo: (d: string | null) => string;
  onDelete: (id: number) => void;
  onEdit: () => void;
  onClick: () => void;
}) {
  return (
    <div 
      onClick={onClick}
      className="group flex cursor-pointer items-center justify-between rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md w-full gap-3"
    >
      {/* 왼쪽 정보 영역: 제목(1째줄) + 서브정보(2째줄) */}
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        {/* 1째줄: 제목 */}
        <h3 className="truncate text-xs sm:text-sm font-semibold text-gray-700 group-hover:text-brand-olive-dark">
          {project.title}
        </h3>
        
        {/* 2째줄: 수정일, 상태, 진행률을 모두 한 줄에 나란히 배치 */}
        <div className="flex flex-wrap items-center gap-2 text-[10px] sm:text-xs text-muted-foreground">
          {/* 수정일 */}
          <div className="flex items-center gap-0.5 whitespace-nowrap shrink-0">
            <Clock size={10} />
            <span>{timeAgo(project.updated_at)}</span>
          </div>

          <span className="text-gray-200 shrink-0 select-none">•</span>

          {/* 태그 (상태 및 진행도) */}
          <div className="flex items-center gap-1 shrink-0">
            <Tag color="olive">{project.status ?? "대본"}</Tag>
            <Tag color="muted">{project.progress}%</Tag>
          </div>
        </div>
      </div>

      {/* 오른쪽: 액션 버튼 영역 */}
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onEdit();
          }}
          className="rounded-md p-1 text-muted-foreground transition hover:bg-brand-olive/10 hover:text-brand-olive"
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDelete(project.id);
          }}
          className="rounded-md p-1 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-500"
        >
          <Trash2 size={14} />
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
