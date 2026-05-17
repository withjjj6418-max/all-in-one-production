"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Search,
  Plus,
  Upload,
  Link as LinkIcon,
  FileUp,
  PenLine,
  Camera,
  X,
  Loader2,
  Play,
  Eye,
  ThumbsUp,
  MessageCircle,
  Calendar,
  Clock,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Info,
  ExternalLink,
  FileText,
} from "lucide-react";

/* ─── 타입 ─── */
type MainTab = "channel" | "video" | "creation";

const mainTabs: { key: MainTab; label: string; emoji: string }[] = [
  { key: "channel", label: "채널 분석", emoji: "📊" },
  { key: "video", label: "영상 분석", emoji: "🎬" },
  { key: "creation", label: "창작", emoji: "✨" },
];

/* ================================================================
   메인 페이지
   ================================================================ */
export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<MainTab>("video"); // 영상 분석을 기본으로 설정

  return (
    <div className="-m-8 flex flex-col">
      {/* ── 다크 탭 바 ── */}
      <div className="flex items-center gap-1 bg-[#1a1a2e] px-6 py-2">
        {mainTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-200 ${
              activeTab === tab.key
                ? "bg-white/15 text-white shadow-sm"
                : "text-white/50 hover:bg-white/8 hover:text-white/80"
            }`}
          >
            <span className="mr-1.5">{tab.emoji}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── 콘텐츠 영역 ── */}
      <div className="flex-1 p-6">
        {activeTab === "channel" && <ChannelAnalysis />}
        {activeTab === "video" && <VideoAnalysis />}
        {activeTab === "creation" && <CreationTab />}
      </div>
    </div>
  );
}

/* ================================================================
   2. 채널 분석
   ================================================================ */
function ChannelAnalysis() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="mb-2">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          📊 채널 분석
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          채널별 콘텐츠 전략 분석
        </p>
      </div>

      <div className="flex flex-col items-center justify-center py-32 text-center rounded-xl border border-border bg-white shadow-sm mt-8">
        <div className="text-4xl mb-4">🚧</div>
        <h3 className="text-lg font-bold text-foreground mb-2">곧 만들 예정입니다</h3>
        <p className="text-sm text-muted-foreground">잘되는 채널의 스타일·포맷·주제를 분석해서 명확하게 복제하는 기능</p>
      </div>
    </div>
  );
}

/* ================================================================
   3. 영상 분석
   ================================================================ */
function VideoAnalysis() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [videoData, setVideoData] = useState<any>(null);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [isGemsOpen, setIsGemsOpen] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedSystem, setCopiedSystem] = useState(false);
  
  /* ─── 유틸리티 ─── */
  const formatNumber = (num: number | null | undefined) => {
    if (!num) return "0";
    if (num >= 100000000) return (num / 100000000).toFixed(1) + "억";
    if (num >= 10000) return (num / 10000).toFixed(1) + "만";
    return num.toLocaleString();
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatDuration = (duration: string | null | undefined) => {
    if (!duration) return "00:00";
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return duration;
    const h = parseInt(match[1] || "0");
    const m = parseInt(match[2] || "0");
    const s = parseInt(match[3] || "0");
    if (h > 0)
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  /* ─── 로직 ─── */
  const handleFetch = async () => {
    if (!url.trim()) return;
    setLoading(true);
      setVideoData(null);
      try {
        const res = await fetch(
          `/api/youtube/transcript?url=${encodeURIComponent(url)}`
        );
        const json = await res.json();
        if (json.success) {
          setVideoData(json.data);
        } else {
        alert(json.error || "정보를 가져오는데 실패했습니다.");
      }
    } catch (err) {
      console.error(err);
      alert("오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const copyPrompt = () => {
    if (!videoData) return;
    const prompt = `다음 YouTube 영상을 분석해주세요.
[영상 정보]
제목: ${videoData.title}
채널: ${videoData.channelName} (구독자 약 ${formatNumber(videoData.channelSubscribers)}명)
조회수: ${videoData.viewCount.toLocaleString()}회
좋아요: ${videoData.likeCount.toLocaleString()}개
댓글: ${videoData.commentCount.toLocaleString()}개
게시일: ${formatDate(videoData.publishedAt)}
영상 길이: ${formatDuration(videoData.duration)}

[영상 설명]
${videoData.description}

[영상 자막]
${videoData.transcript || "(자막을 찾을 수 없습니다)"}

위 영상의 내용을 분석해서 다음을 알려주세요:

1. 영상의 핵심 주제와 메시지
2. 도입부 훅(hook) 분석 - 어떻게 시청자의 관심을 끌었는지
3. 콘텐츠 구조와 흐름
4. 시청 유지를 위한 장치 (질문, 강조, 반전 등)
5. 이 영상의 성공 요인 (조회수가 잘 나온 이유 추론)
6. 내 채널에 적용할 수 있는 인사이트 3가지`;

    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const copySystemPrompt = () => {
    const systemPrompt = `당신은 YouTube 콘텐츠 전략 전문가입니다.
당신은 사용자가 제공하는 영상 정보(메타데이터, 설명, 자막)를 바탕으로
다음 관점에서 깊이 있게 분석해주세요:

1. 콘텐츠 분석
- 핵심 주제와 전달하려는 메시지
- 영상의 구조와 흐름 (도입-전개-결론)
- 사용된 스토리텔링 기법

2. 퍼포먼스 분석
- 도입부 30초의 훅(hook) 효과성
- 시청 유지를 위한 장치 (질문, 강조, 비주얼 큐 등)
- 조회수/좋아요 비율로 본 시청자 반응

3. 인사이트 도출
- 이 영상이 성과를 낸 핵심 요인 3가지
- 콘텐츠 제작자가 벤치마킹할 포인트
- 본인 채널에 적용 가능한 구체적 액션 3가지

분석은 구체적이고 실용적으로, 한국어로 답해주세요.
이모지를 적절히 사용해서 읽기 좋게 정리해주세요.`;

    navigator.clipboard.writeText(systemPrompt);
    setCopiedSystem(true);
    setTimeout(() => setCopiedSystem(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* 섹션 1: 타이틀 */}
      <div className="mb-2">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          📊 영상 분석
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          YouTube 영상의 자막과 메타데이터를 분석 프롬프트로 변환합니다
        </p>
      </div>

      {/* 섹션 2: 입력 영역 */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <LinkIcon
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFetch()}
              placeholder="분석할 YouTube 영상 URL 입력"
              className="h-11 w-full rounded-lg border border-border bg-brand-cream/50 pl-10 pr-4 text-sm outline-none transition-colors focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
            />
          </div>
          <button
            onClick={handleFetch}
            disabled={loading || !url.trim()}
            className="h-11 rounded-lg bg-brand-olive px-6 text-sm font-semibold text-white transition-all hover:bg-brand-olive-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                수집 중... (자막 추출에 5-10초 소요)
              </>
            ) : (
              <>
                <Search size={16} />
                정보 수집
              </>
            )}
          </button>
        </div>
      </Card>

      {/* 섹션 3: 수집 결과 미리보기 */}
      {videoData && (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
          <Card>
            <div className="flex flex-col lg:flex-row gap-6">
              {/* 썸네일 */}
              <div className="w-full lg:w-96 shrink-0">
                <div className="relative aspect-video rounded-xl overflow-hidden bg-gray-100 border border-border shadow-inner">
                  <img
                    src={videoData.thumbnailUrl}
                    alt={videoData.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2.5 right-2.5 bg-black/80 text-white text-[11px] font-bold px-2 py-0.5 rounded flex items-center gap-1.5 backdrop-blur-sm">
                    <Clock size={12} />
                    {formatDuration(videoData.duration)}
                  </div>
                </div>
              </div>

              {/* 정보 */}
              <div className="flex-1 flex flex-col">
                <h3 className="text-xl font-bold text-gray-800 line-clamp-2 leading-tight">
                  {videoData.title}
                </h3>
                <p className="text-sm text-brand-olive font-bold mt-1.5">
                  {videoData.channelName} • 구독자 {formatNumber(videoData.channelSubscribers)}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      조회수
                    </span>
                    <span className="text-sm font-extrabold flex items-center gap-1 mt-0.5">
                      <Eye size={14} className="text-gray-400" />
                      {videoData.viewCount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      좋아요
                    </span>
                    <span className="text-sm font-extrabold flex items-center gap-1 mt-0.5">
                      <ThumbsUp size={14} className="text-gray-400" />
                      {videoData.likeCount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      댓글
                    </span>
                    <span className="text-sm font-extrabold flex items-center gap-1 mt-0.5">
                      <MessageCircle size={14} className="text-gray-400" />
                      {videoData.commentCount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      게시일
                    </span>
                    <span className="text-sm font-extrabold flex items-center gap-1 mt-0.5">
                      <Calendar size={14} className="text-gray-400" />
                      {formatDate(videoData.publishedAt)}
                    </span>
                  </div>
                </div>

                <div className="mt-auto pt-6 flex gap-2">
                  {videoData.transcript ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-700 text-[11px] font-extrabold border border-green-200">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      ✅ 자막 수집 완료 ({videoData.transcriptLanguage || "언어 자동"} /{" "}
                      {videoData.transcript.length.toLocaleString()}자)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-[11px] font-extrabold border border-amber-200">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      ⚠️ 자막을 찾을 수 없습니다 - 메타데이터만 분석 가능
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* 섹션 4: 자막 미리보기 */}
          {videoData.transcript && (
            <div className="border border-border bg-white rounded-xl overflow-hidden shadow-sm">
              <button
                onClick={() => setIsTranscriptOpen(!isTranscriptOpen)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <FileText size={17} className="text-brand-olive" />
                  자막 미리보기 보기
                </span>
                {isTranscriptOpen ? (
                  <ChevronUp size={18} />
                ) : (
                  <ChevronDown size={18} />
                )}
              </button>
              {isTranscriptOpen && (
                <div className="p-5 border-t border-border bg-brand-cream/10">
                  <div className="max-h-52 overflow-y-auto pr-2 custom-scrollbar">
                    <p className="text-xs leading-relaxed text-gray-600 whitespace-pre-wrap font-medium">
                      {videoData.transcript}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 섹션 5: 분석 프롬프트 생성 영역 */}
          <div className="pt-2">
            <button
              onClick={copyPrompt}
              className={`w-full py-6 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl active:scale-[0.98] ${
                copiedPrompt
                  ? "bg-green-600 scale-[1.01]"
                  : "bg-gradient-to-r from-brand-olive to-brand-olive-dark"
              }`}
            >
              <span className="text-white font-black text-xl flex items-center gap-2.5">
                {copiedPrompt ? (
                  <Check size={22} />
                ) : (
                  <span className="text-2xl">✨</span>
                )}
                {copiedPrompt ? "✓ 프롬프트 복사됨!" : "분석 프롬프트 복사"}
              </span>
              {!copiedPrompt && (
                <span className="text-white/90 text-[11px] font-bold tracking-wide uppercase">
                  Gemini Gems에 붙여넣어 깊이 있는 분석을 시작하세요
                </span>
              )}
            </button>
          </div>

          {/* 섹션 6: Gems 안내 */}
          <div className="mt-8 pt-6">
            <div className="bg-blue-50/40 rounded-2xl border border-blue-100/60 overflow-hidden">
              <button
                onClick={() => setIsGemsOpen(!isGemsOpen)}
                className="w-full flex items-center justify-between px-6 py-4.5 text-sm font-black text-blue-800 hover:bg-blue-100/30 transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <Info size={17} />
                  💡 Gemini Gems 설정 가이드
                </span>
                {isGemsOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
              {isGemsOpen && (
                <div className="px-6 pb-6 animate-in slide-in-from-top-2 duration-300">
                  <p className="text-[13px] text-blue-700/80 mb-5 leading-relaxed font-medium">
                    아직 Gems를 안 만들었다면, 아래 시스템 프롬프트를 그대로
                    복사해서 새 Gems의{" "}
                    <span className="font-black underline decoration-blue-300 decoration-2 underline-offset-2">
                      Instructions
                    </span>
                    에 붙여넣으세요.
                  </p>
                  <div className="relative group">
                    <div className="absolute right-3 top-3 z-10">
                      <button
                        onClick={copySystemPrompt}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all shadow-sm ${
                          copiedSystem
                            ? "bg-green-500 text-white"
                            : "bg-white text-blue-800 border border-blue-200 hover:bg-blue-50"
                        }`}
                      >
                        {copiedSystem ? <Check size={15} /> : <Copy size={15} />}
                        {copiedSystem ? "복사완료!" : "시스템 프롬프트 복사"}
                      </button>
                    </div>
                    <div className="bg-white/70 border border-blue-100 rounded-2xl p-6 pt-14 shadow-inner">
                      <pre className="text-[12px] text-blue-950/90 leading-relaxed font-sans whitespace-pre-wrap font-medium">
                        {`당신은 YouTube 콘텐츠 전략 전문가입니다.
사용자가 제공하는 영상 정보(메타데이터, 설명, 자막)를 바탕으로
다음 관점에서 깊이 있게 분석해주세요:

1. 콘텐츠 분석
- 핵심 주제와 전달하려는 메시지
- 영상의 구조와 흐름 (도입-전개-결론)
- 사용된 스토리텔링 기법

2. 퍼포먼스 분석
- 도입부 30초의 훅(hook) 효과성
- 시청 유지를 위한 장치 (질문, 강조, 비주얼 큐 등)
- 조회수/좋아요 비율로 본 시청자 반응

3. 인사이트 도출
- 이 영상이 성과를 낸 핵심 요인 3가지
- 콘텐츠 제작자가 벤치마킹할 포인트
- 본인 채널에 적용 가능한 구체적 액션 3가지

분석은 구체적이고 실용적으로, 한국어로 답해주세요.
이모지를 적절히 사용해서 읽기 좋게 정리해주세요.`}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================
   4. 창작 탭
   ================================================================ */
function CreationTab() {
  const supabase = createClient();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("none");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<string>("공감");
  const [copiedPrompt, setCopiedPrompt] = useState(false);

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

  const copyPrompt = () => {
    const promptLines = [
      '[소재]',
      '제목: ' + title,
      '줄거리: ' + summary,
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
      '',
      '감정을 설명하지 말고 장면으로 보여줄 것',
      '(예: "슬펐다" 대신 "밥이 잘 안 넘어갔다")',
      '(예: "걱정됐다" 대신 "손이 떨렸다")',
      '문장은 짧고 끊어서, 한 문장에 한 감정만',
      '구어체 사용 (예: ~했어요, ~더라고요, ~잖아요)',
      '',
      '[출력 형식]',
      '',
      '[훅] [발단] 같은 막 표시는 절대 쓰지 말 것',
      '처음부터 끝까지 줄글로 이어서 쓸 것',
      '한 문장이 끝나면 반드시 줄바꿈할 것',
      '번호, 기호, 구분선, BGM 지문 없이 대본만 출력할 것'
    ];

    const prompt = promptLines.join('\n');
    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="mb-2">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          ✨ 창작
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          새로운 콘텐츠의 소재와 스타일을 정하고 대본 프롬프트를 만드세요.
        </p>
      </div>

      <div className="space-y-6">
        {/* 1. 프로젝트 선택 */}
        <Card>
          <h3 className="text-lg font-bold text-gray-800 mb-4">1. 작업할 프로젝트 선택</h3>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full h-11 rounded-lg border border-border bg-white px-4 text-sm outline-none transition-colors focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
          >
            <option value="none">프로젝트 없이 진행</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </Card>

        {/* 2. 소재 정하기 */}
        <Card>
          <h3 className="text-lg font-bold text-gray-800 mb-4">2. 소재 정하기</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">제목 (가제)</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 초보자를 위한 주식 투자 가이드"
                className="w-full h-11 rounded-lg border border-border bg-white px-4 text-sm outline-none transition-colors focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">줄거리 및 핵심 내용</label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="어떤 내용을 다룰 것인지 간략하게 적어주세요."
                rows={4}
                className="w-full rounded-lg border border-border bg-white p-4 text-sm outline-none transition-colors focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20 resize-none"
              />
            </div>
          </div>
        </Card>

        {/* 3. 스타일 선택 */}
        <Card>
          <h3 className="text-lg font-bold text-gray-800 mb-4">3. 스타일 선택</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {styleOptions.map((style) => (
              <button
                key={style.label}
                onClick={() => setSelectedStyle(style.label)}
                className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all ${
                  selectedStyle === style.label
                    ? "border-brand-olive bg-brand-olive/5 shadow-sm"
                    : "border-border bg-white hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <div className={`w-2.5 h-2.5 shrink-0 rounded-full ${style.color}`} />
                <span className={`font-bold text-sm truncate ${selectedStyle === style.label ? "text-brand-olive-dark" : "text-gray-800"}`}>
                  {style.label}
                </span>
              </button>
            ))}
          </div>
        </Card>

        {/* 4. 프롬프트 복사 영역 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a
            href="https://gemini.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 h-14 rounded-xl bg-blue-50 text-blue-700 font-bold border border-blue-200 transition-all hover:bg-blue-100"
          >
            <ExternalLink size={18} />
            Gemini Gems 열기
          </a>
          <button
            onClick={copyPrompt}
            className={`flex items-center justify-center gap-2 h-14 rounded-xl font-bold transition-all shadow-sm text-white ${
              copiedPrompt ? "bg-green-600" : "bg-gradient-to-r from-brand-olive to-brand-olive-dark hover:shadow-md"
            }`}
          >
            {copiedPrompt ? <Check size={18} /> : <Copy size={18} />}
            {copiedPrompt ? "프롬프트 복사됨!" : "프롬프트 복사"}
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
    </div>
  );
}

/* ================================================================
   공통 컴포넌트
   ================================================================ */

function Card({
  children,
  noPadding,
}: {
  children: React.ReactNode;
  noPadding?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-white shadow-sm ${
        noPadding ? "" : "p-5"
      }`}
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
          : "bg-brand-cream text-muted-foreground hover:bg-brand-cream hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-48 items-center justify-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
