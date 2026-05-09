"use client";

import { useState } from "react";
import {
  Search,
  Plus,
  Upload,
  Link as LinkIcon,
  FileUp,
  PenLine,
  Camera,
  X,
} from "lucide-react";

/* ─── 타입 ─── */
type MainTab = "keyword" | "channel" | "video" | "social";
type KeywordSubTab = "related" | "top" | "tags" | "history";

const mainTabs: { key: MainTab; label: string; emoji: string }[] = [
  { key: "keyword", label: "키워드 랩", emoji: "🔍" },
  { key: "channel", label: "채널 분석", emoji: "📊" },
  { key: "video", label: "영상 분석", emoji: "🎬" },
  { key: "social", label: "소셜 분석", emoji: "📱" },
];

/* ================================================================
   메인 페이지
   ================================================================ */
export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<MainTab>("keyword");

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
        {activeTab === "keyword" && <KeywordLab />}
        {activeTab === "channel" && <ChannelAnalysis />}
        {activeTab === "video" && <VideoAnalysis />}
        {activeTab === "social" && <SocialAnalysis />}
      </div>
    </div>
  );
}

/* ================================================================
   1. 키워드 랩
   ================================================================ */
function KeywordLab() {
  const [lang, setLang] = useState("ko");
  const [length, setLength] = useState("all");
  const [subTab, setSubTab] = useState<KeywordSubTab>("related");

  const langs = [
    { key: "ko", label: "한국어" },
    { key: "ja", label: "日本語" },
    { key: "en", label: "EN" },
  ];

  const lengths = [
    { key: "all", label: "전체" },
    { key: "shorts", label: "쇼츠" },
    { key: "mid", label: "중간" },
    { key: "long", label: "롱폼" },
  ];

  const subTabs: { key: KeywordSubTab; label: string }[] = [
    { key: "related", label: "연관 키워드" },
    { key: "top", label: "상위 영상" },
    { key: "tags", label: "태그 클라우드" },
    { key: "history", label: "분석 히스토리" },
  ];

  return (
    <div className="space-y-5">
      {/* 검색 바 */}
      <Card>
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              placeholder="분석할 YouTube 키워드 입력"
              className="h-11 w-full rounded-lg border border-border bg-brand-cream/50 pl-10 pr-4 text-sm outline-none transition-colors focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
            />
          </div>
          <button className="h-11 rounded-lg bg-brand-olive px-6 text-sm font-semibold text-white transition-colors hover:bg-brand-olive-dark">
            분석
          </button>
        </div>
      </Card>

      {/* 필터 */}
      <Card>
        <div className="flex flex-wrap items-center gap-6">
          {/* 언어 */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              언어
            </span>
            <div className="flex gap-1">
              {langs.map((l) => (
                <ToggleChip
                  key={l.key}
                  label={l.label}
                  active={lang === l.key}
                  onClick={() => setLang(l.key)}
                />
              ))}
            </div>
          </div>

          <div className="h-5 w-px bg-border" />

          {/* 영상 길이 */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              영상 길이
            </span>
            <div className="flex gap-1">
              {lengths.map((l) => (
                <ToggleChip
                  key={l.key}
                  label={l.label}
                  active={length === l.key}
                  onClick={() => setLength(l.key)}
                />
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* 하단 서브 탭 */}
      <Card noPadding>
        <div className="flex border-b border-border">
          {subTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSubTab(tab.key)}
              className={`relative px-5 py-3 text-sm font-medium transition-colors ${
                subTab === tab.key
                  ? "text-brand-olive"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              {subTab === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-olive" />
              )}
            </button>
          ))}
        </div>
        <EmptyState message="키워드를 분석하면 여기에 표시됩니다." />
      </Card>
    </div>
  );
}

/* ================================================================
   2. 채널 분석
   ================================================================ */
function ChannelAnalysis() {
  const [inputMethod, setInputMethod] = useState("youtube");
  const [format, setFormat] = useState("long");
  const [region, setRegion] = useState("domestic");
  const [count, setCount] = useState("10");

  const inputMethods = [
    { key: "youtube", label: "YouTube 채널", icon: LinkIcon },
    { key: "file", label: "파일 업로드", icon: FileUp },
    { key: "direct", label: "직접 입력", icon: PenLine },
  ];

  const formats = [
    { key: "long", label: "롱폼" },
    { key: "shorts", label: "쇼츠" },
  ];

  const regions = [
    { key: "domestic", label: "국내" },
    { key: "overseas", label: "해외" },
  ];

  const counts = ["5", "10", "15", "20", "30"];

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          벤치마크 채널의 URL을 입력하면 AI가 말투/구조/도입부 패턴을
          분석합니다.
        </p>
        <button className="flex items-center gap-1.5 rounded-lg bg-brand-pink px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-pink-dark">
          <Plus size={16} />
          새 분석
        </button>
      </div>

      {/* 채널 스타일 클로닝 */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-foreground">
          채널 스타일 클로닝
        </h3>

        <div className="space-y-4">
          {/* 입력 방식 */}
          <FilterRow label="입력 방식">
            <div className="flex gap-2">
              {inputMethods.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.key}
                    onClick={() => setInputMethod(m.key)}
                    className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                      inputMethod === m.key
                        ? "border-brand-olive bg-brand-olive/8 text-brand-olive-dark"
                        : "border-border text-muted-foreground hover:border-brand-olive-light hover:text-foreground"
                    }`}
                  >
                    <Icon size={15} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </FilterRow>

          {/* 콘텐츠 형식 */}
          <FilterRow label="콘텐츠 형식">
            <div className="flex gap-1">
              {formats.map((f) => (
                <ToggleChip
                  key={f.key}
                  label={f.label}
                  active={format === f.key}
                  onClick={() => setFormat(f.key)}
                />
              ))}
            </div>
          </FilterRow>

          {/* 콘텐츠 지역 */}
          <FilterRow label="콘텐츠 지역">
            <div className="flex gap-1">
              {regions.map((r) => (
                <ToggleChip
                  key={r.key}
                  label={r.label}
                  active={region === r.key}
                  onClick={() => setRegion(r.key)}
                />
              ))}
            </div>
          </FilterRow>

          {/* 분석 영상 수 */}
          <FilterRow label="분석 영상 수">
            <div className="flex gap-1">
              {counts.map((c) => (
                <ToggleChip
                  key={c}
                  label={`${c}개`}
                  active={count === c}
                  onClick={() => setCount(c)}
                />
              ))}
            </div>
          </FilterRow>

          {/* URL 입력 */}
          <div className="flex items-center gap-3 pt-2">
            <div className="relative flex-1">
              <LinkIcon
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                placeholder="YouTube 채널 URL을 입력하세요"
                className="h-11 w-full rounded-lg border border-border bg-brand-cream/50 pl-10 pr-4 text-sm outline-none transition-colors focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
              />
            </div>
            <button className="h-11 rounded-lg bg-brand-olive px-6 text-sm font-semibold text-white transition-colors hover:bg-brand-olive-dark">
              분석 시작
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ================================================================
   3. 영상 분석
   ================================================================ */
function VideoAnalysis() {
  const [urlCount, setUrlCount] = useState(1);
  const [targetTime, setTargetTime] = useState("original");
  const [versionCount, setVersionCount] = useState("3");

  const targetTimes = [
    { key: "original", label: "원본" },
    { key: "30", label: "30초" },
    { key: "45", label: "45초" },
    { key: "60", label: "60초" },
  ];

  const versions = ["1", "3", "5", "10"];

  const presets = [
    { name: "티키타카", desc: "대화형 구성" },
    { name: "스낵형", desc: "짧고 임팩트" },
    { name: "축약 리캡", desc: "핵심 요약" },
    { name: "심층 분석", desc: "깊이 있는 해석" },
    { name: "쇼핑형", desc: "제품 리뷰 특화" },
    { name: "All TTS", desc: "전체 AI 음성" },
  ];

  return (
    <div className="space-y-5">
      {/* URL 입력 */}
      <Card>
        <p className="mb-4 text-sm text-muted-foreground">
          리메이크할 영상 URL을 입력하세요
        </p>

        <div className="space-y-2.5">
          {Array.from({ length: urlCount }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 text-center text-xs font-medium text-muted-foreground">
                {i + 1}
              </span>
              <div className="relative flex-1">
                <LinkIcon
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  placeholder="YouTube 영상 URL"
                  className="h-10 w-full rounded-lg border border-border bg-brand-cream/50 pl-10 pr-4 text-sm outline-none transition-colors focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                />
              </div>
              {urlCount > 1 && (
                <button
                  onClick={() => setUrlCount((c) => Math.max(1, c - 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-red-300 hover:text-red-500"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        {urlCount < 5 && (
          <button
            onClick={() => setUrlCount((c) => Math.min(5, c + 1))}
            className="mt-3 flex items-center gap-1.5 text-sm font-medium text-brand-olive transition-colors hover:text-brand-olive-dark"
          >
            <Plus size={15} />
            영상 추가
          </button>
        )}
      </Card>

      {/* 리메이크 프리셋 */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-foreground">
          리메이크 프리셋
        </h3>

        <div className="mb-5 space-y-4">
          <FilterRow label="목표 시간">
            <div className="flex gap-1">
              {targetTimes.map((t) => (
                <ToggleChip
                  key={t.key}
                  label={t.label}
                  active={targetTime === t.key}
                  onClick={() => setTargetTime(t.key)}
                />
              ))}
            </div>
          </FilterRow>

          <FilterRow label="버전 수">
            <div className="flex gap-1">
              {versions.map((v) => (
                <ToggleChip
                  key={v}
                  label={`${v}개`}
                  active={versionCount === v}
                  onClick={() => setVersionCount(v)}
                />
              ))}
            </div>
          </FilterRow>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {presets.map((p) => (
            <button
              key={p.name}
              className="group flex flex-col items-center gap-1.5 rounded-xl border border-border bg-brand-cream/30 px-4 py-5 transition-all duration-200 hover:border-brand-pink hover:shadow-sm"
            >
              <span className="text-sm font-semibold text-foreground group-hover:text-brand-olive-dark">
                {p.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {p.desc}
              </span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ================================================================
   4. 소셜 분석
   ================================================================ */
function SocialAnalysis() {
  const [platform, setPlatform] = useState("instagram");

  const platforms = [
    { key: "instagram", label: "Instagram", icon: Camera },
    { key: "tiktok", label: "TikTok", emoji: "♪" },
    { key: "other", label: "기타 SNS", emoji: "💬" },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="mb-1 text-base font-semibold text-foreground">
          소셜 콘텐츠 분석실
        </h3>
        <p className="mb-5 text-sm text-muted-foreground">
          인스타/틱톡 스크린샷·영상 + 캡션 + 댓글 → AI 종합 분석
        </p>

        {/* 플랫폼 선택 */}
        <div className="mb-5 flex gap-2">
          {platforms.map((p) => {
            const hasIcon = "icon" in p;
            const Icon = hasIcon ? p.icon : null;
            return (
              <button
                key={p.key}
                onClick={() => setPlatform(p.key)}
                className={`flex items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-medium transition-all duration-200 ${
                  platform === p.key
                    ? "border-brand-olive bg-brand-olive/8 text-brand-olive-dark"
                    : "border-border text-muted-foreground hover:border-brand-olive-light hover:text-foreground"
                }`}
              >
                {Icon ? (
                  <Icon size={16} />
                ) : (
                  <span>{"emoji" in p ? p.emoji : ""}</span>
                )}
                {p.label}
              </button>
            );
          })}
        </div>

        {/* 스크린샷 업로드 */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              스크린샷 업로드
            </span>
            <span className="text-xs text-muted-foreground">0 / 10</span>
          </div>
          <div className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-brand-cream/30 transition-colors hover:border-brand-olive/40 hover:bg-brand-cream/60">
            <Upload size={20} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              클릭하거나 드래그하여 업로드 (최대 10장)
            </span>
          </div>
        </div>

        {/* 캡션 입력 */}
        <div>
          <span className="mb-2 block text-xs font-medium text-muted-foreground">
            캡션 / 대본
          </span>
          <textarea
            rows={4}
            placeholder="캡션이나 대본 내용을 입력하세요…"
            className="w-full resize-none rounded-xl border border-border bg-brand-cream/50 px-4 py-3 text-sm outline-none transition-colors focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
          />
        </div>
      </Card>
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
