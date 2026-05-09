"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Upload, Search } from "lucide-react";

/* ─── 더미 ─── */
const dummyScript = [
  { id: 1, text: "안녕하세요, 오늘은 호르무즈 해협에 대해 알아보겠습니다.", chars: 28 },
  { id: 2, text: "호르무즈 해협은 세계 석유 수송의 핵심 관문입니다.", chars: 24 },
  { id: 3, text: "이 좁은 수로를 통해 하루 약 2천만 배럴의 원유가 이동합니다.", chars: 30 },
  { id: 4, text: "만약 이곳이 봉쇄된다면 전 세계 경제에 큰 충격이 올 것입니다.", chars: 31 },
  { id: 5, text: "지금부터 그 이유를 자세히 살펴보겠습니다.", chars: 20 },
];

const styleCategories = [
  {
    emoji: "🎬", name: "영화 & 드라마",
    styles: [
      { name: "시네마틱 리얼", desc: "영화 같은 조명과 색감", color: "bg-slate-300" },
      { name: "다큐멘터리", desc: "자연스러운 다큐 톤", color: "bg-amber-200" },
      { name: "느와르", desc: "어둡고 극적인 분위기", color: "bg-gray-400" },
    ],
  },
  {
    emoji: "☕", name: "CF & 커머셜",
    styles: [
      { name: "프리미엄 광고", desc: "고급스러운 제품 룩", color: "bg-yellow-200" },
      { name: "라이프스타일", desc: "밝고 따뜻한 일상", color: "bg-orange-200" },
      { name: "미니멀", desc: "깔끔한 화이트 배경", color: "bg-neutral-200" },
    ],
  },
  {
    emoji: "🎨", name: "애니메이션 & 3D",
    styles: [
      { name: "지브리", desc: "스튜디오 지브리 스타일", color: "bg-green-200" },
      { name: "픽사", desc: "3D 렌더링 카툰", color: "bg-blue-200" },
      { name: "셀 애니메이션", desc: "전통 2D 애니", color: "bg-pink-200" },
    ],
  },
  {
    emoji: "🖼️", name: "웹툰 & 그래픽",
    styles: [
      { name: "한국 웹툰", desc: "웹툰 컷 스타일", color: "bg-violet-200" },
      { name: "일러스트", desc: "디지털 일러스트레이션", color: "bg-teal-200" },
      { name: "팝아트", desc: "강렬한 컬러와 패턴", color: "bg-rose-200" },
    ],
  },
];

const aspectRatios = [
  { key: "16:9", label: "16:9", desc: "가로 / 유튜브" },
  { key: "9:16", label: "9:16", desc: "세로 / 쇼츠" },
  { key: "1:1", label: "1:1", desc: "정사각 / 인스타" },
];

const charFreqs = [
  { key: "auto", label: "자동(AI)" },
  { key: "always", label: "항상(진행자)" },
  { key: "min", label: "최소화(B-Roll)" },
  { key: "none", label: "출연 안함" },
];

export default function StyleTab() {
  const [scriptOpen, setScriptOpen] = useState(true);
  const [directInput, setDirectInput] = useState(false);
  const [multiChar, setMultiChar] = useState(false);
  const [cutCount, setCutCount] = useState("17");
  const [ratio, setRatio] = useState("16:9");
  const [infographic, setInfographic] = useState(false);
  const [charFreq, setCharFreq] = useState("auto");
  const [textLock, setTextLock] = useState(false);
  const [cleanMode, setCleanMode] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [styleIndependent, setStyleIndependent] = useState(false);
  const [openCategory, setOpenCategory] = useState<string | null>("영화 & 드라마");
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [dialogue, setDialogue] = useState(false);

  return (
    <div className="space-y-5">
      {/* ── 현재 적용된 대본 ── */}
      <Card>
        <button
          onClick={() => setScriptOpen(!scriptOpen)}
          className="flex w-full items-center justify-between"
        >
          <span className="text-sm font-semibold text-foreground">
            📄 현재 적용된 대본
          </span>
          {scriptOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {scriptOpen && (
          <div className="mt-3 divide-y divide-border">
            {dummyScript.map((s) => (
              <div key={s.id} className="flex items-center gap-3 py-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-olive/10 text-[10px] font-semibold text-brand-olive">
                  {s.id}
                </span>
                <p className="min-w-0 flex-1 text-xs text-foreground">{s.text}</p>
                <span className="shrink-0 text-[10px] text-muted-foreground">{s.chars}자</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── 대본 직접 입력 ── */}
      <Card>
        <ToggleRow label="대본 직접 입력" value={directInput} onChange={setDirectInput} />
      </Card>

      {/* ── 1. 캐릭터 레퍼런스 ── */}
      <SectionHeader number={1} title="캐릭터 레퍼런스" />
      <Card>
        <ToggleRow label="멀티캐릭터" value={multiChar} onChange={setMultiChar} />
        <div className="mt-4 flex gap-4">
          {/* 업로드 */}
          <div className="flex h-40 w-40 shrink-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-brand-cream/30 transition-colors hover:border-brand-olive/40">
            <Upload size={20} className="text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">이미지 업로드</span>
          </div>
          {/* 정보 */}
          <div className="min-w-0 flex-1 space-y-2">
            <MiniField label="AI 분석 결과" placeholder="자동 분석됩니다" />
            <MiniField label="예술 스타일" placeholder="예: 시네마틱, 지브리 등" />
            <MiniField label="캐릭터 특징" placeholder="예: 30대 남성, 짧은 머리" />
            <button className="mt-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
              내 캐릭터
            </button>
          </div>
        </div>
      </Card>

      {/* ── 2. 생성 옵션 ── */}
      <SectionHeader number={2} title="생성 옵션" />
      <Card className="space-y-4">
        {/* 목표 컷 수 */}
        <div className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-xs font-medium text-muted-foreground">목표 컷 수</span>
          <input
            type="number"
            value={cutCount}
            onChange={(e) => setCutCount(e.target.value)}
            className="h-8 w-20 rounded-lg border border-border bg-white px-2 text-center text-sm outline-none focus:border-brand-olive"
          />
        </div>

        {/* 화면 비율 */}
        <div>
          <span className="mb-2 block text-xs font-medium text-muted-foreground">화면 비율</span>
          <div className="grid grid-cols-3 gap-2">
            {aspectRatios.map((a) => (
              <button
                key={a.key}
                onClick={() => setRatio(a.key)}
                className={`rounded-xl border p-3 text-center transition-all ${
                  ratio === a.key
                    ? "border-brand-olive bg-brand-olive/5 shadow-sm"
                    : "border-border bg-white hover:shadow-sm"
                }`}
              >
                <span className="block text-sm font-semibold text-foreground">{a.label}</span>
                <span className="text-[10px] text-muted-foreground">{a.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <ToggleRow label="인포그래픽 모드" value={infographic} onChange={setInfographic} />

        {/* 캐릭터 출연 빈도 */}
        <div>
          <span className="mb-2 block text-xs font-medium text-muted-foreground">캐릭터 출연 빈도</span>
          <div className="flex flex-wrap gap-1">
            {charFreqs.map((f) => (
              <Chip key={f.key} label={f.label} active={charFreq === f.key} onClick={() => setCharFreq(f.key)} />
            ))}
          </div>
        </div>

        <ToggleRow label="텍스트 언어 강제 고정" value={textLock} onChange={setTextLock} />
        <ToggleRow label="텍스트 생성 금지 (Clean Mode)" value={cleanMode} onChange={setCleanMode} />
        <ToggleRow label="웹 검색 참조 모드" value={webSearch} onChange={setWebSearch} />
      </Card>

      {/* ── 3. 비주얼 스타일 ── */}
      <SectionHeader number={3} title="비주얼 스타일 (선택)" />
      <Card>
        <label className="mb-3 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={styleIndependent}
            onChange={(e) => setStyleIndependent(e.target.checked)}
            className="accent-brand-olive"
          />
          <span className="font-medium text-muted-foreground">스타일 독립/혼합 모드</span>
        </label>

        <div className="space-y-2">
          {styleCategories.map((cat) => (
            <div key={cat.name} className="rounded-lg border border-border">
              <button
                onClick={() => setOpenCategory(openCategory === cat.name ? null : cat.name)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-semibold text-foreground"
              >
                <span>{cat.emoji} {cat.name}</span>
                {openCategory === cat.name ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {openCategory === cat.name && (
                <div className="grid grid-cols-3 gap-2 px-3 pb-3">
                  {cat.styles.map((s) => (
                    <div
                      key={s.name}
                      className={`rounded-xl border p-3 transition-all ${
                        selectedStyle === s.name
                          ? "border-brand-pink shadow-sm"
                          : "border-border hover:shadow-sm"
                      }`}
                    >
                      <div className={`mb-2 h-16 rounded-lg ${s.color}`} />
                      <p className="text-xs font-semibold text-foreground">{s.name}</p>
                      <p className="text-[10px] text-muted-foreground">{s.desc}</p>
                      <button
                        onClick={() => setSelectedStyle(selectedStyle === s.name ? null : s.name)}
                        className={`mt-2 w-full rounded-md py-1 text-[11px] font-medium transition-all ${
                          selectedStyle === s.name
                            ? "bg-brand-pink text-white"
                            : "bg-brand-cream text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {selectedStyle === s.name ? "적용됨" : "적용"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* ── 이미지 레퍼런스 ── */}
      <Card>
        <span className="mb-2 block text-xs font-semibold text-foreground">🖼️ 이미지 레퍼런스 (선택, 최대 3장)</span>
        <div className="flex h-24 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border bg-brand-cream/30 transition-colors hover:border-brand-olive/40">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Upload size={16} />
            드래그 앤 드롭 또는 클릭하여 업로드
          </div>
        </div>
        <textarea
          rows={2}
          placeholder="추가 스타일 지시사항을 입력하세요"
          className="mt-3 w-full resize-none rounded-lg border border-border bg-brand-cream/50 px-3 py-2 text-xs outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
        />
      </Card>

      {/* ── 4. 대사 생성 ── */}
      <SectionHeader number={4} title="대사 생성 (선택)" />
      <Card>
        <ToggleRow label="대사 자동 생성" value={dialogue} onChange={setDialogue} />
      </Card>

      {/* ── 하단 버튼 ── */}
      <button className="w-full rounded-xl bg-brand-olive py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-olive-dark">
        🎬 스토리보드 열기
      </button>
    </div>
  );
}

/* ── 공통 ── */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

function SectionHeader({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-olive text-xs font-bold text-white">{number}</span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 rounded-full transition-colors ${value ? "bg-brand-olive" : "bg-gray-200"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${value ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
        active ? "bg-brand-olive text-white" : "bg-brand-cream text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function MiniField({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <div>
      <span className="mb-1 block text-[10px] font-medium text-muted-foreground">{label}</span>
      <input
        placeholder={placeholder}
        className="h-7 w-full rounded-md border border-border bg-brand-cream/50 px-2 text-xs outline-none focus:border-brand-olive"
      />
    </div>
  );
}
