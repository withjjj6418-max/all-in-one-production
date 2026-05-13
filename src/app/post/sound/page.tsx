"use client";

import { useState } from "react";
import NarrationTab from "./NarrationTab";
import MusicTab from "./MusicTab";
import SoundLibraryTab from "./SoundLibraryTab";

type MainTab = "narration" | "music" | "sfx" | "library";

const tabs: { key: MainTab; label: string; emoji: string }[] = [
  { key: "narration", label: "나레이션", emoji: "🎤" },
  { key: "music", label: "음악 생성", emoji: "🎵" },
  { key: "sfx", label: "효과음", emoji: "🔊" },
  { key: "library", label: "사운드 보관함", emoji: "📂" },
];

export default function SoundStudioPage() {
  const [activeTab, setActiveTab] = useState<MainTab>("narration");

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          🎵 사운드 스튜디오
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          나레이션 음성 생성과 AI 음악 제작을 관리합니다
        </p>
      </div>

      {/* 탭 바 */}
      <div className="flex gap-1 rounded-xl border border-border bg-white p-1.5 shadow-sm">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
              activeTab === t.key
                ? "bg-brand-olive text-white shadow-sm"
                : "text-muted-foreground hover:bg-brand-cream hover:text-foreground"
            }`}
          >
            <span className="mr-1.5">{t.emoji}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* 콘텐츠 */}
      {activeTab === "narration" && <NarrationTab />}
      {activeTab === "music" && <MusicTab />}
      {activeTab === "library" && <SoundLibraryTab />}
      {activeTab === "sfx" && (
        <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-white shadow-sm">
          <p className="text-sm text-muted-foreground">준비 중입니다</p>
        </div>
      )}
    </div>
  );
}

