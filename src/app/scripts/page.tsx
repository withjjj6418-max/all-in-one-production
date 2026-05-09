"use client";

import { useState, useMemo } from "react";
import { Copy, FileUp, ChevronDown, Flame } from "lucide-react";

/* ─── 타입 ─── */
type MaterialMode = "ai" | "manual" | null;
type StyleKey = "standard" | "community" | "shopping" | "knowledge" | "humanism" | null;
type ModelKey = "gemini" | "claude-sonnet" | "claude-opus";
type FormatKey = "longform" | "shorts";

/* ─── 데이터 ─── */
const styles: { key: StyleKey & string; emoji: string; name: string; desc: string }[] = [
  { key: "standard", emoji: "📋", name: "스탠다드 롱폼", desc: "독독한 임집 형 · 6000자 즐글" },
  { key: "community", emoji: "🔥", name: "커뮤니티", desc: "팔감자 음슴체 · 쇼츠 250~350자" },
  { key: "shopping", emoji: "🛒", name: "쇼핑", desc: "동적 타겟팅 · 구매 합리화 웃폼" },
  { key: "knowledge", emoji: "📝", name: "지식", desc: "정보 각인 프로토콜 · 지식 쇼츠" },
  { key: "humanism", emoji: "⚖️", name: "휴머니즘 사이다", desc: "빌런 참교육 · 감동 사이다 쇼츠" },
];

const models: { key: ModelKey; emoji: string; name: string; desc: string; price: string; recommended?: boolean }[] = [
  { key: "gemini", emoji: "✨", name: "Gemini 2.5 Pro", desc: "웹 검색으로 최신 정보 반영", price: "$0.015/편", recommended: true },
  { key: "claude-sonnet", emoji: "💜", name: "Claude Sonnet 4.5", desc: "자연스러운 한국어", price: "$0.021/편" },
  { key: "claude-opus", emoji: "🔮", name: "Claude Opus 4.5", desc: "최고 수준 스토리텔링", price: "$0.035/편" },
];

const durations = ["5분", "8분", "10분", "15분"];

/* ================================================================
   메인 페이지
   ================================================================ */
export default function ScriptsPage() {
  /* STEP 1 */
  const [materialMode, setMaterialMode] = useState<MaterialMode>(null);
  const [hint, setHint] = useState("");
  const [title, setTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");

  /* STEP 2 */
  const [selectedStyle, setSelectedStyle] = useState<StyleKey>(null);

  /* STEP 3 */
  const [selectedModel, setSelectedModel] = useState<ModelKey>("gemini");
  const [format, setFormat] = useState<FormatKey>("longform");
  const [duration, setDuration] = useState("8분");
  const [durationOpen, setDurationOpen] = useState(false);
  const [target, setTarget] = useState("🌏 한국 (한국어)");
  const [targetOpen, setTargetOpen] = useState(false);
  const [wordCount, setWordCount] = useState("2400");

  /* 글자수 → 시간 자동 계산 (분당 ~300자 기준) */
  const estimatedTime = useMemo(() => {
    const count = parseInt(wordCount) || 0;
    const totalSec = Math.round((count / 300) * 60);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `약 ${min}분 ${sec.toString().padStart(2, "0")}초`;
  }, [wordCount]);

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-16">
      {/* ── 페이지 제목 ── */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          ✍️ 대본 작성
        </h2>
      </div>

      {/* ============================================================
          STEP 1: 소재 정하기
          ============================================================ */}
      <section>
        <SectionHeader number={1} title="소재 정하기" />

        {/* 모드 선택 카드 */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <ModeCard
            emoji="🔍"
            title="AI가 추천해줘"
            desc="주제가 없어도 OK"
            selected={materialMode === "ai"}
            onClick={() => setMaterialMode("ai")}
          />
          <ModeCard
            emoji="✏️"
            title="직접 입력할게"
            desc="제목 + 줄거리"
            selected={materialMode === "manual"}
            onClick={() => setMaterialMode("manual")}
          />
        </div>

        {/* AI 추천 입력 */}
        {materialMode === "ai" && (
          <Card className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              주제 힌트 (선택사항)
            </label>
            <input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="예: 최근 이슈, 역사, 과학 등 관심 분야"
              className="h-10 w-full rounded-lg border border-border bg-brand-cream/50 px-3 text-sm outline-none transition-colors focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
            />
          </Card>
        )}

        {/* 직접 입력 */}
        {materialMode === "manual" && (
          <Card className="mt-4 space-y-3">
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
                rows={3}
                placeholder="영상의 줄거리나 핵심 내용을 입력하세요"
                className="w-full resize-none rounded-lg border border-border bg-brand-cream/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
              />
            </div>
          </Card>
        )}

        {/* 바이럴 소재 추천 버튼 */}
        <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-olive py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-olive-dark">
          <Flame size={16} />
          지금 뜨는 바이럴 소재 5개 추천받기
        </button>
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
          고급: 본능 기제 / 벤치마크로 정교한 추천
        </p>
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
          STEP 3: 대본 생성
          ============================================================ */}
      <section>
        <SectionHeader number={3} title="대본 생성" />

        {/* AI 모델 선택 */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {models.map((m) => (
            <button
              key={m.key}
              onClick={() => setSelectedModel(m.key)}
              className={`relative flex flex-col gap-1.5 rounded-xl border p-4 text-left transition-all duration-200 ${
                selectedModel === m.key
                  ? "border-brand-pink bg-brand-pink/5 shadow-sm"
                  : "border-border bg-white hover:border-brand-pink-light hover:shadow-sm"
              }`}
            >
              {m.recommended && (
                <span className="absolute -top-2 right-3 rounded-full bg-brand-olive px-2 py-0.5 text-[10px] font-semibold text-white">
                  추천
                </span>
              )}
              <div className="flex items-center gap-1.5">
                <span className="text-lg">{m.emoji}</span>
                <span className="text-sm font-semibold text-foreground">
                  {m.name}
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {m.desc}
              </span>
              <span className="text-[11px] font-medium text-brand-olive">
                {m.price}
              </span>
            </button>
          ))}
        </div>

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
                          setDuration(d);
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
                  onChange={(e) => setWordCount(e.target.value)}
                  className="h-9 w-24 rounded-lg border border-border bg-white px-3 text-sm outline-none transition-colors focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                />
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {estimatedTime}
                </span>
              </div>
            </div>

            {/* 생성 버튼 */}
            <div className="ml-auto">
              <button className="flex h-9 items-center gap-1.5 rounded-lg bg-brand-pink px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-pink-dark">
                ✨ AI 대본 생성
              </button>
            </div>
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground">
            STEP 1에서 소재를 선택하거나 직접 입력하세요
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
            <button className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brand-olive-light hover:text-foreground">
              <FileUp size={13} />
              파일 불러오기
            </button>
            <button className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brand-olive-light hover:text-foreground">
              <Copy size={13} />
              복사
            </button>
          </div>
        </div>

        <div className="mt-3 flex min-h-[200px] items-center justify-center rounded-xl border border-border bg-white p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">
            AI가 생성한 대본이 여기에 표시됩니다.
          </p>
        </div>
      </section>
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
