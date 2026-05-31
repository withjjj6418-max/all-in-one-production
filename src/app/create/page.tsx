"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Check, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

function Card({
  children,
  noPadding,
}: {
  children: React.ReactNode;
  noPadding?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-white shadow-sm ${noPadding ? "" : "p-5"
        }`}
    >
      {children}
    </div>
  );
}

function CreationTab() {
  const supabase = createClient();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("none");
  const [topicContent, setTopicContent] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 새 프로젝트 생성을 위한 상태
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectMemo, setNewProjectMemo] = useState("");
  const [prevSelectedProjectId, setPrevSelectedProjectId] = useState<string>("none");

  // 모달이 닫힐 때 만약 드롭다운이 '__create_new__'에 있다면 이전 선택값으로 복원
  useEffect(() => {
    if (!isCreateModalOpen && selectedProjectId === "__create_new__") {
      setSelectedProjectId(prevSelectedProjectId);
    }
  }, [isCreateModalOpen, selectedProjectId, prevSelectedProjectId]);

  const styleOptions: any[] = [
    { label: "공감", color: "bg-orange-500" },
    { label: "감동", color: "bg-pink-500" },
    { label: "슬픔", color: "bg-blue-500" },
    { label: "분노", color: "bg-red-500" },
    { label: "억울함", color: "bg-rose-600" },
    { label: "반전", color: "bg-purple-500" },
    { label: "충격", color: "bg-indigo-500" },
    { label: "사이다", color: "bg-green-500" },
    { label: "유머", color: "bg-yellow-500" },
    { label: "위로", color: "bg-sky-500" },
    { label: "지식", color: "bg-slate-500" },
    { label: "쇼핑", color: "bg-amber-500" },
  ];

  useEffect(() => {
    async function fetchProjects() {
      const { data, error } = await supabase.from("projects").select("id, title").order("updated_at", { ascending: false });
      if (!error && data) {
        setProjects(data);
      }
    }
    fetchProjects();
  }, [supabase]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const getPromptString = () => {
    const promptLines = [
      '[소재]',
      topicContent,
      '[스타일]',
      selectedStyle,
      '[대본 조건] - 전체 낭독 시간 55초 이내',
      '[6막 구조]',
      '',
      '훅(HOOK): 첫 3초 안에 시청자를 멈추게 할 것. 질문·반전 예고·충격적 한 마디 중 하나로 시작. 설명 없이 바로 던질 것',
      '발단: 훅 직후 분위기를 잠깐 가라앉힐 것. 일상적이고 따뜻한 장면으로 시청자를 안심시킬 것',
      '전개: 상황을 보여주되 과하게 설명하지 말 것. 살짝 어긋나는 느낌만 심을 것',
      '위기: 시청자가 "뭔가 이상하다"를 느끼는 구간. 말로 설명하지 말고 구체적인 단서 하나를 장면으로 보여줄 것. 이 단서가 절정의 반전과 자연스럽게 연결돼야 함',
      '절정: 위기에서 심은 단서가 터지는 구간. 감정이 가장 고조되며 반전이 드러남. 설명하지 말고 사물이나 짧은 한 마디로 터뜨릴 것',
      '결말: 감정의 절정이 지난 뒤 차분하게 가라앉힐 것. 단, 여운이 남아야 함',
      '',
      '[개연성 규칙 — 반드시 지킬 것]',
      '',
      '절정의 반전은 반드시 전개 또는 위기에서 미리 심어둔 단서에서 비롯될 것',
      '단서는 자연스럽게 스쳐지나가야 함. 너무 눈에 띄면 반전이 약해짐',
      '반전이 터졌을 때 시청자가 "아, 그게 그거였구나"를 느껴야 함',
      '갑자기 새로운 인물·사건·정보가 절정에서 등장하면 안 됨',
      '',
      '[문장 스타일]',

      '구어체 사용 (예: ~했어요, ~더라고요, ~잖아요)',
      '',
      '[출력 형식]',
      '',
      '[훅] [발단] 같은 막 표시는 절대 쓰지 말 것',
      '처음부터 끝까지 줄글로 이어서 쓸 것',
      '한 문장이 끝나면 반드시 줄바꿈할 것',
      '번호, 기호, 구분선, BGM 지문 없이 대본만 출력할 것'
    ];
    return promptLines.join('\n');
  };

  const handleCancelCreate = () => {
    setIsCreateModalOpen(false);
    setSelectedProjectId(prevSelectedProjectId);
    setNewProjectTitle("");
    setNewProjectMemo("");
  };

  const handleConfirmCreate = async () => {
    if (!newProjectTitle.trim()) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showToast("로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
        return;
      }

      const { data, error } = await supabase
        .from("projects")
        .insert({
          title: newProjectTitle.trim(),
          memo: newProjectMemo.trim(),
          status: "idea",
          progress: 0,
          updated_at: new Date().toISOString(),
          user_id: user.id
        })
        .select()
        .single();

      if (error) {
        console.error("프로젝트 생성 오류:", error);
        showToast("프로젝트 생성에 실패했습니다.");
        return;
      }

      if (data) {
        // 프로젝트 리스트 다시 가져오기
        const { data: fetchedData, error: fetchError } = await supabase
          .from("projects")
          .select("id, title")
          .order("updated_at", { ascending: false });

        if (!fetchError && fetchedData) {
          setProjects(fetchedData);
        }

        // 새로 만들어진 프로젝트 자동 선택 및 초기화
        setSelectedProjectId(String(data.id));
        setIsCreateModalOpen(false);
        setNewProjectTitle("");
        setNewProjectMemo("");
        showToast("프로젝트가 만들어졌어요!");
      }
    } catch (err) {
      console.error("Error in handleConfirmCreate:", err);
      showToast("프로젝트 생성 중 오류가 발생했습니다.");
    }
  };

  const validateInputs = () => {
    if (!topicContent.trim()) {
      showToast("소재 내용을 입력해주세요");
      return false;
    }
    if (!selectedStyle) {
      showToast("스타일을 선택해주세요");
      return false;
    }
    return true;
  };

  const handleSendToGemini = async () => {
    if (!validateInputs()) return;
    const prompt = getPromptString();
    await navigator.clipboard.writeText(prompt);
    showToast("프롬프트가 복사됐어요! Gemini에 붙여넣기(Ctrl+V) 하세요");
    window.open('https://gemini.google.com/', '_blank');
  };

  const handleSendToClaude = async () => {
    if (!validateInputs()) return;
    const prompt = getPromptString();
    await navigator.clipboard.writeText(prompt);
    showToast("프롬프트가 복사됐어요! Claude에 붙여넣기(Ctrl+V) 하세요");
    window.open('https://claude.ai/new', '_blank');
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
      {/* ── 상단 헤더 ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-brand-olive/10 text-brand-olive rounded-xl shadow-inner">
            <span className="text-2xl leading-none">✨</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800 tracking-tight">창작</h1>
            <p className="text-[11px] text-gray-400 font-medium mt-0.5">
              새로운 콘텐츠의 소재와 스타일을 정하고 대본 프롬프트를 만드세요.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* 1. 프로젝트 선택 */}
        <Card>
          <h3 className="text-lg font-bold text-gray-800 mb-4">1. 작업할 프로젝트 선택</h3>
          <select
            value={selectedProjectId}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "__create_new__") {
                setPrevSelectedProjectId(selectedProjectId);
                setIsCreateModalOpen(true);
              } else {
                setSelectedProjectId(val);
              }
            }}
            className="w-full h-11 rounded-lg border border-border bg-white px-4 text-sm outline-none transition-colors focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
          >
            <option value="none">프로젝트 없이 진행</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
            <option disabled>───────────────────────────</option>
            <option value="__create_new__">➕ 새 프로젝트 만들기</option>
          </select>
        </Card>

        {/* 2. 소재 정하기 */}
        <section>
          <h3 className="text-lg font-bold text-gray-800 mb-3">2. 소재 정하기</h3>
          <div className="group relative flex min-h-[200px] flex-col rounded-xl border border-border bg-white shadow-sm focus-within:border-brand-olive-light focus-within:ring-2 focus-within:ring-brand-olive/5 transition-all">
            <textarea
              value={topicContent}
              onChange={(e) => setTopicContent(e.target.value)}
              placeholder="만들고 싶은 콘텐츠의 소재와 내용을 자유롭게 적어주세요.&#10;예) 초보자를 위한 주식 투자 가이드. 쉽고 재밌는 자산 배분 비법을 설명해줘."
              className="w-full flex-1 min-h-[180px] resize-none bg-transparent p-5 text-sm leading-relaxed text-foreground outline-none border-0"
            />
          </div>
        </section>

        {/* 3. 스타일 선택 */}
        <Card>
          <h3 className="text-lg font-bold text-gray-800 mb-4">3. 스타일 선택</h3>
          <div className="flex flex-wrap gap-2">
            {styleOptions.map((style) => (
              <button
                key={style.label}
                onClick={() => setSelectedStyle(style.label)}
                className={`inline-flex items-center justify-center rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-bold border transition-all cursor-pointer select-none ${
                  selectedStyle === style.label
                    ? "bg-brand-olive text-white border-brand-olive shadow-sm"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50/80"
                }`}
              >
                {style.label}
              </button>
            ))}
          </div>
        </Card>

        {/* 4. AI 서비스로 보내기 */}
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleSendToGemini}
            style={{ backgroundColor: '#4A90E2' }}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:brightness-95 hover:shadow-lg cursor-pointer"
          >
            <img src="/gemini_logo.png" alt="Gemini" className="w-[18px] h-[18px] object-contain shrink-0" />
            Gemini로 보내기
          </button>
          <button
            onClick={handleSendToClaude}
            style={{ backgroundColor: '#D36B42' }}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:brightness-95 hover:shadow-lg cursor-pointer"
          >
            <img src="/claude_logo.png" alt="Claude" className="w-[18px] h-[18px] object-contain shrink-0" />
            Claude로 보내기
          </button>
        </div>

        {/* 5. 다음 단계 안내 */}
        <div className="bg-brand-cream/50 rounded-xl border border-border p-6 flex flex-col items-center justify-center text-center space-y-4 mt-6">
          <p className="text-sm font-medium text-gray-700">
            Gems에서 만든 대본을 받으면 <span className="font-bold text-brand-olive-dark">대본작성 페이지</span>에서 저장하세요.
          </p>
          <Link
            href="/scripts"
            className="inline-flex items-center justify-center gap-2 h-10 px-6 rounded-lg bg-gray-800 text-white text-sm font-bold transition-colors hover:bg-gray-900 shadow-sm"
          >
            대본작성 페이지로 이동
            <ExternalLink size={14} />
          </Link>
        </div>
      </div>

      {/* 새 프로젝트 생성 모달 */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-800">새 프로젝트 만들기</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                제목 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
                placeholder="제목을 입력하세요"
                className="w-full h-11 rounded-lg border border-border bg-white px-4 text-sm outline-none transition-colors focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">메모 (선택)</label>
              <textarea
                value={newProjectMemo}
                onChange={(e) => setNewProjectMemo(e.target.value)}
                placeholder="메모를 입력하세요"
                rows={4}
                className="w-full rounded-lg border border-border bg-white p-4 text-sm outline-none transition-colors focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20 resize-none"
              />
            </div>
          </div>
          <DialogFooter className="flex gap-3">
            <button
              onClick={handleCancelCreate}
              className="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-200"
            >
              취소
            </button>
            <button
              onClick={handleConfirmCreate}
              disabled={!newProjectTitle.trim()}
              className="flex-1 rounded-xl bg-brand-olive py-3 text-sm font-semibold text-white transition hover:bg-brand-olive-dark shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              만들기
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 토스트 메시지 UI */}
      {toastMessage && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in">
          <div className="bg-gray-800 text-white px-6 py-3 rounded-full shadow-lg font-medium text-sm flex items-center gap-2">
            {toastMessage.includes("입력") || toastMessage.includes("선택") ? (
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

export default function CreatePage() {
  return (
    <div className="flex-1 px-3 py-4 sm:p-6">
      <CreationTab />
    </div>
  );
}
