"use client";

import { useState } from "react";
import {
  Copy,
  Upload,
  Download,
  Save,
  FileText,
  ArrowRight,
  LayoutGrid,
  List,
  Eye,
  Check,
} from "lucide-react";

/* ─── 더미 컷 ─── */
const dummyCuts = [
  { id: 1, text: "안녕하세요, 오늘은 호르무즈 해협에 대해 알아보겠습니다." },
  { id: 2, text: "호르무즈 해협은 세계 석유 수송의 핵심 관문입니다." },
  { id: 3, text: "이 좁은 수로를 통해 하루 약 2천만 배럴의 원유가 이동합니다." },
  { id: 4, text: "만약 이곳이 봉쇄된다면 전 세계 경제에 큰 충격이 올 것입니다." },
  { id: 5, text: "지금부터 그 이유를 자세히 살펴보겠습니다." },
  { id: 6, text: "호르무즈 해협의 지리적 위치를 먼저 확인해볼까요." },
];

const tags = ["이미지", "Grok", "Seedance", "8s", "Veo"];

type ViewMode = "preview" | "grid" | "list";

export default function StoryboardTab() {
  const [view, setView] = useState<ViewMode>("grid");
  const [selectAll, setSelectAll] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);

  const toggleSelect = (id: number) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const handleSelectAll = () => {
    if (selectAll) {
      setSelected([]);
    } else {
      setSelected(dummyCuts.map((c) => c.id));
    }
    setSelectAll(!selectAll);
  };

  return (
    <div className="space-y-4">
      {/* ── 툴바 ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white p-3 shadow-sm">
        <h3 className="mr-2 text-sm font-semibold text-foreground">
          스토리보드 ({dummyCuts.length}개)
        </h3>

        {/* 보기 방식 */}
        <div className="flex gap-0.5 rounded-md border border-border p-0.5">
          {([
            { key: "preview", icon: Eye },
            { key: "grid", icon: LayoutGrid },
            { key: "list", icon: List },
          ] as const).map(({ key, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`rounded-md p-1.5 transition-all ${
                view === key
                  ? "bg-brand-olive/10 text-brand-olive"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>

        {/* 전체 선택 */}
        <button
          onClick={handleSelectAll}
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          <div
            className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${
              selectAll
                ? "border-brand-olive bg-brand-olive text-white"
                : "border-border"
            }`}
          >
            {selectAll && <Check size={10} />}
          </div>
          전체 선택
        </button>

        {/* 액션 버튼들 */}
        <ToolBtn icon={Copy} label="프롬프트 복사" />
        <ToolBtn icon={Upload} label="일괄 업로드" />
        <ToolBtn icon={Save} label="저장" />
        <ToolBtn icon={FileText} label="대본 복사" />
        <ToolBtn icon={Download} label="다운로드" />

        <div className="ml-auto flex gap-2">
          <button className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600">
            이미지/영상 생성
          </button>
          <button className="flex items-center gap-1 rounded-lg bg-brand-olive px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-olive-dark">
            편집실로 이동 <ArrowRight size={12} />
          </button>
        </div>
      </div>

      {/* ── 컷 그리드 ── */}
      <div
        className={
          view === "list"
            ? "space-y-3"
            : "grid gap-4 grid-cols-3"
        }
      >
        {dummyCuts.map((cut) => {
          const isSelected = selected.includes(cut.id);

          if (view === "list") {
            return (
              <div
                key={cut.id}
                className={`flex items-center gap-4 rounded-xl border bg-white p-4 shadow-sm transition-all ${
                  isSelected ? "border-brand-pink" : "border-border"
                }`}
              >
                <button
                  onClick={() => toggleSelect(cut.id)}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${
                    isSelected
                      ? "border-brand-olive bg-brand-olive text-white"
                      : "border-border"
                  }`}
                >
                  {isSelected && <Check size={10} />}
                </button>
                <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-[10px] text-muted-foreground">
                  #{cut.id}
                </div>
                <p className="min-w-0 flex-1 text-xs text-foreground">
                  {cut.text}
                </p>
                <div className="flex shrink-0 gap-1">
                  {tags.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="rounded bg-brand-cream px-1.5 py-0.5 text-[9px] text-muted-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            );
          }

          return (
            <div
              key={cut.id}
              className={`group overflow-hidden rounded-xl border bg-white shadow-sm transition-all ${
                isSelected ? "border-brand-pink" : "border-border"
              }`}
            >
              {/* 이미지 영역 */}
              <div
                onClick={() => toggleSelect(cut.id)}
                className="relative flex h-36 cursor-pointer flex-col items-center justify-center bg-gray-50 transition-colors group-hover:bg-gray-100"
              >
                <Upload
                  size={20}
                  className="mb-1 text-muted-foreground/40"
                />
                <span className="text-[10px] text-muted-foreground">
                  클릭하여 업로드
                </span>
                {/* 선택 체크 */}
                <div
                  className={`absolute left-2 top-2 flex h-4 w-4 items-center justify-center rounded-sm border ${
                    isSelected
                      ? "border-brand-olive bg-brand-olive text-white"
                      : "border-gray-300 bg-white/80"
                  }`}
                >
                  {isSelected && <Check size={10} />}
                </div>
              </div>

              {/* 정보 */}
              <div className="p-3">
                <div className="mb-1.5 flex flex-wrap items-center gap-1">
                  <span className="rounded bg-brand-olive/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-olive">
                    #{cut.id}
                  </span>
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-brand-cream px-1.5 py-0.5 text-[9px] text-muted-foreground"
                    >
                      {t}
                    </span>
                  ))}
                  <button className="ml-auto text-[10px] text-brand-olive hover:underline">
                    상세보기
                  </button>
                </div>
                <p className="line-clamp-2 text-[11px] leading-relaxed text-foreground">
                  {cut.text}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ToolBtn({ icon: Icon, label }: { icon: typeof Copy; label: string }) {
  return (
    <button className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground">
      <Icon size={12} />
      {label}
    </button>
  );
}
