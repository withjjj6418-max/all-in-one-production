"use client";

import { useState, useMemo, useEffect } from "react";
import { Copy, FileUp, ChevronDown, Flame, Loader2, Check, Folder, Save, Scissors, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/* ─── 타입 ─── */
type MaterialMode = "ai" | "manual" | null;
type StyleKey = "standard" | "community" | "shopping" | "knowledge" | "humanism" | null;
type ModelKey = "gemini" | "claude-sonnet" | "claude-opus";
type FormatKey = "longform" | "shorts";

/* ─── 데이터 ─── */
const styles: { key: StyleKey & string; emoji: string; name: string; desc: string; prompt: string }[] = [
  { key: "standard", emoji: "📋", name: "스탠다드 롱폼", desc: "독독한 임집 형 · 6000자 즐글", prompt: "독독한 임집 형식, 6000자 줄글 스타일로 작성해줘" },
  { key: "community", emoji: "🔥", name: "커뮤니티", desc: "팔감자 음슴체 · 쇼츠 250~350자", prompt: "팔감자 음슴체, 쇼츠 250~350자 스타일로 작성해줘" },
  { key: "shopping", emoji: "🛒", name: "쇼핑", desc: "동적 타겟팅 · 구매 합리화 웃폼", prompt: "동적 타겟팅, 구매 합리화 롱폼 스타일로 작성해줘" },
  { key: "knowledge", emoji: "📝", name: "지식", desc: "정보 각인 프로토콜 · 지식 쇼츠", prompt: "정보 각인 프로토콜, 지식 쇼츠 스타일로 작성해줘" },
  { key: "humanism", emoji: "⚖️", name: "휴머니즘 사이다", desc: "빌런 참교육 · 감동 사이다 쇼츠", prompt: "빌런 참교육, 감동 사이다 쇼츠 스타일로 작성해줘" },
];

const durations = ["1분", "3분", "5분", "8분", "10분", "15분"];

/* ================================================================
   메인 페이지
   ================================================================ */
export default function ScriptsPage() {
  const supabase = createClient();
  
  /* ============================================================
     프로젝트 연동 관련 상태 및 이펙트
     ============================================================ */
  const [projects, setProjects] = useState<{id: number, title: string, status: string | null, progress: number}[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [editPoints, setEditPoints] = useState("");
  
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
        if (data.title) setTitle(data.title);
        if (data.format) setFormat(data.format as FormatKey);
        if (data.style) setSelectedStyle(data.style as StyleKey);
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

    const durationSec = parseInt(duration) * 60 || 0;
    const charCount = parseInt(wordCount) || 0;

    const payload = {
      user_id: user.id,
      project_id: selectedProjectId,
      title: title || (projects.find(p => p.id === selectedProjectId)?.title || "제목 없음"),
      content: generatedScript,
      format: format === "longform" ? "long" : "shorts",
      style: selectedStyle,
      target_duration_seconds: durationSec || null,
      target_char_count: charCount,
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

  /* STEP 1 */
  const [title, setTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");

  /* STEP 2 */
  const [selectedStyle, setSelectedStyle] = useState<StyleKey>(null);

  /* STEP 3 */
  const [format, setFormat] = useState<FormatKey>("longform");
  const [duration, setDuration] = useState("8분");
  const [durationOpen, setDurationOpen] = useState(false);
  const [target, setTarget] = useState("🌏 한국 (한국어)");
  const [targetOpen, setTargetOpen] = useState(false);
  const [wordCount, setWordCount] = useState("2400");
  const [loading, setLoading] = useState(false);
  const [generatedScript, setGeneratedScript] = useState("");
  const [copied, setCopied] = useState(false);
  const [showGeminiHint, setShowGeminiHint] = useState(false);

  /* 시간-글자수 자동 연동 */
  const updateDurationByWordCount = (count: string) => {
    const num = parseInt(count) || 0;
    const mins = Math.floor(num / 300);
    if (mins > 0) setDuration(`${mins}분`);
    setWordCount(count);
  };

  const updateWordCountByDuration = (dur: string) => {
    const mins = parseInt(dur.replace("분", "")) || 0;
    setWordCount((mins * 300).toString());
    setDuration(dur);
  };

  /* 쇼츠 전환 시 기본값 설정 */
  useEffect(() => {
    if (format === "shorts") {
      setWordCount("300");
    } else {
      setWordCount("2400");
      setDuration("8분");
    }
  }, [format]);

  /* 실시간 계산 표시 */
  const estimatedTimeText = useMemo(() => {
    const count = parseInt(wordCount) || 0;
    const totalSec = Math.round((count / 300) * 60);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `약 ${min}분 ${sec.toString().padStart(2, "0")}초`;
  }, [wordCount]);

  /* ─── 액션 ─── */
  const handleGenerateScript = async () => {
    if (!title) { alert("제목을 입력해 주세요."); return; }

    const styleObj = styles.find(s => s.key === selectedStyle);
    const styleInfo = styleObj ? `${styleObj.name} - ${styleObj.prompt}` : '선택 안 함';
    
    const finalDuration = format === 'shorts' ? '약 1분 분량' : duration;

    const text = `[대본 요청]
소재 - 제목: ${title}
소재 - 줄거리: ${synopsis || '없음'}
스타일: ${styleInfo}
형식: ${format === 'longform' ? '롱폼' : '쇼츠'}
시간: ${finalDuration}
글자수: ${wordCount}`;

    await navigator.clipboard.writeText(text);
    setShowGeminiHint(true);
    setTimeout(() => setShowGeminiHint(false), 4000);
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

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-16">
      {/* ── 페이지 제목 ── */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          ✍️ 대본 작성
        </h2>
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
          STEP 1: 소재 정하기
          ============================================================ */}
      <section>
        <SectionHeader number={1} title="소재 정하기" />

        <Card className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              제목
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="영상 제목을 입력하세요"
              className="h-10 w-full rounded-lg border border-border bg-brand-cream/50 px-3 text-sm outline-none transition-colors focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              줄거리
            </label>
            <textarea
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              rows={4}
              placeholder="영상의 줄거리나 핵심 내용을 입력하세요"
              className="w-full resize-none rounded-lg border border-border bg-brand-cream/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
            />
          </div>
        </Card>
      </section>

      {/* ============================================================
          STEP 2: 스타일 선택
          ============================================================ */}
      <section>
        <SectionHeader number={2} title="스타일 선택 (선택사항)" />

        <div className="mt-4 grid grid-cols-5 gap-3">
          {styles.map((s) => (
            <button
              key={s.key}
              onClick={() =>
                setSelectedStyle(selectedStyle === s.key ? null : s.key)
              }
              className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all duration-200 ${
                selectedStyle === s.key
                  ? "border-brand-olive bg-brand-olive/5 shadow-sm"
                  : "border-border bg-white hover:border-brand-olive-light hover:shadow-sm"
              }`}
            >
              <span className="text-2xl">{s.emoji}</span>
              <span className="text-xs font-semibold text-foreground">
                {s.name}
              </span>
              <span className="text-[10px] leading-tight text-muted-foreground">
                {s.desc}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ============================================================
          STEP 3: 프롬프트 생성
          ============================================================ */}
      <section>
        <SectionHeader number={3} title="프롬프트 생성" />

        {/* 옵션 영역 */}
        <Card className="mt-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* 형식 */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                형식
              </label>
              <div className="flex gap-1">
                <ToggleChip
                  label="롱폼"
                  active={format === "longform"}
                  onClick={() => setFormat("longform")}
                />
                <ToggleChip
                  label="쇼츠"
                  active={format === "shorts"}
                  onClick={() => setFormat("shorts")}
                />
              </div>
            </div>

            {/* 시간 (롱폼일 때만) */}
            {format === "longform" && (
              <div className="relative">
                <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                  시간
                </label>
                <button
                  onClick={() => setDurationOpen(!durationOpen)}
                  className="flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm transition-colors hover:border-brand-olive-light"
                >
                  {duration}
                  <ChevronDown size={14} className="text-muted-foreground" />
                </button>
                {durationOpen && (
                  <div className="absolute top-full z-10 mt-1 w-full rounded-lg border border-border bg-white py-1 shadow-lg">
                    {durations.map((d) => (
                      <button
                        key={d}
                        onClick={() => {
                          updateWordCountByDuration(d);
                          setDurationOpen(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-brand-cream ${
                          duration === d
                            ? "font-medium text-brand-olive"
                            : "text-foreground"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 타겟 */}
            <div className="relative">
              <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                타겟
              </label>
              <button
                onClick={() => setTargetOpen(!targetOpen)}
                className="flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm transition-colors hover:border-brand-olive-light"
              >
                {target}
                <ChevronDown size={14} className="text-muted-foreground" />
              </button>
              {targetOpen && (
                <div className="absolute top-full z-10 mt-1 w-48 rounded-lg border border-border bg-white py-1 shadow-lg">
                  {["🌏 한국 (한국어)", "🇺🇸 미국 (English)", "🇯🇵 일본 (日本語)"].map(
                    (t) => (
                      <button
                        key={t}
                        onClick={() => {
                          setTarget(t);
                          setTargetOpen(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-brand-cream ${
                          target === t
                            ? "font-medium text-brand-olive"
                            : "text-foreground"
                        }`}
                      >
                        {t}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>

            {/* 글자수 */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                글자수
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={wordCount}
                  onChange={(e) => updateDurationByWordCount(e.target.value)}
                  className="h-9 w-24 rounded-lg border border-border bg-white px-3 text-sm outline-none transition-colors focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                />
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {estimatedTimeText}
                </span>
              </div>
            </div>

            {/* 생성 버튼 그룹 */}
            <div className="ml-auto flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.open("https://gemini.google.com/gem/1g3AYashdcp4qPp4i4yBqdDweWdfGolSB", "_blank")}
                  className="flex h-10 items-center gap-1.5 rounded-lg border border-brand-olive/30 bg-white px-4 text-sm font-semibold text-brand-olive transition-colors hover:bg-brand-cream"
                >
                  💎 Gemini Gems 열기
                </button>
                <button
                  type="button"
                  onClick={handleGenerateScript}
                  className="flex h-10 items-center gap-1.5 rounded-lg bg-brand-pink px-6 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-pink-dark hover:shadow-md"
                >
                  ✨ 프롬프트 복사
                </button>
              </div>
              
              {showGeminiHint && (
                <div className="animate-in fade-in slide-in-from-top-1 text-right">
                  <p className="text-[12px] font-bold text-brand-pink">
                    클립보드에 복사됐어요! Gemini Gems에 붙여넣어 주세요 😊
                  </p>
                </div>
              )}
            </div>
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground">
            버튼을 누르면 요청 프롬프트가 복사됩니다. STEP 1 소재를 확인해주세요.
          </p>
        </Card>
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
            placeholder="Gemini Gems에서 생성한 대본을 여기에 붙여넣으세요..."
            className="min-h-[400px] w-full resize-none rounded-xl bg-transparent p-6 text-sm leading-relaxed text-foreground outline-none pb-20"
          />
          
          <div className="absolute bottom-4 inset-x-6 flex items-center justify-between pointer-events-none">
            <button
              onClick={handleSaveScript}
              className="pointer-events-auto flex items-center gap-1.5 rounded-lg bg-brand-olive px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-olive-dark hover:shadow-md"
            >
              <Save size={16} /> 대본 저장
            </button>
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
          편집점 (Gems에서 받은 편집 지시사항)
        </h3>
        <div className="group relative flex min-h-[200px] flex-col rounded-xl border border-border bg-white shadow-sm focus-within:border-brand-olive-light focus-within:ring-2 focus-within:ring-brand-olive/5 transition-all">
          <textarea
            value={editPoints}
            onChange={(e) => setEditPoints(e.target.value)}
            placeholder="Gemini Gems에서 받은 편집점을 여기에 붙여넣으세요..."
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
    </div>
  );
}

/* ================================================================
   공통 컴포넌트
   ================================================================ */

function SectionHeader({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-olive text-xs font-bold text-white">
        {number}
      </span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  );
}

function ModeCard({
  emoji,
  title,
  desc,
  selected,
  onClick,
}: {
  emoji: string;
  title: string;
  desc: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-2 rounded-xl border-2 bg-white p-6 transition-all duration-200 ${
        selected
          ? "border-brand-pink shadow-sm"
          : "border-transparent shadow-sm hover:border-brand-pink-light"
      }`}
    >
      <span className="text-3xl">{emoji}</span>
      <span className="text-sm font-semibold text-foreground">{title}</span>
      <span className="text-xs text-muted-foreground">{desc}</span>
    </button>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-white p-5 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

function ToggleChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
        active
          ? "bg-brand-olive text-white"
          : "bg-brand-cream text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
