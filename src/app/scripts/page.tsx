"use client";

import { useState, useEffect, Suspense } from "react";
import { Copy, FileUp, ChevronDown, Check, Folder, Save, Scissors, Plus, Edit2, X, Loader2, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, History } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getEditPointsPromptGemini, getEditPointsPromptClaude } from '@/constants/prompts';

function ScriptsPageContent() {
  const supabase = createClient();
  
  /* ============================================================
     프로젝트 연동 관련 상태 및 이펙트
     ============================================================ */
  const [projects, setProjects] = useState<{id: number, title: string, status: string | null, progress: number, category: string | null}[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [editPoints, setEditPoints] = useState("");
  const [generatedScript, setGeneratedScript] = useState("");
  const [copied, setCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };
  
  // 모달
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");

  // 탭 및 전체 대본 모아보기
  const [activeTab, setActiveTab] = useState<'write' | 'list'>('write');
  const [allScripts, setAllScripts] = useState<any[]>([]);

  // 제목 편집용 state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState("");

  // 카테고리 접기/펼치기 및 페이징 상태
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [categoryPages, setCategoryPages] = useState<Record<string, number>>({});
  const [categorySort, setCategorySort] = useState<{ dir: 'asc' | 'desc' }>({ dir: 'asc' });

  // 버전 기록 관리 상태
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<any | null>(null);

  const fetchVersions = async () => {
    if (!scriptId) return;
    setLoadingVersions(true);
    try {
      const { data, error } = await supabase
        .from("script_versions")
        .select("*")
        .eq("script_id", scriptId)
        .order("created_at", { ascending: false });
      if (!error && data) {
        setVersions(data);
        if (data.length > 0) {
          setSelectedVersion(data[0]);
        } else {
          setSelectedVersion(null);
        }
      }
    } catch (err) {
      console.error("버전 조회 실패:", err);
    } finally {
      setLoadingVersions(false);
    }
  };

  useEffect(() => {
    if (isVersionModalOpen && scriptId) {
      fetchVersions();
    }
  }, [isVersionModalOpen, scriptId]);

  const handleRestoreVersion = (version: any) => {
    if (!version) return;
    if (confirm("이 버전으로 되돌릴까요? 현재 작성 중인 내용은 따로 저장하지 않으면 사라질 수 있어요.")) {
      setGeneratedScript(version.content);
      setIsVersionModalOpen(false);
      showToast("대본을 이전 버전으로 불러왔어요. 저장을 누르셔야 최종 반영됩니다!");
    }
  };

  // 카테고리 접기/펼치기 토글 핸들러
  const toggleCategoryCollapse = (category: string) => {
    setCollapsedCategories((prev) => {
      const currentVal = prev[category] ?? true; // 기본값은 접힌 상태(true)
      return {
        ...prev,
        [category]: !currentVal,
      };
    });
  };

  // 페이지 전환 핸들러
  const handlePageChange = (category: string, page: number) => {
    setCategoryPages((prev) => ({
      ...prev,
      [category]: page,
    }));
  };

  // 페이지 번호 생성 헬퍼 함수
  const getPageNumbers = (current: number, total: number) => {
    const pages: (number | string)[] = [];
    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      if (current > 3) {
        pages.push('...');
      }
      const start = Math.max(2, current - 1);
      const end = Math.min(total - 1, current + 1);
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (current < total - 2) {
        pages.push('...');
      }
      pages.push(total);
    }
    return pages;
  };

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInSec = Math.floor(diffInMs / 1000);
    const diffInMin = Math.floor(diffInSec / 60);
    const diffInHour = Math.floor(diffInMin / 60);
    const diffInDay = Math.floor(diffInHour / 24);

    if (diffInSec < 60) return "방금 전";
    if (diffInMin < 60) return `${diffInMin}분 전`;
    if (diffInHour < 24) return `${diffInHour}시간 전`;
    if (diffInDay === 1) return "어제";
    if (diffInDay < 7) return `${diffInDay}일 전`;
    return date.toLocaleDateString();
  };

  const fetchAllScripts = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data, error } = await supabase.from("scripts")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (!error && data) {
      setAllScripts(data);
    }
  };

  useEffect(() => {
    if (activeTab === 'list') {
      fetchAllScripts();
    }
  }, [activeTab]);

  const fetchProjects = async () => {
    const { data, error } = await supabase.from("projects").select("id, title, status, progress, category").order("updated_at", { ascending: false });
    if (!error && data) {
      setProjects(data);
    }
  };

  const searchParams = useSearchParams();

  useEffect(() => {
    fetchProjects();
    const pid = searchParams.get("project_id");
    if (pid) {
      setSelectedProjectId(Number(pid));
    }
  }, [searchParams]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "list") {
      setActiveTab("list");
    } else if (tab === "write") {
      setActiveTab("write");
    }
  }, [searchParams]);

  useEffect(() => {
    setIsEditingTitle(false);
    if (!selectedProjectId) {
      setScriptId(null);
      setGeneratedScript("");
      setEditPoints("");
      return;
    }
    const fetchScript = async () => {
      const { data, error } = await supabase.from("scripts").select("*").eq("project_id", selectedProjectId).single();
      if (data && !error) {
        setScriptId(data.id);
        setGeneratedScript(data.content || "");
        setEditPoints(data.edit_points || "");
      } else {
        setScriptId(null);
        setGeneratedScript("");
        setEditPoints("");
      }
    };
    fetchScript();
  }, [selectedProjectId]);

  const handleUpdateProjectTitle = async () => {
    if (!editingTitle.trim()) {
      alert("프로젝트 이름을 입력해주세요.");
      return;
    }
    if (!selectedProjectId) return;

    const { error } = await supabase
      .from("projects")
      .update({ title: editingTitle.trim() })
      .eq("id", selectedProjectId);

    if (error) {
      alert("프로젝트 이름 변경 실패");
      console.error(error);
    } else {
      setProjects(prev =>
        prev.map(p => (p.id === selectedProjectId ? { ...p, title: editingTitle.trim() } : p))
      );
      setIsEditingTitle(false);
      showToast("프로젝트 이름이 변경됐어요");
    }
  };

  const handleSaveScript = async () => {
    if (!selectedProjectId) {
      alert("프로젝트를 먼저 선택해주세요");
      return;
    }
    if (!generatedScript) {
      alert("대본 내용을 입력해주세요");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert("로그인이 필요합니다.");
      return;
    }

    const payload = {
      user_id: user.id,
      project_id: selectedProjectId,
      title: projects.find(p => p.id === selectedProjectId)?.title || "제목 없음",
      content: generatedScript,
      // 이전의 복잡한 입력 속성들(style, format 등)은 더 이상 이 페이지에서 설정하지 않음.
    };

    const saveVersion = async (targetScriptId: string) => {
      try {
        const { error: versionError } = await supabase.from("script_versions").insert({
          script_id: targetScriptId,
          content: generatedScript,
          char_count: generatedScript.length,
        });
        if (versionError) {
          console.error("버전 기록 실패:", versionError.message);
        }
      } catch (err) {
        console.error("버전 기록 중 오류 발생:", err);
      }
    };

    if (scriptId) {
      const { error } = await supabase.from("scripts").update(payload).eq("id", scriptId);
      if (error) {
        alert("대본 저장 실패");
        console.error(error);
      } else {
        alert("대본이 저장됐어요");
        await saveVersion(scriptId);
      }
    } else {
      const { data, error } = await supabase.from("scripts").insert(payload).select().single();
      if (error) {
        alert("대본 저장 실패");
        console.error(error);
      } else {
        setScriptId(data.id);
        alert("대본이 저장됐어요");
        await saveVersion(data.id);
      }
    }
  };

  const handleSaveEditPoints = async () => {
    if (!selectedProjectId || !scriptId) {
      alert("대본을 먼저 저장해주세요");
      return;
    }

    const { error } = await supabase.from("scripts").update({ edit_points: editPoints }).eq("id", scriptId);
    if (error) {
      alert("편집점 저장 실패");
      console.error(error);
    } else {
      alert("편집점이 저장됐어요");
    }
  };

  const handleCreateNewProject = async () => {
    if (!newProjectTitle.trim()) {
      alert("프로젝트 제목을 입력해주세요.");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase.from("projects").insert({
      title: newProjectTitle,
      status: "idea",
      progress: 0,
      user_id: user.id,
      updated_at: new Date().toISOString()
    }).select().single();

    if (error) {
      alert("프로젝트 생성 실패");
      console.error(error);
    } else {
      setProjects([data, ...projects]);
      setSelectedProjectId(data.id);
      setIsNewProjectModalOpen(false);
      setNewProjectTitle("");
    }
  };

  const handleCopy = async () => {
    if (!generatedScript) return;
    try {
      await navigator.clipboard.writeText(generatedScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("복사 실패:", err);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setGeneratedScript(content);
    };
    reader.readAsText(file);
  };

  const validateScript = () => {
    if (!generatedScript.trim()) {
      showToast("먼저 대본을 입력해주세요");
      return false;
    }
    return true;
  };

  const handleSendToGemini = async () => {
    if (!validateScript()) return;
    const prompt = getEditPointsPromptGemini(generatedScript);
    await navigator.clipboard.writeText(prompt);
    showToast("프롬프트가 복사됐어요! Gemini에 붙여넣기(Ctrl+V) 하세요");
    window.open('https://gemini.google.com/', '_blank');
  };

  const handleSendToClaude = async () => {
    if (!validateScript()) return;
    const prompt = getEditPointsPromptClaude(generatedScript);
    await navigator.clipboard.writeText(prompt);
    showToast("프롬프트가 복사됐어요! Claude에 붙여넣기(Ctrl+V) 하세요");
    window.open('https://claude.ai/new', '_blank');
  };

  const handleSendToReview = async () => {
    if (!validateScript()) return;
    await navigator.clipboard.writeText(generatedScript);
    showToast("대본이 복사됐어요! 검수 GPT에 붙여넣기(Ctrl+V) 하세요");
    window.open('https://chatgpt.com/g/g-695fcfe6614081918ecb06724cdef59a-marahagi-gpts-tonghabbon', '_blank');
  };

  const handleSendToEdit = async () => {
    if (!validateScript()) return;
    await navigator.clipboard.writeText(generatedScript);
    showToast("대본이 복사됐어요! Claude 프로젝트에 붙여넣기(Ctrl+V) 하세요");
    window.open('https://claude.ai/project/019e4e9b-501b-73d7-9f6a-9a479acfce6e', '_blank');
  };

  return (
    <div className="space-y-6 pb-16">
      {/* ── 상단 헤더 ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-brand-olive/10 text-brand-olive rounded-xl shadow-inner">
            <span className="text-2xl leading-none">✍️</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800 tracking-tight">
              {activeTab === "write" ? "대본 수정" : "대본 목록"}
            </h1>
            <p className="text-[11px] text-gray-400 font-medium mt-0.5">
              {activeTab === "write" ? "대본 작성 및 관리" : "작성한 대본 모아보기"}
            </p>
          </div>
        </div>
      </div>

      {activeTab === 'write' ? (
        <>

      {/* ── 작업할 프로젝트 ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Folder size={18} className="text-brand-olive" />
            작업할 프로젝트
          </h3>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl border border-border bg-white shadow-sm">
          <div className="w-full sm:w-1/2 relative">
             <select
               value={selectedProjectId || ""}
               onChange={(e) => {
                 const val = e.target.value;
                 if (val === "__new__") {
                   setIsNewProjectModalOpen(true);
                 } else {
                   setSelectedProjectId(Number(val) || null);
                 }
               }}
               className="w-full h-10 appearance-none rounded-lg border border-border bg-brand-cream/50 px-3 text-sm outline-none transition-colors focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
             >
               <option value="">프로젝트를 선택하세요...</option>
               {projects.map(p => (
                 <option key={p.id} value={p.id}>{p.title}</option>
               ))}
               <option value="__new__">+ 새 프로젝트 만들기</option>
             </select>
             <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>

          {selectedProjectId && (
            <div className="flex items-center gap-3 flex-wrap">
              {(() => {
                const sp = projects.find(p => p.id === selectedProjectId);
                if (!sp) return null;
                return (
                  <>
                    {isEditingTitle ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          className="h-8 rounded-lg border border-border bg-white px-2.5 text-sm font-medium outline-none focus:border-brand-olive focus:ring-1 focus:ring-brand-olive/20"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleUpdateProjectTitle();
                            } else if (e.key === "Escape") {
                              setIsEditingTitle(false);
                            }
                          }}
                          autoFocus
                        />
                        <button
                          onClick={handleUpdateProjectTitle}
                          className="p-1.5 rounded-lg border border-brand-olive bg-brand-olive text-white hover:bg-brand-olive-dark transition-colors shadow-sm flex items-center justify-center"
                          title="저장"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => setIsEditingTitle(false)}
                          className="p-1.5 rounded-lg border border-border bg-white text-muted-foreground hover:bg-muted transition-colors shadow-sm flex items-center justify-center"
                          title="취소"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-foreground">{sp.title}</span>
                        <button
                          onClick={() => {
                            setEditingTitle(sp.title);
                            setIsEditingTitle(true);
                          }}
                          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all flex items-center justify-center"
                          title="프로젝트 이름 수정"
                        >
                          <Edit2 size={13} />
                        </button>
                      </div>
                    )}
                    <span className="rounded-md bg-brand-olive/10 px-2 py-0.5 text-xs font-medium text-brand-olive-dark">{sp.status === "idea" ? "아이디어" : sp.status || '상태 없음'}</span>
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{sp.progress}%</span>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </section>

      {/* ============================================================
          대본 출력 영역
          ============================================================ */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            ✏️ 대본
          </h3>
          <div className="flex gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brand-olive-light hover:text-foreground">
              <FileUp size={13} />
              파일 불러오기
              <input 
                type="file" 
                accept=".txt" 
                className="hidden" 
                onChange={handleFileUpload}
              />
            </label>
            <button
              onClick={handleCopy}
              disabled={!generatedScript}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brand-olive-light hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {copied ? <Check size={13} className="text-brand-olive" /> : <Copy size={13} />}
              {copied ? "복사됨" : "복사"}
            </button>
          </div>
        </div>

        <div className="group relative mt-3 flex min-h-[450px] lg:min-h-[600px] flex-col rounded-xl border border-border bg-white shadow-sm focus-within:border-brand-olive-light focus-within:ring-2 focus-within:ring-brand-olive/5 transition-all">
          <textarea
            value={generatedScript}
            onChange={(e) => setGeneratedScript(e.target.value)}
            placeholder="Gemini Gems 등에서 생성한 대본을 여기에 붙여넣으세요..."
            className="w-full flex-1 min-h-[350px] lg:min-h-[450px] resize-none rounded-t-xl bg-transparent p-6 text-base sm:text-lg leading-loose text-foreground outline-none"
          />
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-t border-border bg-muted/5 rounded-b-xl">
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={handleSendToEdit}
                style={{ backgroundColor: '#ECA8B8' }}
                className="flex items-center justify-center gap-1 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-md transition-all hover:brightness-95 hover:shadow-lg cursor-pointer"
              >
                📝 대본수정
              </button>
              <button
                onClick={handleSendToReview}
                style={{ backgroundColor: '#ECA8B8' }}
                className="flex items-center justify-center gap-1 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-md transition-all hover:brightness-95 hover:shadow-lg cursor-pointer"
              >
                🔍 대본검수
              </button>
              <button
                onClick={handleSaveScript}
                className="flex items-center justify-center gap-1 rounded-xl bg-brand-olive px-3 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-md transition-all hover:bg-brand-olive-dark hover:shadow-lg cursor-pointer"
              >
                <Save size={14} /> 대본저장
              </button>
              {scriptId && (
                <button
                  type="button"
                  onClick={() => setIsVersionModalOpen(true)}
                  className="flex items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs sm:text-sm font-semibold text-gray-600 shadow-sm transition-all hover:bg-gray-50 cursor-pointer"
                >
                  <History size={14} /> 버전 기록
                </button>
              )}
            </div>
            {(() => {
              const charCount = generatedScript.length;
              const ttsSeconds = Math.round((charCount / 350) * 60);
              const ttsMinutes = Math.floor(ttsSeconds / 60);
              const ttsRemainingSeconds = ttsSeconds % 60;
              const ttsFormatted = `${ttsMinutes}:${ttsRemainingSeconds.toString().padStart(2, '0')}`;
              return (
                <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
                  <div className="flex items-center gap-2 rounded-full bg-brand-cream/80 px-3 py-1 border border-border/50 shadow-sm">
                    <span className="text-[10px] font-bold text-brand-olive uppercase tracking-wider">Words</span>
                    <span className="text-xs font-bold text-foreground">{charCount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-full bg-brand-cream/80 px-3 py-1 border border-border/50 shadow-sm">
                    <span className="text-[10px] font-bold text-brand-olive uppercase tracking-wider">예상 TTS ⏱</span>
                    <span className="text-xs font-bold text-foreground">{ttsFormatted}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      {/* ============================================================
          편집점 출력 영역
          ============================================================ */}
      <section className="mt-8">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
          <Scissors size={18} className="text-brand-pink" />
          편집점 (AI가 제안한 편집 지시사항)
        </h3>
        <div className="group relative flex min-h-[200px] flex-col rounded-xl border border-border bg-white shadow-sm focus-within:border-brand-olive-light focus-within:ring-2 focus-within:ring-brand-olive/5 transition-all">
          <textarea
            value={editPoints}
            onChange={(e) => setEditPoints(e.target.value)}
            placeholder="AI 프롬프트에서 도출된 편집점을 여기에 붙여넣으세요..."
            className="w-full flex-1 min-h-[150px] resize-none rounded-t-xl bg-transparent p-6 text-sm leading-relaxed text-foreground outline-none"
          />
          <div className="p-4 border-t border-border bg-muted/5 rounded-b-xl flex flex-wrap gap-1.5">
            <button
              onClick={handleSendToGemini}
              style={{ backgroundColor: '#4A90E2' }}
              className="flex items-center justify-center gap-1 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-md transition-all hover:brightness-95 hover:shadow-lg cursor-pointer"
            >
              <img src="/gemini_logo.png" alt="Gemini" className="w-4 h-4 object-contain shrink-0" />
              Gemini
            </button>
            <button
              onClick={handleSendToClaude}
              style={{ backgroundColor: '#D36B42' }}
              className="flex items-center justify-center gap-1 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-md transition-all hover:brightness-95 hover:shadow-lg cursor-pointer"
            >
              <img src="/claude_logo.png" alt="Claude" className="w-4 h-4 object-contain shrink-0" />
              Claude
            </button>
            <button
              onClick={handleSaveEditPoints}
              className="flex items-center justify-center gap-1 rounded-xl bg-brand-olive px-3 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-md transition-all hover:bg-brand-olive-dark hover:shadow-lg cursor-pointer"
            >
              <Save size={14} /> 편집점저장
            </button>
          </div>
        </div>
      </section>
        </>
      ) : (
        <section className="space-y-6 mt-4">
          {/* 상단 통계 및 카테고리 정렬 바 */}
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span>📚</span>
              <span>총 {allScripts.length}개의 대본</span>
            </h3>
            {allScripts.length > 0 && (
              <button
                onClick={() => setCategorySort(prev => ({ dir: prev.dir === 'asc' ? 'desc' : 'asc' }))}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-white text-xs text-muted-foreground hover:text-brand-olive-dark hover:border-brand-olive-light transition-all font-semibold shadow-sm"
                title="카테고리 가나다 정렬"
              >
                <span>정렬</span>
                {categorySort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
              </button>
            )}
          </div>
          
          {allScripts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center border rounded-xl border-dashed bg-white">
              <p className="text-muted-foreground text-sm mb-4">아직 저장된 대본이 없어요. 작성 탭에서 첫 대본을 만들어보세요!</p>
              <button 
                onClick={() => setActiveTab('write')}
                className="rounded-lg bg-brand-olive px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-olive-dark"
              >
                대본 작성하기
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {(() => {
                // 1. 카테고리 매핑
                const scriptsWithCategory = allScripts.map(script => {
                  const project = projects.find(p => p.id === Number(script.project_id));
                  const category = project?.category ? project.category.trim() : "미분류";
                  return { ...script, category };
                });

                // 2. 카테고리별 그룹화
                const grouped: Record<string, typeof scriptsWithCategory> = {};
                scriptsWithCategory.forEach(script => {
                  if (!grouped[script.category]) {
                    grouped[script.category] = [];
                  }
                  grouped[script.category].push(script);
                });

                // 3. 카테고리 키 정렬
                const sortedCategories = Object.keys(grouped).sort((a, b) => {
                  if (a === "미분류") return 1;
                  if (b === "미분류") return -1;
                  return categorySort.dir === "asc" ? a.localeCompare(b) : b.localeCompare(a);
                });

                return sortedCategories.map(categoryName => {
                  const list = grouped[categoryName];
                  const activeCollapsed = collapsedCategories[categoryName] ?? true;
                  
                  // 카테고리별 페이지네이션 계산
                  const activePage = categoryPages[categoryName] ?? 1;
                  const totalPages = Math.ceil(list.length / 10);
                  const paginatedList = list.slice((activePage - 1) * 10, activePage * 10);

                  return (
                    <div
                      key={categoryName}
                      className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden transition-all hover:shadow-md animate-in fade-in duration-200"
                    >
                      {/* 카테고리 폴더 헤더 */}
                      <div 
                        onClick={() => toggleCategoryCollapse(categoryName)}
                        className="flex items-center justify-between px-4 py-3 bg-gray-50/50 border-b border-gray-100 gap-2 min-w-0 cursor-pointer"
                      >
                        {/* 왼쪽: 폴더 아이콘, 폴더 이름, 개수 뱃지 */}
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Folder size={16} className="text-brand-olive shrink-0" />
                          <h4 className="text-sm font-bold text-gray-800 tracking-tight truncate flex items-center gap-2 min-w-0">
                            <span className="truncate">{categoryName}</span>
                            <span className="shrink-0 px-2 py-0.5 text-[10px] font-bold text-brand-olive bg-brand-olive/10 rounded-full">
                              {list.length}
                            </span>
                          </h4>
                        </div>

                        {/* 오른쪽: 카테고리별 페이지네이션 & 접기/펼치기 토글 */}
                        <div className="flex items-center gap-2 shrink-0 min-w-0">
                          {/* 카테고리 내 페이지네이션 UI (10개 초과 & 펼쳐진 상태일 때만 노출) */}
                          {totalPages > 1 && !activeCollapsed && (
                            <div className="flex items-center gap-1 flex-wrap shrink-0 mr-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePageChange(categoryName, Math.max(1, activePage - 1));
                                }}
                                disabled={activePage === 1}
                                className="p-1 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
                                title="이전 페이지"
                              >
                                <ChevronLeft size={14} />
                              </button>
                              
                              {getPageNumbers(activePage, totalPages).map((p, idx) => {
                                if (p === '...') {
                                  return (
                                    <span key={`ellipsis-${idx}`} className="px-1 text-[11px] text-gray-400">
                                      ...
                                    </span>
                                  )
                                }
                                return (
                                  <button
                                    key={`page-${p}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePageChange(categoryName, p as number);
                                    }}
                                    className={`px-2 py-0.5 rounded text-[11px] font-bold transition cursor-pointer ${
                                      activePage === p
                                        ? 'bg-brand-olive text-white shadow-sm'
                                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                                    }`}
                                  >
                                    {p}
                                  </button>
                                )
                              })}

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePageChange(categoryName, Math.min(totalPages, activePage + 1));
                                }}
                                disabled={activePage === totalPages}
                                className="p-1 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
                                title="다음 페이지"
                              >
                                <ChevronRight size={14} />
                              </button>
                            </div>
                          )}

                          {/* "V" 상태 표시 아이콘 (ChevronDown) */}
                          <div
                            className="p-1 text-gray-400 shrink-0"
                            title={activeCollapsed ? `${categoryName} 펼치기` : `${categoryName} 접기`}
                          >
                            <ChevronDown
                              size={16}
                              className={`transition-transform duration-200 ${activeCollapsed ? 'rotate-180' : ''}`}
                            />
                          </div>
                        </div>
                      </div>

                      {/* 대본 카드 리스트 (펼쳐진 상태에서만 노출) */}
                      {!activeCollapsed && (
                        <div className="p-5 bg-transparent border-t-0 animate-in fade-in duration-200">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {paginatedList.map(script => {
                              const projectTitle = projects.find(p => p.id === Number(script.project_id))?.title || script.title || "제목 없음";
                              const contentPreview = script.content 
                                ? (script.content.length > 100 ? script.content.slice(0, 100) + "..." : script.content) 
                                : "내용 없음";

                              return (
                                <div 
                                  key={script.id}
                                  onClick={() => {
                                    setSelectedProjectId(Number(script.project_id));
                                    setActiveTab('write');
                                  }}
                                  className="group relative flex flex-col rounded-xl border border-border bg-white p-5 shadow-sm transition-all hover:border-brand-olive-light hover:shadow-md cursor-pointer"
                                >
                                  <h4 className="font-bold text-foreground mb-2 line-clamp-1">{projectTitle}</h4>
                                  <p className="text-xs text-muted-foreground line-clamp-3 mb-4 flex-1 leading-relaxed whitespace-pre-wrap">
                                    {contentPreview}
                                  </p>
                                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-border/50">
                                    <span className="text-[11px] font-medium text-brand-olive bg-brand-olive/10 px-2 py-0.5 rounded-md">
                                      {script.content?.length || 0}자
                                    </span>
                                    <span className="text-[11px] text-muted-foreground">
                                      {getRelativeTime(script.updated_at)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </section>
      )}

      {/* ── 새 프로젝트 모달 ── */}
      {isNewProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-200 rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="mb-5 text-xl font-bold text-gray-800">새 프로젝트 만들기</h2>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">프로젝트 제목</label>
              <input
                type="text"
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
                placeholder="예: AI 부업 영상"
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-pink focus:ring-1 focus:ring-brand-pink"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateNewProject();
                  }
                }}
              />
            </div>
            <div className="mt-8 flex gap-3">
              <button
                onClick={() => setIsNewProjectModalOpen(false)}
                className="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-200"
              >
                취소
              </button>
              <button
                onClick={handleCreateNewProject}
                className="flex-1 rounded-xl bg-brand-pink py-3 text-sm font-semibold text-white transition hover:bg-brand-pink-dark shadow-md"
              >
                만들기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 버전 기록 모달 ── */}
      {isVersionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl h-[600px] max-h-[85vh] animate-in fade-in zoom-in duration-200 rounded-2xl bg-white p-6 shadow-2xl flex flex-col">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <History size={18} className="text-brand-olive" />
                <span>대본 버전 기록</span>
              </h2>
              <button 
                onClick={() => setIsVersionModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* 모달 바디 */}
            <div className="flex flex-col md:flex-row gap-4 overflow-hidden flex-1 mt-4 min-h-0">
              {loadingVersions ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2">
                  <Loader2 size={24} className="animate-spin text-brand-olive" />
                  <p className="text-xs font-semibold text-gray-400">버전 정보를 불러오고 있습니다...</p>
                </div>
              ) : versions.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
                  아직 저장된 버전이 없어요.
                </div>
              ) : (
                <>
                  {/* 좌측: 버전 리스트 */}
                  <div className="w-full md:w-72 overflow-y-auto space-y-2 pr-1 border-r border-gray-100 flex-shrink-0 max-h-[200px] md:max-h-none">
                    {versions.map((v, idx) => {
                      const isSelected = selectedVersion?.id === v.id;
                      return (
                        <div
                          key={v.id}
                          onClick={() => setSelectedVersion(v)}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                            isSelected 
                              ? "border-brand-olive bg-brand-olive/5 shadow-sm"
                              : "border-gray-200 hover:bg-gray-50/80"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-700">
                              {new Date(v.created_at).toLocaleString('ko-KR', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit'
                              })}
                            </span>
                            {idx === 0 && (
                              <span className="text-[9px] font-extrabold text-[#7C8C4E] bg-[#7C8C4E]/10 px-1.5 py-0.5 rounded-full">
                                현재 (최신)
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 font-semibold mt-1">
                            글자수: {v.char_count.toLocaleString()}자
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* 우측: 버전 내용 미리보기 및 되돌리기 */}
                  <div className="flex-1 flex flex-col min-h-0">
                    {selectedVersion ? (
                      <div className="flex-1 flex flex-col min-h-0">
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-50 flex-shrink-0">
                          <div className="text-xs text-gray-500 font-semibold">
                            선택된 버전: {new Date(selectedVersion.created_at).toLocaleString('ko-KR')} ({selectedVersion.char_count.toLocaleString()}자)
                          </div>
                          <button
                            onClick={() => handleRestoreVersion(selectedVersion)}
                            className="px-3 py-1.5 bg-[#7C8C4E] hover:bg-[#6c7b44] text-white rounded-lg text-xs font-semibold shadow-sm transition"
                          >
                            이 버전으로 되돌리기
                          </button>
                        </div>
                        <textarea
                          readOnly
                          value={selectedVersion.content || ""}
                          className="flex-1 w-full p-4 rounded-xl border border-gray-200 bg-gray-50/50 text-xs sm:text-sm leading-relaxed text-gray-700 resize-none outline-none focus:outline-none overflow-y-auto"
                        />
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
                        버전을 선택하시면 미리보기가 표시됩니다.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 토스트 메시지 UI */}
      {toastMessage && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in">
          <div className="bg-gray-800 text-white px-6 py-3 rounded-full shadow-lg font-medium text-sm flex items-center gap-2">
            {toastMessage.includes("먼저 대본을 입력해주세요") ? (
              <span className="text-xl">⚠️</span>
            ) : (
              <Check size={16} className="text-green-400" />
            )}
            {toastMessage}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScriptsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 size={24} className="animate-spin text-brand-olive" />
      </div>
    }>
      <ScriptsPageContent />
    </Suspense>
  );
}
