"use client";

import { useState } from "react";
import {
  Upload,
  MonitorPlay,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  CalendarDays,
  Globe,
  Tags,
  FileText,
  Image,
  Eye,
  Send,
} from "lucide-react";

/* ─── 더미 업로드 대기 영상 ─── */
const uploadQueue = [
  { id: 1, title: "호르무즈 해협의 비밀", status: "ready" as const, duration: "10:24", thumbnail: "bg-amber-100" },
  { id: 2, title: "임시 프로젝트 03/22", status: "draft" as const, duration: "0:45", thumbnail: "bg-sky-100" },
];

const statusConfig = {
  ready: { label: "업로드 준비", color: "text-brand-olive", bg: "bg-brand-olive/10", icon: CheckCircle2 },
  draft: { label: "초안", color: "text-muted-foreground", bg: "bg-muted", icon: Clock },
  uploading: { label: "업로드 중", color: "text-blue-600", bg: "bg-blue-50", icon: Upload },
  done: { label: "완료", color: "text-green-600", bg: "bg-green-50", icon: CheckCircle2 },
  error: { label: "오류", color: "text-red-600", bg: "bg-red-50", icon: AlertCircle },
};

const visibilityOptions = ["공개", "일부 공개", "비공개"];
const categoryOptions = ["교육", "엔터테인먼트", "뉴스/정치", "과학기술", "게임", "음악"];

export default function UploadPage() {
  const [selectedVideo, setSelectedVideo] = useState(1);
  const [visibility, setVisibility] = useState("공개");
  const [visOpen, setVisOpen] = useState(false);
  const [category, setCategory] = useState("교육");
  const [catOpen, setCatOpen] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [platform, setPlatform] = useState<"youtube" | "shorts">("youtube");

  const activeVideo = uploadQueue.find((v) => v.id === selectedVideo);

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          📤 업로드 매니저
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          완성된 영상을 YouTube에 업로드하고 메타데이터를 관리합니다
        </p>
      </div>

      <div className="flex gap-5">
        {/* ── 왼쪽: 영상 목록 ── */}
        <div className="w-72 shrink-0 space-y-3">
          <Card>
            <h3 className="mb-3 text-xs font-semibold text-foreground">업로드 대기</h3>
            <div className="space-y-2">
              {uploadQueue.map((v) => {
                const s = statusConfig[v.status];
                const Icon = s.icon;
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVideo(v.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all ${
                      selectedVideo === v.id
                        ? "border-brand-pink bg-brand-pink/5"
                        : "border-border hover:shadow-sm"
                    }`}
                  >
                    <div className={`flex h-12 w-16 shrink-0 items-center justify-center rounded-md ${v.thumbnail}`}>
                      <FileText size={16} className="text-muted-foreground/40" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-foreground">{v.title}</p>
                      <p className="text-[10px] text-muted-foreground">{v.duration}</p>
                      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-medium ${s.bg} ${s.color}`}>
                        <Icon size={10} /> {s.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <button className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border py-3 text-xs font-medium text-muted-foreground hover:border-brand-olive/40 hover:text-foreground">
              <Upload size={14} /> 영상 추가
            </button>
          </Card>

          {/* 플랫폼 선택 */}
          <Card>
            <h3 className="mb-2 text-xs font-semibold text-foreground">플랫폼</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setPlatform("youtube")}
                className={`flex flex-1 flex-col items-center gap-1.5 rounded-lg border p-3 transition-all ${
                  platform === "youtube"
                    ? "border-brand-olive bg-brand-olive/5"
                    : "border-border hover:shadow-sm"
                }`}
              >
                <MonitorPlay size={20} className={platform === "youtube" ? "text-red-500" : "text-muted-foreground"} />
                <span className="text-[10px] font-medium text-foreground">YouTube</span>
              </button>
              <button
                onClick={() => setPlatform("shorts")}
                className={`flex flex-1 flex-col items-center gap-1.5 rounded-lg border p-3 transition-all ${
                  platform === "shorts"
                    ? "border-brand-olive bg-brand-olive/5"
                    : "border-border hover:shadow-sm"
                }`}
              >
                <MonitorPlay size={20} className={platform === "shorts" ? "text-red-500" : "text-muted-foreground"} />
                <span className="text-[10px] font-medium text-foreground">Shorts</span>
              </button>
            </div>
          </Card>
        </div>

        {/* ── 오른쪽: 메타데이터 편집 ── */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* 썸네일 + 제목 */}
          <Card>
            <div className="flex gap-4">
              <div className={`flex h-36 w-60 shrink-0 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border ${activeVideo?.thumbnail || "bg-gray-100"} transition-colors hover:border-brand-olive/40`}>
                <Image size={24} className="mb-1 text-muted-foreground/40" />
                <span className="text-[10px] text-muted-foreground">썸네일 업로드</span>
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">제목</label>
                  <input
                    defaultValue={activeVideo?.title}
                    className="h-9 w-full rounded-lg border border-border bg-brand-cream/50 px-3 text-sm outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">설명</label>
                  <textarea
                    rows={3}
                    placeholder="영상 설명을 입력하세요"
                    className="w-full resize-none rounded-lg border border-border bg-brand-cream/50 px-3 py-2 text-sm outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* 태그 */}
          <Card>
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Tags size={12} /> 태그
            </label>
            <input
              placeholder="쉼표로 구분하여 태그 입력 (예: 호르무즈, 석유, 경제)"
              className="h-9 w-full rounded-lg border border-border bg-brand-cream/50 px-3 text-sm outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">최대 500자까지 입력 가능</p>
          </Card>

          {/* 공개 설정 + 카테고리 */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Eye size={12} /> 공개 설정
              </label>
              <div className="relative">
                <button
                  onClick={() => setVisOpen(!visOpen)}
                  className="flex h-9 w-full items-center justify-between rounded-lg border border-border bg-white px-3 text-sm hover:border-brand-olive-light"
                >
                  {visibility}
                  <ChevronDown size={14} className="text-muted-foreground" />
                </button>
                {visOpen && (
                  <div className="absolute top-full z-10 mt-1 w-full rounded-lg border border-border bg-white py-1 shadow-lg">
                    {visibilityOptions.map((v) => (
                      <button key={v} onClick={() => { setVisibility(v); setVisOpen(false); }}
                        className={`w-full px-3 py-1.5 text-left text-sm hover:bg-brand-cream ${visibility === v ? "font-medium text-brand-olive" : ""}`}
                      >{v}</button>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Globe size={12} /> 카테고리
              </label>
              <div className="relative">
                <button
                  onClick={() => setCatOpen(!catOpen)}
                  className="flex h-9 w-full items-center justify-between rounded-lg border border-border bg-white px-3 text-sm hover:border-brand-olive-light"
                >
                  {category}
                  <ChevronDown size={14} className="text-muted-foreground" />
                </button>
                {catOpen && (
                  <div className="absolute top-full z-10 mt-1 w-full rounded-lg border border-border bg-white py-1 shadow-lg">
                    {categoryOptions.map((c) => (
                      <button key={c} onClick={() => { setCategory(c); setCatOpen(false); }}
                        className={`w-full px-3 py-1.5 text-left text-sm hover:bg-brand-cream ${category === c ? "font-medium text-brand-olive" : ""}`}
                      >{c}</button>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* 예약 업로드 */}
          <Card>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <CalendarDays size={12} /> 예약 업로드
              </label>
              <button
                onClick={() => setScheduleEnabled(!scheduleEnabled)}
                className={`relative h-6 w-11 rounded-full transition-colors ${scheduleEnabled ? "bg-brand-olive" : "bg-gray-200"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${scheduleEnabled ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </div>
            {scheduleEnabled && (
              <div className="mt-3 flex gap-3">
                <input type="date" className="h-9 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-brand-olive" />
                <input type="time" className="h-9 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-brand-olive" />
              </div>
            )}
          </Card>

          {/* 업로드 버튼 */}
          <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-pink py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-pink-dark">
            <Send size={16} />
            YouTube에 업로드
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-white p-4 shadow-sm">{children}</div>;
}
