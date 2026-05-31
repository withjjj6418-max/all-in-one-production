"use client";

import { useState, useEffect, Suspense } from "react";
import { Copy, FileUp, ChevronDown, Check, Folder, Save, Scissors, Plus, ArrowRight, Edit2, X, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getEditPointsPromptGemini, getEditPointsPromptClaude } from '@/constants/prompts';

function ScriptsPageContent() {
  const supabase = createClient();
  
  /* ============================================================
     프로젝트 연동 관련 상태 및 이펙트
     ============================================================ */
  const [projects, setProjects] = useState<{id: number, title: string, status: string | null, progress: number}[]>([]);
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
    const { data, error } = await supabase.from("projects").select("id, title, status, progress").order("updated_at", { ascending: false });
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

    if (scriptId) {
      const { error } = await supabase.from("scripts").update(payload).eq("id", scriptId);
      if (error) {
        alert("대본 저장 실패");
        console.error(error);
      } else {
        alert("대본이 저장됐어요");
      }
    } else {
      const { data, error } = await supabase.from("scripts").insert(payload).select().single();
      if (error) {
        alert("대본 저장 실패");
        console.error(error);
      } else {
        setScriptId(data.id);
        alert("대본이 저장됐어요");
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

        {/* 리서치/분석 도우미 안내 */}
        <Link 
          href="/analytics" 
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:border-brand-olive-light hover:text-foreground shrink-0 sm:self-auto self-start"
        >
          소재 작성 및 기획은 영상 분석에서 <ArrowRight size={14} />
        </Link>
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

        <div className="group relative mt-3 flex min-h-[400px] flex-col rounded-xl border border-border bg-white shadow-sm focus-within:border-brand-olive-light focus-within:ring-2 focus-within:ring-brand-olive/5 transition-all">
          <textarea
            value={generatedScript}
            onChange={(e) => setGeneratedScript(e.target.value)}
            placeholder="Gemini Gems 등에서 생성한 대본을 여기에 붙여넣으세요..."
            className="w-full flex-1 min-h-[300px] resize-none rounded-t-xl bg-transparent p-6 text-sm leading-relaxed text-foreground outline-none"
          />
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-t border-border bg-muted/5 rounded-b-xl">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleSaveScript}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-olive px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-olive-dark hover:shadow-md"
              >
                <Save size={16} /> 대본 저장
              </button>
              <button
                onClick={handleSendToGemini}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md"
              >
                <span className="text-sm">⭐</span> 편집점
              </button>
              <button
                onClick={handleSendToClaude}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-orange-700 hover:shadow-md"
              >
                <span className="text-sm">☀️</span> 편집점
              </button>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-brand-cream/80 px-3 py-1 border border-border/50 shadow-sm self-end sm:self-auto">
              <span className="text-[10px] font-bold text-brand-olive uppercase tracking-wider">Words</span>
              <span className="text-xs font-bold text-foreground">{generatedScript.length.toLocaleString()}</span>
            </div>
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
          <div className="p-4 border-t border-border bg-muted/5 rounded-b-xl">
            <button
              onClick={handleSaveEditPoints}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-pink-dark hover:shadow-md"
            >
              <Save size={16} /> 편집점 저장
            </button>
          </div>
        </div>
      </section>
        </>
      ) : (
        <section className="space-y-6 mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              총 {allScripts.length}개의 대본
            </h3>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {allScripts.map(script => {
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
