"use client";

import { useState } from "react";

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

export default function RemakeTab() {
  const [targetTime, setTargetTime] = useState("original");
  const [versionCount, setVersionCount] = useState("3");

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-foreground">
          🔄 리메이크 프리셋
        </h3>

        <div className="mb-5 space-y-4">
          <FilterRow label="목표 시간">
            <div className="flex gap-1">
              {targetTimes.map((t) => (
                <Chip
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
                <Chip
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
              <span className="text-xs text-muted-foreground">{p.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
        active
          ? "bg-brand-olive text-white"
          : "bg-brand-cream text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
