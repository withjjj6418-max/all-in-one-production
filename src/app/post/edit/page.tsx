"use client";

import { useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Scissors,
  Type,
  Volume2,
  ZoomIn,
  ZoomOut,
  Undo2,
  Redo2,
  Download,
  Save,
  Layers,
  Image,
  Music,
  MonitorPlay,
  ArrowLeft,
} from "lucide-react";
import EditLibrary from "./EditLibrary";

/* ─── 더미 타임라인 클립 ─── */
const videoClips = [
  { id: 1, label: "컷 1", start: 0, width: "15%" },
  { id: 2, label: "컷 2", start: 15, width: "12%" },
  { id: 3, label: "컷 3", start: 27, width: "18%" },
  { id: 4, label: "컷 4", start: 45, width: "10%" },
  { id: 5, label: "컷 5", start: 55, width: "14%" },
  { id: 6, label: "컷 6", start: 69, width: "16%" },
];

const tools = [
  { icon: Scissors, label: "자르기" },
  { icon: Type, label: "자막" },
  { icon: Volume2, label: "오디오" },
  { icon: Layers, label: "전환" },
];

export default function EditPage() {
  const [selectedEdit, setSelectedEdit] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [activeTool, setActiveTool] = useState("자르기");
  const [activeTrack, setActiveTrack] = useState<"video" | "audio" | "subtitle">("video");

  if (!selectedEdit) {
    return <EditLibrary onSelect={setSelectedEdit} />;
  }

  return (
    <div className="flex h-[calc(100vh-60px)] -m-8 flex-col bg-white">
      {/* ── 상단 툴바 ── */}
      <div className="flex items-center justify-between border-b border-border bg-white px-4 py-2">
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setSelectedEdit(null)}
            className="mr-2 rounded-md p-1.5 text-muted-foreground hover:bg-brand-cream hover:text-foreground transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <h2 className="mr-3 text-sm font-bold text-foreground">🎬 {selectedEdit.title}</h2>
          <div className="mx-2 h-5 w-px bg-border" />
          <button className="rounded-md p-1.5 text-muted-foreground hover:bg-brand-cream hover:text-foreground">
            <Undo2 size={16} />
          </button>
          <button className="rounded-md p-1.5 text-muted-foreground hover:bg-brand-cream hover:text-foreground">
            <Redo2 size={16} />
          </button>
          <div className="mx-2 h-5 w-px bg-border" />
          {tools.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.label}
                onClick={() => setActiveTool(t.label)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                  activeTool === t.label
                    ? "bg-brand-olive/10 text-brand-olive"
                    : "text-muted-foreground hover:bg-brand-cream hover:text-foreground"
                }`}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <Save size={13} /> 저장
          </button>
          <button className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <Download size={13} /> 내보내기
          </button>
          <button className="rounded-lg bg-brand-olive px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-olive-dark">
            최종 렌더링
          </button>
        </div>
      </div>

      {/* ── 메인 영역 ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* 프리뷰 + 속성 패널 */}
        <div className="flex flex-1 flex-col">
          {/* 비디오 프리뷰 */}
          <div className="flex flex-1 items-center justify-center bg-[#1a1a2e]">
            <div className="flex aspect-video w-[70%] max-w-2xl items-center justify-center rounded-lg bg-black/50">
              <div className="text-center">
                <MonitorPlay size={40} className="mx-auto mb-2 text-white/20" />
                <p className="text-xs text-white/30">프리뷰</p>
              </div>
            </div>
          </div>

          {/* 재생 컨트롤 */}
          <div className="flex items-center justify-center gap-4 border-t border-border bg-white py-2.5">
            <span className="w-16 text-right text-xs text-muted-foreground">00:00</span>
            <button className="text-muted-foreground hover:text-foreground">
              <SkipBack size={16} />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-olive text-white hover:bg-brand-olive-dark"
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button className="text-muted-foreground hover:text-foreground">
              <SkipForward size={16} />
            </button>
            <span className="w-16 text-xs text-muted-foreground">02:45</span>
            <div className="mx-2 h-5 w-px bg-border" />
            <div className="flex items-center gap-1">
              <button onClick={() => setZoom(Math.max(50, zoom - 10))} className="text-muted-foreground hover:text-foreground">
                <ZoomOut size={14} />
              </button>
              <span className="w-10 text-center text-[10px] text-muted-foreground">{zoom}%</span>
              <button onClick={() => setZoom(Math.min(200, zoom + 10))} className="text-muted-foreground hover:text-foreground">
                <ZoomIn size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* 오른쪽 속성 패널 */}
        <div className="w-64 shrink-0 overflow-y-auto border-l border-border bg-white p-4">
          <h3 className="mb-3 text-xs font-semibold text-foreground">속성</h3>
          <div className="space-y-3">
            <PropField label="시작" value="00:00" />
            <PropField label="종료" value="00:12" />
            <PropField label="지속시간" value="12초" />
            <div className="border-t border-border pt-3">
              <span className="text-[10px] font-medium text-muted-foreground">효과</span>
              <div className="mt-2 flex flex-wrap gap-1">
                {["페이드 인", "페이드 아웃", "디졸브", "컷"].map((e) => (
                  <button
                    key={e}
                    className="rounded-md bg-brand-cream px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t border-border pt-3">
              <span className="text-[10px] font-medium text-muted-foreground">볼륨</span>
              <input
                type="range"
                min={0}
                max={100}
                defaultValue={80}
                className="mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-100 accent-brand-olive"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── 하단 타임라인 ── */}
      <div className="shrink-0 border-t border-border bg-[#f5f0e8]">
        {/* 트랙 선택 */}
        <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
          {([
            { key: "video", label: "영상", icon: Image },
            { key: "audio", label: "오디오", icon: Music },
            { key: "subtitle", label: "자막", icon: Type },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTrack(key)}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-all ${
                activeTrack === key
                  ? "bg-brand-olive/10 text-brand-olive"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={11} /> {label}
            </button>
          ))}
        </div>

        {/* 타임라인 트랙 */}
        <div className="relative h-20 overflow-x-auto px-3 py-2">
          {/* 비디오 트랙 */}
          <div className="mb-1.5 flex h-8 items-center gap-0.5">
            {videoClips.map((clip) => (
              <div
                key={clip.id}
                style={{ width: clip.width }}
                className="flex h-full cursor-pointer items-center justify-center rounded-md bg-brand-olive/20 text-[9px] font-medium text-brand-olive-dark transition-all hover:bg-brand-olive/30"
              >
                {clip.label}
              </div>
            ))}
          </div>
          {/* 오디오 트랙 */}
          <div className="mb-1.5 flex h-6 items-center">
            <div className="flex h-full w-[85%] items-center rounded-md bg-brand-pink/20 px-2 text-[9px] font-medium text-brand-pink-dark">
              나레이션.mp3
            </div>
          </div>
          {/* 자막 트랙 */}
          <div className="flex h-5 items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex h-full items-center rounded bg-purple-100 px-1.5 text-[8px] text-purple-600"
                style={{ width: `${12 + Math.random() * 8}%` }}
              >
                자막 {i}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PropField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <input
        defaultValue={value}
        className="h-6 w-20 rounded-md border border-border bg-brand-cream/50 px-2 text-right text-[11px] outline-none focus:border-brand-olive"
      />
    </div>
  );
}
