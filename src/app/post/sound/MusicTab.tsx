"use client";

import { useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronDown,
  ChevronUp,
  Star,
  Music,
} from "lucide-react";

/* ─── 데이터 ─── */
const sunoModels = ["V5", "V4.5+", "V4.5", "V4"];

const genreGroups = [
  ["팝 & 재밍", "일렉트로닉 & 댄스", "힙합 & 랩", "밥 & 컨템포러리"],
  ["재즈 & 블루스", "포크 & 월드", "클래식 & 오케스트라", "사운드트랙 & BGM"],
  ["보컬 & 합창", "실험 & 아방가르드"],
];

const durations = ["30초", "1분", "2분", "3분", "4분"];

export default function MusicTab() {
  const [subTab, setSubTab] = useState<"gen" | "lyrics" | "tools">("gen");
  const [model, setModel] = useState("V5");
  const [scriptOpen, setScriptOpen] = useState(false);
  const [trackType, setTrackType] = useState<"bgm" | "vocal">("bgm");
  const [duration, setDuration] = useState("1분");
  const [genreOpen, setGenreOpen] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [bpm, setBpm] = useState(120);
  const [libTab, setLibTab] = useState<"all" | "fav">("all");
  const [isPlaying, setIsPlaying] = useState(false);

  const toggleGenre = (g: string) =>
    setSelectedGenres((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g],
    );

  return (
    <div className="flex gap-4">
      {/* ── 왼쪽: 뮤직 스튜디오 ── */}
      <div className="min-w-0 flex-1 space-y-4">
        <div className="rounded-xl border border-border bg-white shadow-sm">
          {/* 헤더 */}
          <div className="border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold text-foreground">
              🎵 뮤직 스튜디오 (SUNO)
            </h3>
          </div>

          {/* 서브탭 */}
          <div className="flex gap-1 border-b border-border px-5 py-2">
            {(
              [
                { key: "gen", label: "음악 생성" },
                { key: "lyrics", label: "가사 생성" },
                { key: "tools", label: "도구" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setSubTab(t.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  subTab === t.key
                    ? "bg-brand-olive text-white"
                    : "text-muted-foreground hover:bg-brand-cream"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="space-y-4 p-5">
            {/* SUNO 모델 */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                SUNO 모델
              </label>
              <div className="flex gap-1">
                {sunoModels.map((m) => (
                  <button
                    key={m}
                    onClick={() => setModel(m)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                      model === m
                        ? "bg-brand-olive text-white"
                        : "bg-brand-cream text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* AI 대본 분석 토글 */}
            <button
              onClick={() => setScriptOpen(!scriptOpen)}
              className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-brand-cream/50"
            >
              <span>📄 AI 대본 분석</span>
              {scriptOpen ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </button>
            {scriptOpen && (
              <div className="rounded-lg border border-border bg-brand-cream/30 p-3 text-xs text-muted-foreground">
                대본이 연결되면 AI가 분위기를 분석하여 음악을 추천합니다.
              </div>
            )}

            {/* 트랙 제목 */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                트랙 제목
              </label>
              <input
                placeholder="트랙 제목을 입력하세요"
                className="h-9 w-full rounded-lg border border-border bg-brand-cream/50 px-3 text-sm outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
              />
            </div>

            {/* 음악 설명/가사 */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                음악 설명 / 가사
              </label>
              <textarea
                rows={3}
                placeholder="원하는 분위기나 가사를 입력하세요"
                className="w-full resize-none rounded-lg border border-border bg-brand-cream/50 px-3 py-2 text-sm outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
              />
            </div>

            {/* 타입 + 길이 */}
            <div className="flex gap-6">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                  타입
                </label>
                <div className="flex gap-1">
                  {(["bgm", "vocal"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTrackType(t)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                        trackType === t
                          ? "bg-brand-olive text-white"
                          : "bg-brand-cream text-muted-foreground"
                      }`}
                    >
                      {t === "bgm" ? "BGM" : "보컬"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                  길이
                </label>
                <div className="flex gap-1">
                  {durations.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDuration(d)}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                        duration === d
                          ? "bg-brand-olive text-white"
                          : "bg-brand-cream text-muted-foreground"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 장르 */}
            <div>
              <button
                onClick={() => setGenreOpen(!genreOpen)}
                className="flex w-full items-center justify-between text-[11px] font-medium text-muted-foreground"
              >
                <span>
                  장르{" "}
                  {selectedGenres.length > 0 &&
                    `(${selectedGenres.length}개 선택)`}
                </span>
                {genreOpen ? (
                  <ChevronUp size={12} />
                ) : (
                  <ChevronDown size={12} />
                )}
              </button>
              {genreOpen && (
                <div className="mt-2 space-y-2">
                  {genreGroups.map((row, i) => (
                    <div key={i} className="flex flex-wrap gap-1.5">
                      {row.map((g) => (
                        <button
                          key={g}
                          onClick={() => toggleGenre(g)}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                            selectedGenres.includes(g)
                              ? "bg-brand-pink/20 text-brand-pink-dark ring-1 ring-brand-pink/40"
                              : "bg-brand-cream text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* BPM */}
            <div>
              <label className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                <span>BPM</span>
                <span className="text-brand-olive">{bpm}</span>
              </label>
              <input
                type="range"
                min={60}
                max={200}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-brand-cream accent-brand-olive"
              />
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>60</span>
                <span>200</span>
              </div>
            </div>

            {/* 생성 버튼 */}
            <button className="w-full rounded-xl bg-brand-pink py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-pink-dark">
              🎵 음악 생성
            </button>
          </div>
        </div>
      </div>

      {/* ── 오른쪽: 플레이어 + 라이브러리 ── */}
      <div className="w-72 shrink-0 space-y-4">
        {/* 플레이어 */}
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="mb-4 flex h-32 flex-col items-center justify-center rounded-lg bg-brand-cream/60">
            <Music size={28} className="text-muted-foreground/40" />
            <p className="mt-2 text-xs text-muted-foreground">
              재생 중인 트랙 없음
            </p>
          </div>
          <div className="flex items-center justify-center gap-4">
            <button className="text-muted-foreground hover:text-foreground">
              <SkipBack size={18} />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-olive text-white hover:bg-brand-olive-dark"
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button className="text-muted-foreground hover:text-foreground">
              <SkipForward size={18} />
            </button>
          </div>
        </div>

        {/* 라이브러리 */}
        <div className="rounded-xl border border-border bg-white shadow-sm">
          <div className="flex gap-1 border-b border-border p-2">
            <button
              onClick={() => setLibTab("all")}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
                libTab === "all"
                  ? "bg-brand-olive text-white"
                  : "text-muted-foreground hover:bg-brand-cream"
              }`}
            >
              전체
            </button>
            <button
              onClick={() => setLibTab("fav")}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
                libTab === "fav"
                  ? "bg-brand-olive text-white"
                  : "text-muted-foreground hover:bg-brand-cream"
              }`}
            >
              <Star size={12} className="mr-1 inline" />
              즐겨찾기
            </button>
          </div>
          <div className="flex h-40 items-center justify-center">
            <p className="text-xs text-muted-foreground">
              생성된 음악이 없습니다
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
