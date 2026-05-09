"use client";

import { useState } from "react";
import StyleTab from "./StyleTab";
import StoryboardTab from "./StoryboardTab";
import RemakeTab from "./RemakeTab";

type Tab = "style" | "storyboard" | "remake";

const tabs: { key: Tab; label: string; emoji: string }[] = [
  { key: "style", label: "스타일 선택", emoji: "🎨" },
  { key: "storyboard", label: "스토리보드", emoji: "🎬" },
  { key: "remake", label: "영상 리메이크", emoji: "🔄" },
];

export default function ImagePage() {
  const [activeTab, setActiveTab] = useState<Tab>("style");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          🖼️ 이미지/영상
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          대본 기반 장면 분석, 이미지 및 영상 생성을 관리합니다
        </p>
      </div>

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

      {activeTab === "style" && <StyleTab />}
      {activeTab === "storyboard" && <StoryboardTab />}
      {activeTab === "remake" && <RemakeTab />}
    </div>
  );
}
