/* eslint-disable @next/next/no-img-element */
"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileVideo,
  Film,
  ImageIcon,
  Link2,
  Loader2,
  Plus,
  ScanSearch,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";

// helper_server.mjs는 의도적으로 IPv4 loopback에만 바인딩한다.
// `localhost`를 사용하면 이전 IPv6 도우미가 함께 실행 중일 때 잘못 연결될 수 있다.
const HELPER_URL = "http://127.0.0.1:8787";

type SearchLink = {
  platform: string;
  label: string;
  url: string;
};

type AnalysisResult = {
  jobId: string;
  title: string;
  uploader: string | null;
  uploadDate: string | null;
  duration: number;
  platform: string;
  sourceUrl: string | null;
  representativeFrameUrls: string[];
  contactSheetUrl: string;
  searchLinks: SearchLink[];
  clipboard: boolean;
};

type Candidate = {
  id: string;
  url: string;
  platform: string;
  title: string;
  uploader: string | null;
  publishedAt: string;
  duration: number | null;
  thumbnail: string | null;
  status: "pending" | "resolved" | "manual" | "error";
  error?: string;
  reason?: string;
  confidence?: number;
  frameIndexes?: number[];
  originalType?: string;
  grounded?: boolean;
  visualMatch?: number;
  videoMatch?: number;
};

type SearchSummary = {
  discovered: number;
  compared: number;
  passed: number;
  bestScore: number;
  bestSimilarity: number;
  visionConfigured: boolean;
  visionSucceeded: boolean;
  visionPageMatches: number;
  visionCandidateMatches: number;
  visionError?: string;
};

function platformFromUrl(url: string) {
  const value = url.toLowerCase();
  if (value.includes("youtube.com") || value.includes("youtu.be")) return "youtube";
  if (value.includes("tiktok.com")) return "tiktok";
  if (value.includes("instagram.com")) return "instagram";
  if (value.includes("xiaohongshu.com") || value.includes("xhslink.com")) return "xiaohongshu";
  return "web";
}

function platformLabel(platform: string) {
  return ({ youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", xiaohongshu: "샤오홍슈", facebook: "Facebook", vimeo: "Vimeo", lens: "Lens", file: "파일", web: "Web" } as Record<string, string>)[platform] || "Unknown";
}

function platformClasses(platform: string) {
  return ({
    youtube: "bg-red-50 text-red-600 border-red-100",
    tiktok: "bg-slate-900 text-white border-slate-900",
    instagram: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100",
    xiaohongshu: "bg-rose-50 text-rose-700 border-rose-100",
    web: "bg-blue-50 text-blue-700 border-blue-100",
  } as Record<string, string>)[platform] || "bg-gray-50 text-gray-600 border-gray-100";
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "—";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.round(seconds % 60).toString().padStart(2, "0")}`;
}

export default function SourceFinderPage() {
  const [helperOnline, setHelperOnline] = useState<boolean | null>(null);
  const [inputMode, setInputMode] = useState<"url" | "file">("url");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [candidateUrl, setCandidateUrl] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searchSummary, setSearchSummary] = useState<SearchSummary | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const checkHelper = async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1800);
    try {
      const response = await fetch(`${HELPER_URL}/health`, { signal: controller.signal });
      const health = await response.json();
      setHelperOnline(response.ok && health.version >= 2 && health.capabilities?.includes("candidate-video-verification"));
    } catch {
      setHelperOnline(false);
    } finally {
      window.clearTimeout(timeout);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => void checkHelper(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const earliestCandidate = useMemo(() => candidates
    .filter((candidate) => /^\d{4}-\d{2}-\d{2}$/.test(candidate.publishedAt)
      && ((candidate.videoMatch || 0) >= 55 || (candidate.visualMatch || 0) >= 60))
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))[0] || null, [candidates]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setVideoFile(file);
  };

  const analyze = async () => {
    if (isAnalyzing || (inputMode === "url" ? !videoUrl.trim() : !videoFile)) return;
    setIsAnalyzing(true);
    setAnalysis(null);
    setCandidates([]);
    setSearchSummary(null);
    setMessage("영상을 가져오고 대표 프레임을 추출하고 있습니다. 영상 길이에 따라 시간이 걸릴 수 있어요.");

    try {
      const response = inputMode === "url"
        ? await fetch(`${HELPER_URL}/investigate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: videoUrl.trim(), openFolder: false }),
          })
        : await fetch(`${HELPER_URL}/investigate-file`, {
            method: "POST",
            headers: { "Content-Type": videoFile?.type || "application/octet-stream", "X-File-Name": encodeURIComponent(videoFile?.name || "video.mp4") },
            body: videoFile,
          });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "영상 분석에 실패했습니다.");
      setAnalysis(result);
      setHelperOnline(true);
      await discoverSources(result);
    } catch (error) {
      // 다운로드·플랫폼 오류를 도우미 연결 끊김으로 잘못 표시하지 않는다.
      void checkHelper();
      setMessage(error instanceof Error ? error.message : "로컬 도우미와 통신하지 못했습니다.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const discoverSources = async (result: AnalysisResult) => {
    setIsDiscovering(true);
    setMessage("대표 프레임별 시각 단서를 분석하고, 한국 재편집본을 제외한 해외 원본 후보를 자동 검색하고 있습니다.");
    try {
      const response = await fetch("/api/source-finder/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: result.jobId,
          inputUrl: result.sourceUrl,
          inputTitle: result.title,
          inputUploader: result.uploader,
          inputUploadDate: result.uploadDate,
        }),
      });
      const discovery = await response.json();
      if (!response.ok || !discovery.success) {
        throw new Error(discovery.error || "자동 원본 탐색에 실패했습니다.");
      }

      let discovered: Candidate[] = discovery.candidates.map((candidate: {
        url: string;
        platform: string;
        title: string;
        reason: string;
        confidence: number;
        frameIndexes: number[];
        originalType: string;
        grounded: boolean;
        uploader?: string | null;
        publishedAt?: string | null;
        thumbnail?: string | null;
        visualMatch?: number;
      }) => ({
        id: crypto.randomUUID(),
        url: candidate.url,
        platform: candidate.platform,
        title: candidate.title,
        uploader: candidate.uploader || null,
        publishedAt: candidate.publishedAt || "",
        duration: null,
        thumbnail: candidate.thumbnail || null,
        status: candidate.publishedAt ? "resolved" as const : "pending" as const,
        reason: candidate.reason,
        confidence: candidate.confidence,
        frameIndexes: candidate.frameIndexes,
        originalType: candidate.originalType,
        grounded: candidate.grounded,
        visualMatch: candidate.visualMatch,
      }));

      const visionSummary = {
        visionConfigured: Boolean(discovery.vision?.configured),
        visionSucceeded: Boolean(discovery.vision?.succeeded),
        visionPageMatches: Number(discovery.vision?.pageMatches) || 0,
        visionCandidateMatches: Number(discovery.vision?.candidateMatches) || 0,
        visionError: discovery.vision?.error ? String(discovery.vision.error) : undefined,
      };
      setSearchSummary({ discovered: discovered.length, compared: 0, passed: 0, bestScore: 0, bestSimilarity: 0, ...visionSummary });

      if (discovered.length > 0) {
        setMessage(`후보 ${Math.min(discovered.length, 12)}개 영상을 직접 가져와 입력 영상과 프레임 단위로 검증하고 있습니다. 잠시 기다려 주세요.`);
        const verificationResponse = await fetch(`${HELPER_URL}/verify-candidates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: result.jobId, urls: discovered.map((candidate) => candidate.url) }),
        });
        const verification = await verificationResponse.json();
        if (!verificationResponse.ok || !verification.ok) {
          throw new Error(verification.error || "후보 영상 프레임 검증에 실패했습니다. 로컬 도우미를 재시작해 주세요.");
        }
        const verifiedByUrl = new Map<string, { ok: boolean; score: number; matchedFrames: number; bestSimilarity: number }>(
          verification.results.map((item: { url: string; ok: boolean; score: number; matchedFrames: number; bestSimilarity: number }) => [item.url, item]),
        );
        const successful = verification.results.filter((item: { ok: boolean }) => item.ok);
        const passed = successful.filter((item: { score: number }) => item.score >= 55);
        setSearchSummary({
          discovered: discovered.length,
          compared: successful.length,
          passed: passed.length,
          bestScore: Math.max(0, ...successful.map((item: { score: number }) => item.score)),
          bestSimilarity: Math.max(0, ...successful.map((item: { bestSimilarity: number }) => item.bestSimilarity)),
          ...visionSummary,
        });
        discovered = discovered.map((candidate) => {
          const verified = verifiedByUrl.get(candidate.url);
          if (!verified?.ok) return { ...candidate, videoMatch: 0 };
          const groundedVisualMatch = candidate.originalType === "grounded_visual_source"
            && verified.score >= 35
            && verified.bestSimilarity >= 76;
          const verifiedScore = groundedVisualMatch ? Math.max(65, verified.score) : verified.score;
          return {
            ...candidate,
            videoMatch: verifiedScore,
            confidence: verifiedScore,
            reason: groundedVisualMatch
              ? `Google 검색 근거와 프레임 최고 유사도 ${verified.bestSimilarity}%가 함께 확인되어 원본 후보로 통과했습니다. ${candidate.reason || ""}`
              : `후보 영상 전체를 직접 비교한 결과 ${verified.matchedFrames}개 프레임이 일치했습니다(최고 유사도 ${verified.bestSimilarity}%). ${candidate.reason || ""}`,
          };
        }).filter((candidate) => (candidate.videoMatch || 0) >= 55)
          .sort((a, b) => (b.videoMatch || 0) - (a.videoMatch || 0));
      }

      setCandidates(discovered);
      setMessage(discovered.length > 0
        ? `YouTube·Instagram·TikTok·샤오홍슈 후보를 실제 영상과 대조해 일치한 원본 후보 ${discovered.length}개만 남겼습니다.`
        : "후보는 검색했지만 실제 영상과 일치하는 원본을 찾지 못했습니다. 엉뚱한 링크는 결과에서 제거했습니다.");
    } catch (error) {
      setCandidates([]);
      setMessage(error instanceof Error ? error.message : "자동 원본 탐색에 실패했습니다.");
    } finally {
      setIsDiscovering(false);
    }
  };

  const addCandidate = () => {
    const url = candidateUrl.trim();
    if (!url || candidates.some((candidate) => candidate.url === url)) return;
    setCandidates((current) => [...current, {
      id: crypto.randomUUID(),
      url,
      platform: platformFromUrl(url),
      title: "메타데이터 확인 전",
      uploader: null,
      publishedAt: "",
      duration: null,
      thumbnail: null,
      status: "pending",
    }]);
    setCandidateUrl("");
  };

  const compareCandidates = async () => {
    if (isComparing || candidates.length === 0) return;
    setIsComparing(true);
    setMessage("후보 게시물의 제목과 게시일을 확인하고 있습니다.");
    try {
      const response = await fetch(`${HELPER_URL}/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: candidates.map((candidate) => candidate.url) }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "후보 비교에 실패했습니다.");

      setCandidates((current) => current.map((candidate, index) => {
        const resolved = result.candidates[index];
        if (!resolved?.ok) {
          return { ...candidate, status: "error", error: resolved?.error || "메타데이터를 읽지 못했습니다." };
        }
        return {
          ...candidate,
          url: resolved.url || candidate.url,
          platform: resolved.platform || candidate.platform,
          title: resolved.title || candidate.title,
          uploader: resolved.uploader,
          publishedAt: resolved.publishedAt || candidate.publishedAt,
          duration: resolved.duration,
          thumbnail: resolved.thumbnail,
          status: resolved.publishedAt ? "resolved" : "manual",
          error: resolved.publishedAt ? undefined : "게시일을 자동 확인하지 못했습니다. 직접 입력해 주세요.",
        };
      }));
      setMessage("후보 비교가 끝났습니다. 게시일을 확인하지 못한 항목은 날짜를 직접 입력할 수 있습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "후보 비교에 실패했습니다.");
    } finally {
      setIsComparing(false);
    }
  };

  const updateCandidateDate = (id: string, publishedAt: string) => {
    setCandidates((current) => current.map((candidate) => candidate.id === id
      ? { ...candidate, publishedAt, status: candidate.status === "resolved" ? "resolved" : "manual" }
      : candidate));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-brand-olive">
            <ScanSearch size={15} /> Cross-platform source finder
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">영상 원본 찾기</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            영상을 장면별로 분석하고 YouTube·Instagram·TikTok·샤오홍슈 후보를 직접 대조해 실제로 일치하는 원본 링크만 찾습니다.
          </p>
        </div>
        <button onClick={checkHelper} className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-xs font-semibold ${helperOnline ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
          {helperOnline === null ? <Loader2 size={13} className="animate-spin" /> : helperOnline ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          {helperOnline === null ? "도우미 확인 중" : helperOnline ? "로컬 도우미 연결됨" : "로컬 도우미 실행 필요"}
        </button>
      </header>

      {helperOnline === false && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 shrink-0" size={18} />
          <div>
            <p className="font-bold">먼저 로컬 도우미를 실행해 주세요.</p>
            <p className="mt-1 text-xs leading-5 text-amber-800"><code className="rounded bg-white/70 px-1.5 py-0.5">npm run source-finder</code>를 별도 터미널에서 실행한 뒤 상태 버튼을 눌러주세요.</p>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-olive text-sm font-bold text-white">1</span>
            <div><h2 className="font-bold">분석할 영상 선택</h2><p className="text-xs text-muted-foreground">URL 또는 소유·분석 권한이 있는 영상 파일을 입력하세요.</p></div>
          </div>
        </div>
        <div className="space-y-4 p-5 sm:p-6">
          <div className="inline-flex rounded-lg bg-muted p-1">
            <button onClick={() => setInputMode("url")} className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition ${inputMode === "url" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"}`}><Link2 size={15} /> URL</button>
            <button onClick={() => setInputMode("file")} className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition ${inputMode === "file" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"}`}><Upload size={15} /> 파일</button>
          </div>

          {inputMode === "url" ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1"><Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} /><input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} onKeyDown={(event) => event.key === "Enter" && analyze()} placeholder="YouTube, TikTok, Instagram, 샤오홍슈 또는 기타 영상 URL" className="h-12 w-full rounded-xl border border-input bg-white pl-10 pr-4 text-sm outline-none transition focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/10" /></div>
              <button onClick={analyze} disabled={!videoUrl.trim() || isAnalyzing || !helperOnline} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-olive px-6 text-sm font-bold text-white shadow-sm transition hover:bg-brand-olive-dark disabled:cursor-not-allowed disabled:opacity-40">{isAnalyzing ? <Loader2 size={17} className="animate-spin" /> : <ScanSearch size={17} />}{isAnalyzing ? "분석 중" : "분석 시작"}</button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="flex min-h-24 flex-1 cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed border-input bg-brand-cream/40 px-5 transition hover:border-brand-olive/50">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-brand-olive shadow-sm"><FileVideo size={21} /></span>
                <span className="min-w-0"><span className="block truncate text-sm font-bold">{videoFile?.name || "영상 파일을 선택하세요"}</span><span className="mt-1 block text-xs text-muted-foreground">MP4, MOV, WebM · 최대 1GB</span></span>
                <input type="file" accept="video/*" onChange={handleFileChange} className="hidden" />
              </label>
              <button onClick={analyze} disabled={!videoFile || isAnalyzing || !helperOnline} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-olive px-6 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-32">{isAnalyzing ? <Loader2 size={17} className="animate-spin" /> : <ScanSearch size={17} />}{isAnalyzing ? "분석 중" : "분석 시작"}</button>
            </div>
          )}
        </div>
      </section>

      {message && <div className="flex items-start gap-2 rounded-xl border border-brand-olive/15 bg-brand-cream px-4 py-3 text-sm text-foreground"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-brand-olive" /><span>{message}</span></div>}

      {analysis && (
        <>
          <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-olive text-sm font-bold text-white">2</span><div><h2 className="font-bold">대표 프레임과 검색 단서</h2><p className="text-xs text-muted-foreground">서로 다른 장면을 검색하면 후보 발견률이 높아집니다.</p></div></div>
              <div className="flex flex-wrap gap-2 text-xs"><span className={`rounded-full border px-2.5 py-1 font-bold ${platformClasses(analysis.platform)}`}>{platformLabel(analysis.platform)}</span><span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">{formatDuration(analysis.duration)}</span>{analysis.uploadDate && <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">{analysis.uploadDate}</span>}</div>
            </div>
            <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.2fr_.8fr]">
              <div>
                <div className="mb-3"><h3 className="line-clamp-2 font-bold">{analysis.title}</h3><p className="mt-1 text-xs text-muted-foreground">{analysis.uploader || "업로더 정보 없음"}</p></div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{analysis.representativeFrameUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="group relative aspect-video overflow-hidden rounded-lg bg-muted"><img src={url} alt={`대표 프레임 ${index + 1}`} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /><span className="absolute bottom-1.5 left-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white">FRAME {index + 1}</span></a>)}</div>
                <a href={analysis.contactSheetUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-olive hover:underline"><ImageIcon size={13} /> 전체 콘택트 시트 보기 <ExternalLink size={11} /></a>
              </div>
              <div className="rounded-xl border border-brand-olive/20 bg-brand-cream/50 p-4"><h3 className="mb-4 flex items-center gap-2 text-sm font-bold"><ScanSearch size={15} className="text-brand-olive" /> 원본 후보 자동 탐색</h3><div className="space-y-3 text-xs"><div className="flex gap-3"><span className="font-bold text-brand-olive">01</span><span>프레임별 워터마크·인물·장소·사건 분석</span></div><div className="flex gap-3"><span className="font-bold text-brand-olive">02</span><span>YouTube·Instagram·TikTok·샤오홍슈 자동 검색</span></div><div className="flex gap-3"><span className="font-bold text-brand-olive">03</span><span>현재 한국 재편집본과 한국어 재업로드 제외</span></div><div className="flex gap-3"><span className="font-bold text-brand-olive">04</span><span>후보 영상 전체를 다운로드해 연속 프레임 대조</span></div></div><div className="mt-4 flex items-center gap-2 rounded-lg bg-white px-3 py-2.5 text-xs font-semibold text-brand-olive">{isDiscovering ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}{isDiscovering ? "자동으로 후보를 찾고 검증하는 중입니다" : "사용자 입력 없이 자동 탐색 완료"}</div></div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
            <div className="border-b border-border px-5 py-4 sm:px-6"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-olive text-sm font-bold text-white">3</span><div><h2 className="font-bold">자동으로 찾은 원본 영상 후보</h2><p className="text-xs text-muted-foreground">현재 한국 재편집본은 제외하고, 각 장면의 해외 원출처를 자동 탐색합니다.</p></div></div></div>
            <div className="space-y-4 p-5 sm:p-6">
              {isDiscovering ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-brand-olive/20 bg-brand-cream/50 py-12 text-center"><Loader2 size={28} className="mb-3 animate-spin text-brand-olive" /><p className="text-sm font-bold">장면별 원출처를 검색하고 있습니다.</p><p className="mt-1 text-xs text-muted-foreground">워터마크·인물·장소·자막을 분석해 해외 원본 링크를 찾는 중입니다.</p></div>
              ) : candidates.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-4 py-10 text-center"><Film size={28} className="mb-2 text-muted-foreground/40" /><p className="text-sm font-semibold text-muted-foreground">일치가 확인된 원본 후보가 없습니다.</p>{searchSummary && <><div className="mt-3 flex flex-wrap justify-center gap-2 text-[11px]"><span className="rounded-full bg-muted px-2.5 py-1">검색 후보 {searchSummary.discovered}개</span><span className="rounded-full bg-muted px-2.5 py-1">영상 비교 {searchSummary.compared}개</span><span className="rounded-full bg-muted px-2.5 py-1">통과 {searchSummary.passed}개</span><span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">최고 점수 {searchSummary.bestScore}%</span><span className={`rounded-full px-2.5 py-1 ${searchSummary.visionSucceeded ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{searchSummary.visionSucceeded ? `Vision 플랫폼 후보 ${searchSummary.visionCandidateMatches}개` : "Vision 연결 안 됨"}</span></div>{searchSummary.visionError && <p className="mt-3 max-w-xl text-xs leading-5 text-red-600">Google Vision: {searchSummary.visionError}</p>}</>}<p className="mt-3 max-w-xl text-xs leading-5 text-muted-foreground">Google Vision의 동일 장면 검색과 플랫폼 검색을 모두 수행했지만, 전체 영상 검증을 통과한 링크가 없었습니다.</p></div>
              ) : (
                <div className="space-y-2">{candidates.map((candidate) => {
                  const isEarliest = earliestCandidate?.id === candidate.id;
                  return <div key={candidate.id} className={`rounded-xl border p-3 transition ${isEarliest ? "border-brand-olive bg-brand-cream/60 ring-1 ring-brand-olive/10" : "border-border"}`}>
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 shrink-0 rounded border px-2 py-1 text-[10px] font-bold ${platformClasses(candidate.platform)}`}>{platformLabel(candidate.platform)}</span>
                      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><a href={candidate.url} target="_blank" rel="noreferrer" className="max-w-full truncate text-sm font-bold hover:text-brand-olive hover:underline">{candidate.title}</a>{typeof candidate.videoMatch === "number" && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">영상 일치 {candidate.videoMatch}%</span>}{isEarliest && <span className="rounded-full bg-brand-olive px-2 py-0.5 text-[10px] font-bold text-white">가장 이른 후보</span>}</div><p className="mt-1 truncate text-[11px] text-muted-foreground">{candidate.uploader || candidate.url}</p>{candidate.reason && <p className="mt-2 text-xs leading-5 text-foreground/70">{candidate.reason}</p>}{candidate.frameIndexes && candidate.frameIndexes.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{candidate.frameIndexes.map((frame) => <span key={frame} className="rounded bg-brand-cream px-1.5 py-0.5 text-[10px] font-semibold text-brand-olive">FRAME {frame}</span>)}</div>}{candidate.error && <p className="mt-1 text-[11px] text-amber-700">{candidate.error}</p>}</div>
                      <div className="flex shrink-0 items-center gap-2"><label className="relative"><CalendarDays size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="date" value={candidate.publishedAt} onChange={(event) => updateCandidateDate(candidate.id, event.target.value)} className="h-8 rounded-lg border border-input pl-7 pr-1 text-xs outline-none focus:border-brand-olive" /></label><button onClick={() => setCandidates((current) => current.filter((item) => item.id !== candidate.id))} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-500" aria-label="후보 삭제"><Trash2 size={14} /></button></div>
                    </div>
                  </div>;
                })}</div>
              )}

              {candidates.length > 0 && <button onClick={compareCandidates} disabled={isComparing} className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-white py-2.5 text-xs font-bold text-muted-foreground transition hover:border-brand-olive/40 hover:text-brand-olive disabled:opacity-50">{isComparing ? <Loader2 size={15} className="animate-spin" /> : <CalendarDays size={15} />}{isComparing ? "게시일 확인 중" : "후보 게시일 다시 확인"}</button>}

              <details className="rounded-xl border border-dashed border-border bg-muted/20 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">자동 검색에 빠진 후보가 있을 때만 직접 추가</summary>
                <div className="mt-3 flex gap-2"><input value={candidateUrl} onChange={(event) => setCandidateUrl(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addCandidate()} placeholder="선택 사항: 후보 URL" className="h-10 min-w-0 flex-1 rounded-lg border border-input px-3 text-xs outline-none focus:border-brand-olive" /><button onClick={addCandidate} disabled={!candidateUrl.trim()} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-olive/25 bg-white px-3 text-xs font-bold text-brand-olive disabled:opacity-40"><Plus size={14} /> 추가</button></div>
              </details>
            </div>
          </section>

          {earliestCandidate && (
            <section className="overflow-hidden rounded-2xl border border-brand-olive/30 bg-brand-olive text-white shadow-sm">
              <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-white/65">Earliest discovered candidate</p><h2 className="mt-2 text-xl font-bold">현재 확인 가능한 가장 이른 게시물</h2><p className="mt-2 text-sm text-white/80">{earliestCandidate.publishedAt} · {platformLabel(earliestCandidate.platform)} · {earliestCandidate.uploader || "업로더 미확인"}</p><p className="mt-3 max-w-2xl text-xs leading-5 text-white/60">삭제되거나 비공개인 게시물은 확인할 수 없으므로 절대적인 최초 원본 판정이 아니라, 입력한 후보 중 가장 이른 공개 게시물입니다.</p></div><a href={earliestCandidate.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-brand-olive shadow-sm">게시물 열기 <ChevronRight size={16} /></a></div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
