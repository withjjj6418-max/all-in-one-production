"use client";

import { useState } from "react";
import {
  Play,
  Pause,
  Download,
  ChevronDown,
  Upload,
  Mic,
  Volume2,
  Send,
} from "lucide-react";

/* ─── 더미 데이터 ─── */
const dummySentences = [
  { id: 1, text: "안녕하세요, 오늘은 호르무즈 해협에 대해 알아보겠습니다.", emotion: "차분", speed: "1.0x" },
  { id: 2, text: "호르무즈 해협은 세계 석유 수송의 핵심 관문입니다.", emotion: "진지", speed: "1.0x" },
  { id: 3, text: "이 좁은 수로를 통해 하루 약 2천만 배럴의 원유가 이동합니다.", emotion: "강조", speed: "0.9x" },
];

const engines = [
  { key: "typecast", name: "Typecast", desc: "API 키 필요", voices: "542개 음성" },
  { key: "elevenlabs", name: "ElevenLabs", desc: "API 키 필요", voices: "126개 음성" },
  { key: "supertonic", name: "Supertonic 2", desc: "로컬 무료", voices: "10개 음성" },
];

export default function NarrationTab() {
  const [subTab, setSubTab] = useState<"narration" | "edit">("narration");
  const [source, setSource] = useState<"ai" | "upload">("ai");
  const [engine, setEngine] = useState("typecast");
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="space-y-4">
      {/* 서브탭 */}
      <div className="flex gap-1">
        <button
          onClick={() => setSubTab("narration")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
            subTab === "narration"
              ? "bg-brand-olive text-white"
              : "text-muted-foreground hover:bg-brand-cream"
          }`}
        >
          나레이션
        </button>
        <button
          onClick={() => setSubTab("edit")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
            subTab === "edit"
              ? "bg-brand-olive text-white"
              : "text-muted-foreground hover:bg-brand-cream"
          }`}
        >
          오디오 편집
        </button>
      </div>

      {subTab === "edit" ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-border bg-white shadow-sm">
          <p className="text-sm text-muted-foreground">오디오 편집 기능 준비 중</p>
        </div>
      ) : (
        <>
          {/* 소스 선택 */}
          <div className="flex gap-2">
            <button
              onClick={() => setSource("ai")}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                source === "ai"
                  ? "border-brand-olive bg-brand-olive/8 text-brand-olive-dark"
                  : "border-border text-muted-foreground hover:border-brand-olive-light"
              }`}
            >
              <Mic size={15} /> AI 음성 생성
            </button>
            <button
              onClick={() => setSource("upload")}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                source === "upload"
                  ? "border-brand-olive bg-brand-olive/8 text-brand-olive-dark"
                  : "border-border text-muted-foreground hover:border-brand-olive-light"
              }`}
            >
              <Upload size={15} /> 오디오 업로드
            </button>
          </div>

          {/* 음성 엔진 */}
          <div className="grid grid-cols-3 gap-3">
            {engines.map((e) => (
              <button
                key={e.key}
                onClick={() => setEngine(e.key)}
                className={`rounded-xl border p-4 text-left transition-all duration-200 ${
                  engine === e.key
                    ? "border-brand-pink bg-brand-pink/5 shadow-sm"
                    : "border-border bg-white hover:shadow-sm"
                }`}
              >
                <p className="text-sm font-semibold text-foreground">{e.name}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {e.desc} · {e.voices}
                </p>
              </button>
            ))}
          </div>

          {/* 음성 설정 바 */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white p-3 shadow-sm">
            <DropdownBtn label="최신 음성" />
            <button className="rounded-md bg-brand-cream px-3 py-1.5 text-xs font-medium text-brand-olive transition-colors hover:bg-brand-olive/10">
              스마트 이모션
            </button>
            <DropdownBtn label="감정: 차분" />
            <MiniInput label="속도" value="1x" />
            <MiniInput label="피치" value="0" />
            <DropdownBtn label="한국어" />
            <button className="ml-auto rounded-lg bg-brand-olive px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-olive-dark">
              전체 적용
            </button>
          </div>

          {/* 대본 표시 */}
          <div className="rounded-xl border border-border bg-white shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <span className="text-xs font-semibold text-foreground">
                화자 1
              </span>
            </div>
            <div className="divide-y divide-border">
              {dummySentences.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-brand-cream/40"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-olive/10 text-[11px] font-semibold text-brand-olive">
                    {s.id}
                  </span>
                  <p className="min-w-0 flex-1 text-sm text-foreground">
                    {s.text}
                  </p>
                  <span className="shrink-0 rounded-md bg-brand-cream px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {s.emotion}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {s.speed}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 오디오 파형 + 컨트롤 */}
          <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
            {/* 파형 (더미) */}
            <div className="mb-4 flex h-16 items-center gap-px overflow-hidden rounded-lg bg-brand-cream/60 px-2">
              {Array.from({ length: 80 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 rounded-full bg-brand-olive/30"
                  style={{
                    height: `${Math.max(8, Math.random() * 100)}%`,
                  }}
                />
              ))}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-olive text-white transition-colors hover:bg-brand-olive-dark"
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <span className="text-xs text-muted-foreground">
                  0:00 / 0:00
                </span>
                <Volume2 size={14} className="ml-2 text-muted-foreground" />
              </div>

              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                  <Download size={13} /> 다운로드
                </button>
                <button className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                  무음제거
                </button>
                <button className="flex items-center gap-1.5 rounded-lg bg-brand-olive px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-olive-dark">
                  <Send size={13} /> 이미지/영상으로 전송
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── 작은 헬퍼 ─── */
function DropdownBtn({ label }: { label: string }) {
  return (
    <button className="flex items-center gap-1 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs text-foreground transition-colors hover:border-brand-olive-light">
      {label} <ChevronDown size={12} className="text-muted-foreground" />
    </button>
  );
}

function MiniInput({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <input
        defaultValue={value}
        className="h-7 w-12 rounded-md border border-border bg-white px-1.5 text-center text-xs outline-none focus:border-brand-olive"
      />
    </div>
  );
}
