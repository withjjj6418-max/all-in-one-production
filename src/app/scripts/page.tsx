"use client";

import { useState, useEffect } from "react";
import { Copy, FileUp, ChevronDown, Check, Folder, Save, Scissors, Plus, ArrowRight } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getEditPointsPromptGemini, getEditPointsPromptClaude } from '@/constants/prompts';

export default function ScriptsPage() {
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

  const fetchProjects = async () => {
    const { data, error } = await supabase.from("projects").select("id, title, status, progress").order("updated_at", { ascending: false });
    if (!error && data) {
      setProjects(data);
    }
  };

  useEffect(() => {
    fetchProjects();
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("project_id");
    if (pid) {
      setSelectedProjectId(Number(pid));
    }
  }, []);

  useEffect(() => {
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
    <div className="mx-auto max-w-4xl space-y-8 pb-16">
      {/* ── 페이지 제목 ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          ✍️ 대본 작성
        </h2>
        
        {/* 리서치/분석 도우미 안내 */}
        <Link 
          href="/analytics" 
          className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:border-brand-olive-light hover:text-foreground"
        >
          소재 작성 및 기획은 채널/영상 분석에서 <ArrowRight size={14} />
        </Link>
      </div>

      {/* ── 작업할 프로젝트 ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Folder size={18} className="text-brand-olive" />
            작업할 프로젝트
          </h3>
          <button
            onClick={() => setIsNewProjectModalOpen(true)}
            className="text-xs font-semibold text-brand-olive hover:text-brand-olive-dark flex items-center gap-1"
          >
            <Plus size={14} /> 새 프로젝트
          </button>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl border border-border bg-white shadow-sm">
          <div className="w-full sm:w-1/2 relative">
             <select
               value={selectedProjectId || ""}
               onChange={(e) => setSelectedProjectId(Number(e.target.value) || null)}
               className="w-full h-10 appearance-none rounded-lg border border-border bg-brand-cream/50 px-3 text-sm outline-none transition-colors focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
             >
               <option value="">프로젝트를 선택하세요...</option>
               {projects.map(p => (
                 <option key={p.id} value={p.id}>{p.title}</option>
               ))}
             </select>
             <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>

          {selectedProjectId && (
            <div className="flex items-center gap-3">
              {(() => {
                const sp = projects.find(p => p.id === selectedProjectId);
                if (!sp) return null;
                return (
                  <>
                    <span className="text-sm font-semibold text-foreground">{sp.title}</span>
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
            className="min-h-[400px] w-full resize-none rounded-xl bg-transparent p-6 text-sm leading-relaxed text-foreground outline-none pb-20"
          />
          
          <div className="absolute bottom-4 inset-x-6 flex items-center justify-between pointer-events-none">
            <div className="flex flex-col sm:flex-row gap-2 pointer-events-auto">
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
                <span className="text-sm">✨</span> Gemini로 편집점 만들기
              </button>
              <button
                onClick={handleSendToClaude}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-orange-700 hover:shadow-md"
              >
                <span className="text-sm">✨</span> Claude로 편집점 만들기
              </button>
            </div>
            <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-brand-cream/80 px-3 py-1 backdrop-blur-sm border border-border/50 shadow-sm">
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
            className="min-h-[200px] w-full resize-none rounded-xl bg-transparent p-6 text-sm leading-relaxed text-foreground outline-none pb-20"
          />
          <div className="absolute bottom-4 left-6 pointer-events-auto">
            <button
              onClick={handleSaveEditPoints}
              className="flex items-center gap-1.5 rounded-lg bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-pink-dark hover:shadow-md"
            >
              <Save size={16} /> 편집점 저장
            </button>
          </div>
        </div>
      </section>

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
