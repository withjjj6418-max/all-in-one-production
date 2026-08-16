"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight, Baby, Check, ChevronRight, Clock3, FileVideo2, FolderKanban, FolderOpen,
  Eye, Loader2, PackageCheck, PauseCircle, Play, Plus, RefreshCw, Save, Scissors,
  ShieldCheck, Sparkles, Trash2, WandSparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { productionTypes } from "@/lib/project-workflows";

const HELPER = "http://localhost:8787";
type LibraryFile = { name: string; path: string; rankingReference: boolean; duration: number | null; width: number | null; height: number | null; size: number; modifiedAt: string };
type Project = { id: number; title: string; status: string | null; updated_at: string | null };
type Config = {
  project_id: number; project_code: string; reference_source_id: number | null; reference_path: string | null;
  korean_title: string; japanese_title: string; japanese_title_translation: string; target_duration: number; segment_count: number; status: string;
};
type ReviewState = "pending" | "selected" | "deferred" | "deleted";
type SourceDownloadState = "downloading" | "downloaded" | "failed";
type DiscoveryVideo = {
  videoId: string; url: string; title: string; channelName: string; publishedAt: string; ageDays: number; viewCount: number;
  viewsPerHour: number; durationSeconds: number; thumbnailUrl: string; qualified: boolean; referenceChannel: boolean; reason: string; score: number;
};
type SourceMatch = { url: string; title: string; platform: string; confidence: number; visualMatch?: number; publishedAt?: string | null; reason: string; thumbnail?: string | null; matchStartSeconds?: number; verificationStatus?: "verified" | "visual_evidence" | "unverified" };
type PlanningEntry = { index: number; korean_label: string; japanese_label: string; japanese_korean: string; material: string; emotion: string; cause: string; korean_rank: number | null; japanese_rank: number | null };
type PlanningResult = {
  concept: string; overall_emotion: string; entries: PlanningEntry[]; scene_copies?: Record<string, SceneCopy>;
  package_meta?: { signature: string; project_root: string; generated_at: string };
};
type TitleCandidates = { korean: string[]; japanese: Array<{ japanese: string; korean: string }> };
type LocalAnalysis = { index: number; jobId: string; description: string; ocr: string[]; watermarks: string[]; language: string; queries: string[] };
type SceneCopy = { japaneseDescription: string; koreanSuggestions: Array<{ korean: string; tone: string }>; suggestions: Array<{ japanese: string; korean: string; tone: string }> };
type Candidate = {
  id?: string; sourceTitle: string; sourceUrl: string; localPath: string; sourceKind: "reference_split" | "library" | "original_found";
  referencePath?: string;
  referenceRank: number | null; clipStart: number; clipEnd: number | null; koreanLabel: string; japaneseLabel: string;
  koreanRank: number | null; japaneseRank: number | null; flipKorean: boolean; flipJapanese: boolean;
  subtitleStrategy: "auto" | "crop" | "blur" | "keep"; safetyStatus: string; notes: string;
  material?: string; emotion?: string; viralCause?: string; japaneseTranslation?: string;
};

const initialConfig: Omit<Config, "project_id"> = {
  project_code: "0001-grandpa-dad-slap",
  reference_source_id: null,
  reference_path: "",
  korean_title: "가족 반응 랭킹 TOP5",
  japanese_title: "どれが1番好き？｜家族のバズった5選",
  japanese_title_translation: "어느 것이 가장 좋아?｜화제가 된 가족 장면 5선",
  target_duration: 35,
  segment_count: 5,
  status: "기획 중",
};

function formatDuration(value: number | null) {
  if (!value) return "길이 미확인";
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDate(value: string | null) {
  if (!value) return "최근 수정 기록 없음";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function familyStageInfo(staged: number, ranked: number, hasTitle: boolean) {
  if (hasTitle) return { label: "템플릿·Premiere 준비 완료", progress: 100 };
  if (ranked >= 5) return { label: "제목 추천 대기", progress: 75 };
  if (staged >= 5) return { label: "순위·문구 편집 중", progress: 55 };
  if (staged > 0) return { label: "원본 편집·추적 중", progress: 35 };
  return { label: "발굴·후보 준비 중", progress: 10 };
}

function youtubeVideoId(value: string) {
  return value.match(/(?:youtube\.com\/(?:shorts\/|watch\?v=)|youtu\.be\/)([\w-]{11})/i)?.[1] || "";
}

function titleSimilarity(left: string, right: string) {
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/-ra\b|\.[a-z0-9]+$/gi, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const makeTokens = (value: string) => {
    const normalized = normalize(value);
    const words = normalized.split(/\s+/).filter(Boolean);
    const compact = normalized.replace(/\s/g, "");
    const pairs = Array.from({ length: Math.max(0, compact.length - 1) }, (_, index) => compact.slice(index, index + 2));
    return new Set([...words, ...pairs]);
  };
  const leftTokens = makeTokens(left);
  const rightTokens = makeTokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const containsBoost = normalize(left).includes(normalize(right)) || normalize(right).includes(normalize(left)) ? 0.35 : 0;
  return Math.min(1, intersection / Math.max(1, union) + containsBoost);
}

function rankingRepostPenalty(title: string) {
  return /(ranking|ranked|top\s*\d+|compilation|랭킹|순위|ランキング|まとめ)/iu.test(title) ? 18 : 0;
}

function defaultCandidate(file: LibraryFile, index: number): Candidate {
  const koreanRank = index < 5 ? 5 - index : null;
  return {
    sourceTitle: file.name.replace(/\.[^.]+$/, ""), sourceUrl: "", localPath: file.path, sourceKind: "library",
    referenceRank: null, clipStart: 0, clipEnd: file.duration, koreanLabel: `후보${index + 1}`.slice(0, 6),
    japaneseLabel: `候補${index + 1}`, koreanRank, japaneseRank: koreanRank ? 6 - koreanRank : null,
    flipKorean: index === 1 || index === 3, flipJapanese: index === 0 || index === 4,
    subtitleStrategy: "auto", safetyStatus: "검수 필요", notes: "",
  };
}

function deriveReferencePath(localPath: string, index: number, referenceRank: number | null) {
  if (!referenceRank) return localPath;
  const directory = localPath.match(/^(.*[\\/]01-candidates)[\\/]/i)?.[1];
  if (!directory) return localPath;
  const separator = directory.includes("\\") ? "\\" : "/";
  return `${directory}${separator}candidate-${String(index + 1).padStart(2, "0")}-rank${referenceRank}.mp4`;
}

function serializeSceneCopies(copies: Record<number, SceneCopy>, candidateList: Candidate[]) {
  return Object.fromEntries(Object.entries(copies).map(([rawIndex, copy]) => {
    const index = Number(rawIndex);
    const referenceRank = candidateList[index]?.referenceRank;
    return [referenceRank ? `reference:${referenceRank}` : `index:${index}`, copy];
  }));
}

function restoreSceneCopies(stored: Record<string, SceneCopy> | undefined, candidateList: Candidate[]) {
  if (!stored) return {};
  return Object.fromEntries(candidateList.flatMap((candidate, index) => {
    const copy = (candidate.referenceRank ? stored[`reference:${candidate.referenceRank}`] : undefined)
      || stored[`index:${index}`]
      || stored[String(index)];
    return copy ? [[index, copy] as const] : [];
  }));
}

function createPackageSignature(config: Omit<Config, "project_id"> | Config, candidateList: Candidate[]) {
  return JSON.stringify({
    packageFormatVersion: 2,
    projectCode: config.project_code,
    koreanTitle: config.korean_title,
    japaneseTitle: config.japanese_title,
    targetDuration: config.target_duration,
    candidates: candidateList.map((candidate) => ({
      sourceTitle: candidate.sourceTitle, localPath: candidate.localPath, clipStart: candidate.clipStart, clipEnd: candidate.clipEnd,
      koreanLabel: candidate.koreanLabel, japaneseLabel: candidate.japaneseLabel, koreanRank: candidate.koreanRank,
      japaneseRank: candidate.japaneseRank, flipKorean: candidate.flipKorean, flipJapanese: candidate.flipJapanese,
      subtitleStrategy: candidate.subtitleStrategy,
    })),
  });
}

function ShortsFamilyWorkspace() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedStage = searchParams.get("stage") || "discover";
  const [library, setLibrary] = useState<LibraryFile[]>([]);
  const [recommendationLibrary, setRecommendationLibrary] = useState<LibraryFile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(() => {
    const fromUrl = searchParams.get("project_id");
    return fromUrl ? Number(fromUrl) : null;
  });
  const [config, setConfig] = useState<Omit<Config, "project_id"> | Config>(initialConfig);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [helperOnline, setHelperOnline] = useState(false);
  const [databaseReady, setDatabaseReady] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [discoveryVideos, setDiscoveryVideos] = useState<DiscoveryVideo[]>([]);
  const [sourceMatches, setSourceMatches] = useState<Record<number, SourceMatch[]>>({});
  const [sourceReview, setSourceReview] = useState<Record<string, ReviewState>>({});
  const [sourceDownloadState, setSourceDownloadState] = useState<Record<string, SourceDownloadState>>({});
  const [discoveryReview, setDiscoveryReview] = useState<Record<string, ReviewState>>({});
  const [viewedUrls, setViewedUrls] = useState<Record<string, boolean>>({});
  const [lastViewedUrl, setLastViewedUrl] = useState("");
  const [downloadedPaths, setDownloadedPaths] = useState<Record<number, string>>({});
  const [matchTitles, setMatchTitles] = useState<Record<string, string>>({});
  const [traceProgress, setTraceProgress] = useState<{ step: number; label: string } | null>(null);
  const [sceneCopies, setSceneCopies] = useState<Record<number, SceneCopy>>({});
  const [planning, setPlanning] = useState<PlanningResult | null>(null);
  const [titleSuggestions, setTitleSuggestions] = useState<TitleCandidates | null>(null);
  const [titleDirection, setTitleDirection] = useState("");
  const [referenceUrlInput, setReferenceUrlInput] = useState(() => searchParams.get("reference_url") || "");
  const [referenceTitleInput, setReferenceTitleInput] = useState(() => searchParams.get("reference_title") || "");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryTargetIndex, setLibraryTargetIndex] = useState<number | null>(null);
  const [selectedLibraryPath, setSelectedLibraryPath] = useState("");
  const [previewLibraryPath, setPreviewLibraryPath] = useState("");
  const [libraryRefreshing, setLibraryRefreshing] = useState(false);
  const [localVision, setLocalVision] = useState({ online: false, modelReady: false, model: "gemma4:e2b-it-qat" });
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveBusyRef = useRef(false);
  const autoSavePendingRef = useRef(false);

  const recommendedLibrary = useMemo(() => recommendationLibrary.map((file) => ({
    ...file, recommendationScore: libraryQuery ? titleSimilarity(file.name, libraryQuery) : 0,
  })).filter((file) => !libraryQuery || file.name.toLocaleLowerCase().includes(libraryQuery.toLocaleLowerCase()) || file.recommendationScore > 0)
    .sort((left, right) => right.recommendationScore - left.recommendationScore || right.modifiedAt.localeCompare(left.modifiedAt)), [recommendationLibrary, libraryQuery]);
  const previewLibraryFile = useMemo(() => recommendationLibrary.find((file) => file.path === previewLibraryPath), [recommendationLibrary, previewLibraryPath]);
  const stagedCandidateIndexes = useMemo(() => candidates.map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.sourceKind !== "reference_split" && /[\\/]01-candidates[\\/]/i.test(candidate.localPath)), [candidates]);
  const confirmedRankCount = useMemo(() => [1, 2, 3, 4, 5]
    .filter((rank) => stagedCandidateIndexes.some(({ candidate }) => candidate.referenceRank === rank)).length, [stagedCandidateIndexes]);
  const downloadsReady = confirmedRankCount === 5;
  const rankedCandidates = useMemo(() => [1, 2, 3, 4, 5]
    .map((rank) => candidates.find((candidate) => candidate.sourceKind !== "reference_split" && candidate.koreanRank === rank && /[\\/]01-candidates[\\/]/i.test(candidate.localPath)))
    .filter((candidate): candidate is Candidate => Boolean(candidate)), [candidates]);
  const rankingComplete = rankedCandidates.length === 5;
  const currentPackageSignature = useMemo(() => createPackageSignature(config, candidates), [config, candidates]);
  const packageMeta = planning?.package_meta;
  const packageSaved = Boolean(packageMeta && packageMeta.signature === currentPackageSignature);
  const packageStale = Boolean(packageMeta && packageMeta.signature !== currentPackageSignature);

  const callHelper = useCallback(async <T,>(path: string, options?: RequestInit): Promise<T> => {
    const response = await fetch(`${HELPER}${path}`, options);
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "로컬 도우미 요청에 실패했습니다.");
    return payload as T;
  }, []);

  const refreshRecommendationLibrary = useCallback(async () => {
    setLibraryRefreshing(true);
    try {
      const payload = await callHelper<{ files: LibraryFile[] }>("/shorts-family/recommendation-library");
      setRecommendationLibrary(payload.files);
    } catch {
      setHelperOnline(false);
    } finally {
      setLibraryRefreshing(false);
    }
  }, [callHelper]);

  const refreshLibrary = useCallback(async () => {
    try {
      const health = await fetch(`${HELPER}/health`);
      setHelperOnline(health.ok);
      if (!health.ok) return;
      const [referencePayload, recommendationPayload] = await Promise.all([
        callHelper<{ files: LibraryFile[] }>("/shorts-family/library"),
        callHelper<{ files: LibraryFile[] }>("/shorts-family/recommendation-library"),
      ]);
      setLibrary(referencePayload.files);
      setRecommendationLibrary(recommendationPayload.files);
      const vision = await callHelper<{ online: boolean; modelReady: boolean; model: string }>("/shorts-family/local-vision-status");
      setLocalVision(vision);
    } catch {
      setHelperOnline(false);
    }
  }, [callHelper]);

  const loadBaseData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const projectRes = await supabase.from("projects").select("id, title, status, updated_at").eq("production_type", productionTypes.shortsHaejja).order("updated_at", { ascending: false });
    setProjects((projectRes.data ?? []) as Project[]);
    if (!projectId && projectRes.data?.[0]) setProjectId(Number(projectRes.data[0].id));
  }, [projectId, supabase]);

  useEffect(() => {
    // 외부 로컬 도우미와 Supabase의 현재 상태를 최초 진입 시 동기화한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshLibrary();
    loadBaseData();
  }, [refreshLibrary, loadBaseData]);

  useEffect(() => {
    // 프로젝트가 정해지면 새로고침·즐겨찾기에도 이어지도록 URL에 project_id를 반영한다.
    if (!projectId) return;
    const current = new URLSearchParams(searchParams.toString());
    if (current.get("project_id") === String(projectId)) return;
    current.set("project_id", String(projectId));
    router.replace(`${pathname}?${current.toString()}`, { scroll: false });
    if (typeof window !== "undefined") window.localStorage.setItem("last-shorts-family-project-id", String(projectId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    (async () => {
      const [configRes, candidatesRes] = await Promise.all([
        supabase.from("shorts_family_configs").select("*").eq("project_id", projectId).maybeSingle(),
        supabase.from("shorts_family_candidates").select("*").eq("project_id", projectId).order("created_at"),
      ]);
      if (!active) return;
      if (configRes.error && configRes.error.code !== "PGRST116") {
        setDatabaseReady(false);
        return;
      }
      setDatabaseReady(true);
      const loadedCandidates = (candidatesRes.data ?? []).map((row, index) => ({
        id: row.id, sourceTitle: row.reference_rank ? `레퍼런스 ${row.reference_rank}위` : row.source_title, sourceUrl: row.source_url || "", localPath: row.local_path || "",
        sourceKind: row.source_kind, referenceRank: row.reference_rank,
        referencePath: row.source_kind === "reference_split" ? row.local_path || "" : deriveReferencePath(row.local_path || "", index, row.reference_rank),
        clipStart: Number(row.clip_start || 0),
        clipEnd: row.clip_end === null ? null : Number(row.clip_end), koreanLabel: row.korean_label,
        japaneseLabel: row.japanese_label, koreanRank: row.korean_rank, japaneseRank: row.korean_rank ? 6 - row.korean_rank : null,
        flipKorean: row.flip_korean, flipJapanese: row.flip_japanese, subtitleStrategy: row.subtitle_strategy,
        safetyStatus: row.safety_status, notes: row.notes,
        material: row.material || "", emotion: row.emotion || "", viralCause: row.viral_cause || "", japaneseTranslation: row.japanese_translation || "",
      })) as Candidate[];
      if (configRes.data) {
        const row = configRes.data;
        setConfig({
          project_id: row.project_id, project_code: row.project_code, reference_source_id: row.reference_source_id,
          reference_path: row.reference_path || "", korean_title: row.korean_title, japanese_title: row.japanese_title,
          japanese_title_translation: row.japanese_title_translation || "",
          target_duration: row.target_duration, segment_count: row.segment_count, status: row.status,
        });
        setDiscoveryVideos(Array.isArray(row.discovery_results) ? (row.discovery_results as DiscoveryVideo[]).slice(0, 20) : []);
        const persistedPlanning = row.planning_result && typeof row.planning_result === "object" ? row.planning_result as PlanningResult : null;
        setPlanning(persistedPlanning);
        setSceneCopies(restoreSceneCopies(persistedPlanning?.scene_copies, loadedCandidates));
        setDiscoveryReview(row.discovery_review && typeof row.discovery_review === "object" ? row.discovery_review as Record<string, ReviewState> : {});
        setSourceMatches(row.source_matches && typeof row.source_matches === "object" ? row.source_matches as Record<number, SourceMatch[]> : {});
        setSourceReview(row.source_review && typeof row.source_review === "object" ? row.source_review as Record<string, ReviewState> : {});
        setDownloadedPaths(row.downloaded_paths && typeof row.downloaded_paths === "object" ? row.downloaded_paths as Record<number, string> : {});
      } else {
        setPlanning(null);
        setSceneCopies({});
      }
      setCandidates(loadedCandidates);
    })();
    return () => { active = false; };
  }, [projectId, supabase]);

  async function createProject(): Promise<number | null> {
    setBusy("create"); setMessage("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인이 필요합니다.");
      const { error: readinessError } = await supabase.from("shorts_family_configs").select("project_id").limit(1);
      if (readinessError) {
        setDatabaseReady(false);
        throw new Error(`데이터베이스 마이그레이션을 먼저 적용해주세요: ${readinessError.message}`);
      }
      const nextNumber = Math.max(1, ...projects.map((project) => Number(project.title.match(/^(\d{4})/)?.[1] || 0) + 1));
      const code = nextNumber === 1 ? "0001-grandpa-dad-slap" : `${String(nextNumber).padStart(4, "0")}-family-ranking`;
      const { data: project, error } = await supabase.from("projects").insert({
        user_id: user.id, production_type: productionTypes.shortsHaejja, title: `${code} 가족 랭킹형쇼츠`,
        category: "가족", status: "소스 준비", progress: 10, memo: "한국·일본 동시 제작", updated_at: new Date().toISOString(),
      }).select("id, title, status, updated_at").single();
      if (error || !project) throw new Error(error?.message || "프로젝트를 만들지 못했습니다.");
      const values = { ...initialConfig, project_code: code, project_id: project.id, user_id: user.id };
      const { error: configError } = await supabase.from("shorts_family_configs").insert(values);
      if (configError) throw new Error(`마이그레이션을 먼저 적용해주세요: ${configError.message}`);
      setProjects((current) => [project as Project, ...current]);
      setProjectId(project.id);
      setConfig(values);
      setCandidates([]);
      setMessage("새 가족 랭킹형쇼츠 프로젝트를 만들었습니다.");
      return project.id;
    } catch (error) { setMessage(error instanceof Error ? error.message : "프로젝트 생성 실패"); return null; }
    finally { setBusy(null); }
  }

  async function discoverRankingShorts() {
    setBusy("discover"); setMessage("YouTube에서 조회수와 업로드 속도를 비교하고 있습니다. API 검색량에 따라 잠시 걸릴 수 있습니다.");
    try {
      const response = await fetch("/api/shorts-family/discover", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "레퍼런스 발굴에 실패했습니다.");
      setDiscoveryVideos((payload.videos || []).slice(0, 20));
      setDiscoveryReview({});
      if (!projectId) await createProject();
      setMessage(`기준을 통과하거나 관찰할 랭킹형쇼츠 ${payload.videos?.length || 0}개를 찾았습니다. 하나를 골라 -ra로 가져오세요.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "레퍼런스 발굴 실패"); }
    finally { setBusy(null); }
  }

  async function chooseDiscoveredReference(video: DiscoveryVideo) {
    setBusy(`reference-${video.videoId}`); setMessage("선택한 랭킹형쇼츠를 -ra 레퍼런스로 저장하고 있습니다.");
    try {
      const result = await callHelper<{ filename: string; path: string }>("/shorts-family/download", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: video.url, title: `ㄹ ${video.title}` }),
      });
      setConfig({ ...config, reference_path: result.path });
      setDiscoveryReview((current) => ({ ...current, [video.videoId]: "selected" }));
      setDownloadedPaths((current) => ({ ...current, [-1]: result.path }));
      await fetch("/api/shorts-family/hot-videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", videoId: video.videoId }) }).catch(() => undefined);
      await refreshLibrary();
      setMessage(`${result.filename}을 레퍼런스로 선택했습니다. 프로젝트 생성 후 자동 분리를 누르세요.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "레퍼런스 저장 실패"); }
    finally { setBusy(null); }
  }

  async function addReferenceFromUrl(url: string, title: string) {
    if (!url.trim()) return setMessage("영상 URL을 입력해주세요.");
    setBusy("reference-url"); setMessage("입력한 URL을 -ra 레퍼런스로 저장하고 있습니다.");
    try {
      const result = await callHelper<{ filename: string; path: string }>("/shorts-family/download", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim(), title: `ㄹ ${title.trim() || url.trim()}` }),
      });
      setConfig({ ...config, reference_path: result.path });
      setDownloadedPaths((current) => ({ ...current, [-1]: result.path }));
      const importedVideoId = youtubeVideoId(url);
      if (importedVideoId) await fetch("/api/shorts-family/hot-videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", videoId: importedVideoId }) }).catch(() => undefined);
      setReferenceUrlInput(""); setReferenceTitleInput("");
      await refreshLibrary();
      setMessage(`${result.filename}을 레퍼런스로 저장했습니다. 프로젝트 생성 후 자동 분리를 누르세요.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "URL 레퍼런스 저장 실패"); }
    finally { setBusy(null); }
  }

  async function addReferenceFromUpload(file: File) {
    setBusy("reference-upload"); setMessage("업로드한 영상을 -ra 레퍼런스로 저장하고 있습니다.");
    try {
      const response = await fetch(`${HELPER}/shorts-family/upload-reference`, {
        method: "POST",
        headers: { "X-File-Name": encodeURIComponent(file.name), "X-File-Title": encodeURIComponent(file.name.replace(/\.[^.]+$/, "")) },
        body: file,
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "업로드 레퍼런스 저장에 실패했습니다.");
      setConfig({ ...config, reference_path: result.path });
      setDownloadedPaths((current) => ({ ...current, [-1]: result.path }));
      await refreshLibrary();
      setMessage(`${result.filename}을 레퍼런스로 저장했습니다. 프로젝트 생성 후 자동 분리를 누르세요.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "업로드 레퍼런스 저장 실패"); }
    finally { setBusy(null); }
  }

  async function splitReference() {
    if (!projectId || !config.reference_path) return setMessage("프로젝트와 -ra 레퍼런스를 선택해주세요.");
    setBusy("split"); setMessage("장면 변화와 순위 간격을 분석하고 있습니다.");
    try {
      const result = await callHelper<{ candidates: Array<{ path: string; referenceRank: number; recommendedStart: number; recommendedEnd: number; duration: number }> }>("/shorts-family/split", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: config.reference_path, projectCode: config.project_code, segmentCount: config.segment_count }),
      });
      const next = result.candidates.map((item, index): Candidate => ({
        sourceTitle: `레퍼런스 ${item.referenceRank}위`, sourceUrl: "", localPath: item.path, sourceKind: "reference_split",
        referenceRank: item.referenceRank, referencePath: item.path, clipStart: 0, clipEnd: item.duration,
        koreanLabel: `장면${index + 1}`.slice(0, 6), japaneseLabel: `シーン${index + 1}`,
        koreanRank: index < 5 ? item.referenceRank : null, japaneseRank: index < 5 ? 6 - item.referenceRank : null,
        flipKorean: index === 1 || index === 3, flipJapanese: index === 0 || index === 4,
        subtitleStrategy: "auto", safetyStatus: "검수 필요", notes: `원본 ${item.recommendedStart.toFixed(2)}~${item.recommendedEnd.toFixed(2)}초에서 자동 분리`,
      }));
      setCandidates(next);
      setMessage(`${next.length}개 소스로 자동 분리했습니다. 시작·종료점과 기존 자막을 검수해주세요.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "분리 실패"); }
    finally { setBusy(null); }
  }

  function addLibraryCandidate(file: LibraryFile) {
    if (candidates.length >= 7) return setMessage("후보는 최대 7개입니다. 기존 후보를 제거한 뒤 추가해주세요.");
    if (candidates.some((candidate) => candidate.localPath === file.path)) return setMessage("이미 추가한 영상입니다.");
    setCandidates((current) => [...current, defaultCandidate(file, current.length)]);
  }

  function selectLibraryFile(file: LibraryFile) {
    setSelectedLibraryPath(file.path);
    setMessage(`보유 소스 선택: ${file.name} · 이제 추가하거나 교체할 후보를 선택하세요.`);
  }

  async function addSelectedLibraryCandidate() {
    const file = recommendationLibrary.find((item) => item.path === selectedLibraryPath);
    if (!file) return setMessage("먼저 보유 소스를 선택해주세요.");
    if (candidates.length >= 7) return setMessage("후보는 최대 7개입니다. 기존 후보를 제거하거나 교체해주세요.");
    if (candidates.some((candidate) => candidate.localPath === file.path)) return setMessage("이미 추가한 영상입니다.");
    setBusy("stage-library");
    try {
      const staged = await callHelper<{ path: string; filename: string; folder: string }>("/shorts-family/stage-candidate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectCode: config.project_code, filePath: file.path, title: file.name.replace(/\.[^.]+$/, ""), index: candidates.length + 1 }),
      });
      addLibraryCandidate({ ...file, path: staged.path, name: staged.filename });
      setSelectedLibraryPath("");
      setMessage(`보유 소스를 후보 폴더에 저장했습니다: ${staged.path}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "보유 소스 저장 실패"); }
    finally { setBusy(null); }
  }

  async function replaceWithSelectedLibrary() {
    const file = recommendationLibrary.find((item) => item.path === selectedLibraryPath);
    if (!file) return setMessage("먼저 보유 소스를 선택해주세요.");
    if (libraryTargetIndex === null || !candidates[libraryTargetIndex]) return setMessage("교체할 기존 후보를 선택해주세요.");
    const targetIndex = libraryTargetIndex;
    const previous = candidates[targetIndex];
    setBusy("stage-library");
    try {
      const staged = await callHelper<{ path: string; filename: string; folder: string }>("/shorts-family/stage-candidate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectCode: config.project_code, filePath: file.path, title: file.name.replace(/\.[^.]+$/, ""), index: targetIndex + 1 }),
      });
      updateCandidate(targetIndex, { localPath: staged.path, sourceUrl: "", sourceKind: "library", clipStart: 0,
        clipEnd: file.duration, notes: `${previous.sourceTitle} 원본 미발견으로 선택한 보유 소스로 교체` });
      setMessage(`${targetIndex + 1}번 후보를 저장하고 교체했습니다: ${staged.path}`);
      setSelectedLibraryPath("");
      setLibraryTargetIndex(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "보유 소스 교체 저장 실패"); }
    finally { setBusy(null); }
  }

  function updateCandidate(index: number, patch: Partial<Candidate>) {
    setCandidates((current) => current.map((candidate, candidateIndex) => {
      if (candidateIndex !== index) return candidate;
      const next = { ...candidate, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, "koreanRank")) next.japaneseRank = next.koreanRank ? 6 - next.koreanRank : null;
      if (Object.prototype.hasOwnProperty.call(patch, "japaneseRank")) next.koreanRank = next.japaneseRank ? 6 - next.japaneseRank : null;
      return next;
    }));
  }

  function assignRankSource(rank: number, sourceIndex: number | null) {
    setCandidates((current) => current.map((candidate, index) => {
      if (candidate.koreanRank === rank && index !== sourceIndex) return { ...candidate, koreanRank: null, japaneseRank: null };
      if (index === sourceIndex) return { ...candidate, koreanRank: rank, japaneseRank: 6 - rank };
      return candidate;
    }));
  }

  function markViewed(url: string) {
    setViewedUrls((current) => ({ ...current, [url]: true }));
    setLastViewedUrl(url);
  }

  function reviewSource(url: string, state: ReviewState) {
    setSourceReview((current) => ({ ...current, [url]: state }));
  }

  async function openContainingFolder(filePath: string) {
    try {
      await callHelper("/shorts-family/open-containing-folder", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: filePath }),
      });
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장 폴더 열기 실패"); }
  }

  async function requestSceneCopy(description: string): Promise<SceneCopy> {
    const response = await fetch("/api/shorts-family/scene-copy", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description }), signal: AbortSignal.timeout(60000),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.error || "한·일 제목 추천 생성 실패");
    return { japaneseDescription: payload.japaneseDescription, koreanSuggestions: payload.koreanSuggestions || [], suggestions: payload.suggestions || [] };
  }

  async function persistSceneCopyResults(planningSnapshot: PlanningResult | null, copies: Record<number, SceneCopy>, candidateSnapshot: Candidate[] = candidates) {
    if (!projectId) return;
    const persistedPlanning: PlanningResult = {
      ...(planningSnapshot || { concept: "", overall_emotion: "", entries: [] }),
      scene_copies: serializeSceneCopies(copies, candidateSnapshot),
    };
    const { error } = await supabase.from("shorts_family_configs").update({ planning_result: persistedPlanning, updated_at: new Date().toISOString() }).eq("project_id", projectId);
    if (error) throw error;
  }

  async function generateSceneCopy(index: number) {
    const candidate = candidates[index];
    if (!candidate) return;
    setBusy(`scene-copy-${index}`);
    try {
      let description = candidate.notes.trim();
      if (!description || /자동 분리|원본\s*\d/.test(description)) {
        setMessage(`${index + 1}번 장면을 로컬 AI가 읽고 상황 설명을 만들고 있습니다.`);
        const described = await callHelper<{ description: string }>("/shorts-family/describe-one", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidate }), signal: AbortSignal.timeout(180000),
        });
        description = described.description;
        updateCandidate(index, { notes: description });
      }
      setMessage(`${index + 1}번 한국어·일본어 쇼츠 제목 후보를 만들고 있습니다.`);
      const copy = await requestSceneCopy(description);
      const nextCopies = { ...sceneCopies, [index]: copy };
      setSceneCopies(nextCopies);
      await persistSceneCopyResults(planning, nextCopies);
      setMessage(`${index + 1}번 한국어·일본어 제목 후보를 각각 3개 만들었습니다.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "장면 설명 생성 실패"); }
    finally { setBusy(null); }
  }

  function candidateRow(candidate: Candidate, userId: string) {
    return {
      project_id: projectId, user_id: userId, source_title: candidate.sourceTitle, source_url: candidate.sourceUrl || null,
      local_path: candidate.localPath, source_kind: candidate.sourceKind, reference_rank: candidate.referenceRank,
      clip_start: candidate.clipStart, clip_end: candidate.clipEnd, korean_label: candidate.koreanLabel.replace(/\s/g, "").slice(0, 6),
      japanese_label: candidate.japaneseLabel, korean_rank: candidate.koreanRank, japanese_rank: candidate.japaneseRank,
      flip_korean: candidate.flipKorean, flip_japanese: candidate.flipJapanese,
      subtitle_strategy: candidate.subtitleStrategy, safety_status: candidate.safetyStatus, notes: candidate.notes,
      japanese_translation: candidate.japaneseTranslation || "", material: candidate.material || "", emotion: candidate.emotion || "", viral_cause: candidate.viralCause || "",
    };
  }

  async function saveCandidate(index: number): Promise<boolean> {
    const candidate = candidates[index];
    if (!projectId || !candidate) {
      setMessage("프로젝트를 먼저 만들어주세요.");
      return false;
    }
    setBusy(`save-candidate-${index}`); setMessage("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인이 필요합니다.");
      const row = candidateRow(candidate, user.id);
      if (candidate.id) {
        const { error } = await supabase.from("shorts_family_candidates").update(row).eq("id", candidate.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("shorts_family_candidates").insert(row).select("id").single();
        if (error) throw error;
        updateCandidate(index, { id: data.id });
      }
      setMessage(`${index + 1}번 후보를 저장했습니다.`);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "후보 저장 실패");
      return false;
    }
    finally { setBusy(null); }
  }

  async function persistAll() {
    if (!projectId) throw new Error("프로젝트를 먼저 만들어주세요.");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인이 필요합니다.");
      const configValues = {
        project_id: projectId, user_id: user.id, project_code: config.project_code,
        reference_source_id: config.reference_source_id || null, reference_path: config.reference_path || null,
        korean_title: config.korean_title, japanese_title: config.japanese_title,
        japanese_title_translation: config.japanese_title_translation, discovery_results: discoveryVideos,
        planning_result: planning ? { ...planning, scene_copies: serializeSceneCopies(sceneCopies, candidates) } : null,
        target_duration: config.target_duration, segment_count: config.segment_count, status: config.status,
        discovery_review: discoveryReview, source_matches: sourceMatches, source_review: sourceReview, downloaded_paths: downloadedPaths,
        updated_at: new Date().toISOString(),
      };
      const { error: configError } = await supabase.from("shorts_family_configs").upsert(configValues);
      if (configError) throw configError;
      const { error: deleteError } = await supabase.from("shorts_family_candidates").delete().eq("project_id", projectId);
      if (deleteError) throw deleteError;
      if (candidates.length) {
        const rows = candidates.map((candidate) => candidateRow(candidate, user.id));
        const { error } = await supabase.from("shorts_family_candidates").insert(rows);
        if (error) throw error;
      }
  }

  async function runAutoSave() {
    if (!projectId) return;
    if (autoSaveBusyRef.current) { autoSavePendingRef.current = true; return; }
    autoSaveBusyRef.current = true;
    setAutoSaveStatus("saving");
    try {
      await persistAll();
      setAutoSaveStatus("saved");
    } catch {
      setAutoSaveStatus("error");
    } finally {
      autoSaveBusyRef.current = false;
      if (autoSavePendingRef.current) { autoSavePendingRef.current = false; runAutoSave(); }
    }
  }

  useEffect(() => {
    // STEP1~3(발굴·분리·추적) 진행 상황이 새로고침·이탈에도 사라지지 않도록 변경 후 잠시 뒤 자동 저장한다.
    if (!projectId) return;
    const timer = setTimeout(() => { runAutoSave(); }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, candidates, discoveryVideos, discoveryReview, sourceMatches, sourceReview, downloadedPaths, config.reference_path, config.project_code, config.korean_title, config.japanese_title, config.japanese_title_translation, config.target_duration, config.segment_count, planning]);

  async function saveAll() {
    setBusy("save"); setMessage("");
    try {
      await persistAll();
      setMessage(`프로젝트 설정과 후보 ${candidates.length}개를 저장했습니다.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장 실패"); }
    finally { setBusy(null); }
  }

  async function buildPackage() {
    if (!projectId) return setMessage("프로젝트를 먼저 만들어주세요.");
    if (candidates.length < 5) return setMessage("후보 영상이 최소 5개 필요합니다.");
    setBusy("package"); setMessage("한국판·일본판 Premiere XML과 제목·순위 텍스트를 만드는 중입니다.");
    try {
      await persistAll();
      const result = await callHelper<{ projectRoot: string }>("/shorts-family/package", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectCode: config.project_code, koreanTitle: config.korean_title, japaneseTitle: config.japanese_title,
          targetDuration: config.target_duration, candidates,
        }),
      });
      const nextPlanning: PlanningResult = {
        ...(planning || { concept: "", overall_emotion: "", entries: [] }),
        package_meta: { signature: currentPackageSignature, project_root: result.projectRoot, generated_at: new Date().toISOString() },
      };
      setPlanning(nextPlanning);
      await persistSceneCopyResults(nextPlanning, sceneCopies, candidates);
      setMessage(`제작 패키지를 저장했습니다: ${result.projectRoot}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "패키지 생성 실패"); }
    finally { setBusy(null); }
  }

  async function openProjectFolder() {
    try {
      if (packageMeta?.project_root) {
        await callHelper("/shorts-family/open-containing-folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: packageMeta.project_root }) });
      } else {
        await callHelper("/shorts-family/open-folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectCode: config.project_code }) });
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "폴더 열기 실패"); }
  }

  async function acceptOriginalMatch(index: number, match: SourceMatch, editedTitle?: string) {
    setBusy(`original-${index}`); setMessage("원본 영상을 후보 폴더로 바로 다운로드하고 있습니다.");
    setSourceDownloadState((current) => ({ ...current, [match.url]: "downloading" }));
    try {
      const chosenTitle = (editedTitle || match.title || `원본후보-${index + 1}`).trim();
      const result = await callHelper<{ path: string; filename: string }>("/shorts-family/download", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: match.url, title: chosenTitle }),
      });
      const staged = await callHelper<{ path: string; filename: string; folder: string }>("/shorts-family/stage-candidate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectCode: config.project_code, filePath: result.path, title: chosenTitle, index: index + 1 }),
      });
      const previousDuration = Math.max(3, Number(candidates[index]?.clipEnd || 0) - Number(candidates[index]?.clipStart || 0));
      const matchedStart = Math.max(0, Number(match.matchStartSeconds || 0));
      updateCandidate(index, { localPath: staged.path, sourceUrl: match.url, sourceKind: "original_found", clipStart: matchedStart, clipEnd: matchedStart + previousDuration, notes: `원본 후보 신뢰도 ${match.confidence}% · ${matchedStart}초 부근 자동 매칭, 직접 검수 필요` });
      reviewSource(match.url, "selected");
      setSourceDownloadState((current) => ({ ...current, [match.url]: "downloaded" }));
      setDownloadedPaths((current) => ({ ...current, [index]: staged.path }));
      setMessage(`${index + 1}번 원본 다운로드 완료: ${staged.path}`);
    } catch (error) {
      setSourceDownloadState((current) => ({ ...current, [match.url]: "failed" }));
      setMessage(error instanceof Error ? error.message : "원본 다운로드 실패");
    }
    finally { setBusy(null); }
  }

  async function generateRanking() {
    if (!downloadsReady) return setMessage("후보 폴더에 원본 영상 5개 이상을 먼저 다운로드해주세요.");
    const planningCandidates = stagedCandidateIndexes.slice(0, 7);
    setBusy("planning"); setMessage("각 장면을 분석해 한국·일본 역순 순위를 섞고 있습니다.");
    try {
      const response = await fetch("/api/shorts-family/plan", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          referenceTitle: discoveryVideos.find((video) => config.reference_path?.includes(video.videoId))?.title || "선택한 검증 레퍼런스",
          candidates: planningCandidates.map(({ candidate }) => candidate),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "AI 기획안 생성에 실패했습니다.");
      const rawPlan = payload.plan as PlanningResult;
      const plan: PlanningResult = { ...rawPlan, package_meta: planning?.package_meta, entries: rawPlan.entries.map((entry) => ({ ...entry, japanese_rank: entry.korean_rank ? 6 - entry.korean_rank : null })) };
      setPlanning(plan);
      const plannedCandidates = candidates.map((candidate, index) => {
        const planningIndex = planningCandidates.findIndex((item) => item.index === index);
        const entry = planningIndex >= 0 ? plan.entries.find((item) => Number(item.index) === planningIndex + 1) : undefined;
        return entry ? { ...candidate, koreanRank: entry.korean_rank, japaneseRank: entry.korean_rank ? 6 - entry.korean_rank : null,
          material: entry.material, emotion: entry.emotion, viralCause: entry.cause } : { ...candidate, koreanRank: null, japaneseRank: null };
      });
      setCandidates(plannedCandidates);
      await persistSceneCopyResults(plan, sceneCopies, plannedCandidates);
      setMessage("한국 1~5위 순위를 새로 섞었습니다. 일본판은 정확한 역순으로 적용됐으며 기존 문구 추천 목록은 그대로 유지됩니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "AI 기획안 생성 실패"); }
    finally { setBusy(null); }
  }

  async function generateAllSceneCopies() {
    if (!rankingComplete) return setMessage("먼저 순위 섞기로 한국 1~5위 순위를 정해주세요.");
    setBusy("scene-copy-all");
    let completed = 0;
    let generatedCopies = { ...sceneCopies };
    const failedRanks: number[] = [];
    const ranked = candidates.map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => candidate.koreanRank && /[\\/]01-candidates[\\/]/i.test(candidate.localPath))
      .sort((left, right) => Number(left.candidate.koreanRank) - Number(right.candidate.koreanRank));
    try {
      for (let position = 0; position < ranked.length; position += 1) {
        const { candidate, index } = ranked[position];
        const existingDescription = candidate.notes.trim();
        const description = existingDescription && !/자동 분리|원본\s*\d|원본 후보 신뢰도/.test(existingDescription)
          ? existingDescription
          : [candidate.material, candidate.viralCause, candidate.emotion ? `핵심 감정: ${candidate.emotion}` : ""].filter(Boolean).join(". ");
        setMessage(`${candidate.koreanRank}위 한·일 문구 후보 3개씩 생성 중 (${position + 1}/5)`);
        try {
          const copy = await requestSceneCopy(description);
          generatedCopies = { ...generatedCopies, [index]: copy };
          setSceneCopies(generatedCopies);
          await persistSceneCopyResults(planning, generatedCopies, candidates);
          completed += 1;
        } catch {
          failedRanks.push(Number(candidate.koreanRank));
        }
      }
      setMessage(failedRanks.length === 0
        ? "5개 장면의 한국어·일본어 문구 후보를 각각 3개씩 만들고 저장했습니다."
        : `문구 후보는 ${completed}/5개 생성했습니다. 실패한 한국 순위(${failedRanks.join(", ")}위)는 개별 재생성 버튼을 눌러주세요.`);
    } finally {
      setBusy(null);
    }
  }

  async function generateTitles(direction?: string) {
    if (!rankingComplete) return setMessage("먼저 STEP 5에서 한국 1~5위 순위 문구를 모두 정해주세요.");
    setBusy("titles"); setMessage(direction ? "요청한 수정 방향을 반영해 제목 후보를 다시 만들고 있습니다." : "완성된 순위 문구를 바탕으로 전체 제목 후보를 만들고 있습니다.");
    try {
      const response = await fetch("/api/shorts-family/title", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          entries: rankedCandidates.map((candidate) => ({
            korean_rank: candidate.koreanRank, korean_label: candidate.koreanLabel, japanese_label: candidate.japaneseLabel,
            material: candidate.material, emotion: candidate.emotion, cause: candidate.viralCause,
          })),
          direction: direction || undefined,
          previousKoreanTitle: config.korean_title, previousJapaneseTitle: config.japanese_title, previousJapaneseTranslation: config.japanese_title_translation,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "제목 추천 생성에 실패했습니다.");
      setTitleSuggestions({ korean: payload.koreanTitleCandidates, japanese: payload.japaneseTitleCandidates });
      setMessage("한국어·일본어 전체 제목 후보를 각각 3개 만들었습니다. 마음에 드는 제목을 선택하거나 직접 수정하세요.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "제목 추천 생성 실패"); }
    finally { setBusy(null); }
  }

  async function traceAllOriginals() {
    if (candidates.length < 5) return setMessage("먼저 -ra 영상을 5개 이상 장면으로 분리해주세요.");
    setBusy("trace-all"); setTraceProgress({ step: 1, label: "장면 분석 중 · 인물·행동·워터마크 읽기" }); setMessage("전체 원본 추적을 시작했습니다.");
    try {
      const local = await callHelper<{ candidates: LocalAnalysis[] }>("/shorts-family/analyze-all", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidates }), signal: AbortSignal.timeout(150000),
      });
      setTraceProgress({ step: 2, label: "후보 검색 중 · Google Lens·YouTube·SNS" });
      const searchResponse = await fetch("/api/shorts-family/original-search", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analyses: local.candidates }), signal: AbortSignal.timeout(150000),
      });
      const search = await searchResponse.json();
      if (!searchResponse.ok || !search.success) throw new Error(search.error || "전체 원본 후보 검색에 실패했습니다.");
      const provisionalMatches: Record<number, SourceMatch[]> = {};
      for (const entry of search.results as Array<{ index: number; candidates: SourceMatch[] }>) {
        provisionalMatches[entry.index - 1] = entry.candidates.filter((candidate) => candidate.confidence >= 86 && candidate.platform !== "web")
          .map((candidate) => ({ ...candidate, verificationStatus: "visual_evidence" as const, reason: `Google Lens·Vision 이미지 근거 후보입니다. 영상 검증 진행 중. ${candidate.reason}` }));
      }
      setSourceMatches(provisionalMatches);
      setTraceProgress({ step: 3, label: "영상 대조 중 · 후보 다운로드 및 프레임 검증" });
      const verified = await callHelper<{ results: Array<{ index: number; results: Array<{ url: string; ok: boolean; score: number; matchedFrames: number; bestSimilarity: number; matchStartSeconds?: number; templatePenalty?: number; overlayBlackRatio?: number }> }> }>("/shorts-family/verify-all", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ searches: search.results.map((entry: { index: number; jobId: string; candidates: SourceMatch[] }) => ({ index: entry.index, jobId: entry.jobId, urls: entry.candidates.map((item) => item.url) })) }), signal: AbortSignal.timeout(180000),
      });
      const nextMatches: Record<number, SourceMatch[]> = {};
      for (const entry of search.results as Array<{ index: number; description: string; candidates: SourceMatch[] }>) {
        const scores = new Map(verified.results.find((item) => item.index === entry.index)?.results.map((item) => [item.url, item]) || []);
        nextMatches[entry.index - 1] = entry.candidates.map((candidate) => {
          const score = scores.get(candidate.url);
          const titlePenalty = rankingRepostPenalty(candidate.title);
          const adjustedScore = Math.max(0, Number(score?.score || 0) - titlePenalty);
          if (score?.ok && adjustedScore >= 55) return { ...candidate, confidence: adjustedScore, matchStartSeconds: score.matchStartSeconds, verificationStatus: "verified" as const,
            reason: `${score.matchedFrames}개 프레임 일치·최고 유사도 ${score.bestSimilarity}%.${score.templatePenalty ? ` 상단 검은 템플릿 비율 ${score.overlayBlackRatio}%로 ${score.templatePenalty}점 감점.` : ""}${titlePenalty ? ` 랭킹·모음형 제목으로 ${titlePenalty}점 추가 감점.` : ""} ${candidate.reason}` };
          if (candidate.confidence >= 86 && candidate.platform !== "web") return { ...candidate, verificationStatus: "visual_evidence" as const,
            reason: `영상 다운로드 검증은 통과하지 못했지만 Google Lens·Vision 이미지 근거가 있습니다. 직접 재생 확인 필요. ${candidate.reason}` };
          return { ...candidate, confidence: 0, verificationStatus: "unverified" as const };
        }).filter((candidate) => candidate.verificationStatus !== "unverified").sort((left, right) => Number(right.verificationStatus === "verified") - Number(left.verificationStatus === "verified") || right.confidence - left.confidence);
        updateCandidate(entry.index - 1, { notes: `${entry.description} · 로컬 ${localVision.model} 분석` });
      }
      setSourceMatches(nextMatches);
      const verifiedScenes = Object.values(nextMatches).filter((items) => items.some((item) => item.verificationStatus === "verified")).length;
      const evidenceScenes = Object.values(nextMatches).filter((items) => items.some((item) => item.verificationStatus === "visual_evidence")).length;
      setMessage(`전체 추적 완료: 영상 검증 통과 ${verifiedScenes}개 장면, Google 이미지 근거만 있는 검토 후보 ${evidenceScenes}개 장면입니다. 둘을 구분해 표시했습니다.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "전체 원본 추적 실패"); }
    finally { setBusy(null); setTraceProgress(null); }
  }

  return <div className="mx-auto max-w-7xl space-y-6 [&_button:disabled]:cursor-default [&_button:not(:disabled)]:cursor-pointer">
    <section className="overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-rose-50 p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"><div><div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800"><Baby size={15} /> 랭킹형쇼츠 자동화</div><h1 className="mt-4 text-3xl font-black tracking-tight">숏폼(가족)</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">검증된 -ra 영상을 분리하고 후보 7개를 구성해 한국판·일본판을 서로 다른 순서로 제작합니다.</p></div><div className="flex items-center gap-3"><Image src="/shorts-family/logo-korea-dog.png" alt="한국판 강아지 로고" width={84} height={84} className="h-20 w-20 object-contain" /><Image src="/shorts-family/logo-japan-cat.png" alt="일본판 고양이 로고" width={84} height={84} className="h-20 w-20 object-contain" /></div></div>
      <div className="mt-6 flex flex-wrap items-center gap-2 text-xs font-bold"><span className={`rounded-full px-3 py-1.5 ${helperOnline ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{helperOnline ? "로컬 도우미 연결됨" : "npm run dev로 도우미를 시작하세요"}</span><span className="rounded-full bg-white px-3 py-1.5 text-muted-foreground">Premiere Pro 2026</span><span className="rounded-full bg-white px-3 py-1.5 text-muted-foreground">1080×1920 · 20~50초</span>{projectId && <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ${autoSaveStatus === "saving" ? "bg-sky-100 text-sky-700" : autoSaveStatus === "error" ? "bg-red-100 text-red-700" : "bg-white text-muted-foreground"}`}>{autoSaveStatus === "saving" ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}{autoSaveStatus === "saving" ? "자동 저장 중…" : autoSaveStatus === "error" ? "자동 저장 실패" : autoSaveStatus === "saved" ? "자동 저장됨" : "자동 저장 대기"}</span>}</div>
    </section>

    {!databaseReady && <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><b>데이터베이스 준비가 필요합니다.</b> `supabase/migrations/20260812_shorts_family_foundation.sql`을 Supabase에 적용한 뒤 새로고침해주세요.</section>}
    {message && <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{message}</section>}
    {requestedStage === "discover" && <div className="contents">

    <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-xs font-black text-violet-700">STEP 1</div><h2 className="mt-1 font-bold">YouTube 전체에서 검증된 랭킹형쇼츠 발굴</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">특정 채널에 한정하지 않고 영어·일본어 가족/아기/어린이 랭킹 검색을 합칩니다. 1,000만 조회 이상 또는 게시 7일 이내 300만 이상만 남기고 조회 속도로 정렬합니다.</p></div><button onClick={discoverRankingShorts} disabled={Boolean(busy)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-40">{busy === "discover" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} YouTube 전체 발굴</button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-border bg-stone-50 p-3"><label className="text-[11px] font-black text-zinc-700">URL로 레퍼런스 추가</label><div className="mt-2 flex flex-col gap-2 sm:flex-row"><input value={referenceUrlInput} onChange={(event) => setReferenceUrlInput(event.target.value)} placeholder="https://www.youtube.com/..." className="h-9 min-w-0 flex-1 rounded-lg border border-border px-3 text-xs" /><input value={referenceTitleInput} onChange={(event) => setReferenceTitleInput(event.target.value)} placeholder="제목(선택)" className="h-9 w-full rounded-lg border border-border px-3 text-xs sm:w-28" /><button onClick={() => addReferenceFromUrl(referenceUrlInput, referenceTitleInput)} disabled={!referenceUrlInput.trim() || Boolean(busy)} className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-lg bg-violet-600 px-3 text-xs font-black text-white disabled:opacity-40">{busy === "reference-url" ? <Loader2 size={13} className="animate-spin" /> : "추가"}</button></div></div><div className="rounded-xl border border-border bg-stone-50 p-3"><label className="text-[11px] font-black text-zinc-700">영상 업로드로 레퍼런스 추가</label><input type="file" accept="video/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) addReferenceFromUpload(file); event.target.value = ""; }} disabled={Boolean(busy)} className="mt-2 block w-full text-xs text-muted-foreground file:mr-2 file:h-9 file:rounded-lg file:border-0 file:bg-violet-600 file:px-3 file:text-xs file:font-black file:text-white disabled:opacity-40" /></div></div>
      {config.reference_path && <p className="mt-2 text-[10px] font-black text-emerald-700">현재 선택된 레퍼런스: {config.reference_path.split(/[\\/]/).pop()}</p>}
      {discoveryVideos.some((video) => discoveryReview[video.videoId] !== "deleted") && <div className="mt-4 grid max-h-[620px] gap-3 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">{discoveryVideos.filter((video) => discoveryReview[video.videoId] !== "deleted").slice(0, 20).map((video, index) => <DiscoveryCard key={video.videoId} video={video} index={index} review={discoveryReview[video.videoId] || "pending"} viewed={Boolean(viewedUrls[video.url])} active={lastViewedUrl === video.url} busy={busy === `reference-${video.videoId}`} disabled={!helperOnline || Boolean(busy)} onOpen={() => markViewed(video.url)} onSelect={() => chooseDiscoveredReference(video)} onReview={(state) => setDiscoveryReview((current) => ({ ...current, [video.videoId]: state }))} />)}</div>}
    </section></div>}

    {requestedStage !== "discover" && <div className="contents">
    {requestedStage === "setup" && <section className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><div className="text-xs font-black text-amber-700">STEP 2</div><h2 className="mt-1 font-bold">작업 프로젝트</h2><p className="mt-1 text-xs text-muted-foreground">선택한 레퍼런스를 담을 제작 폴더입니다.</p></div><button onClick={createProject} disabled={Boolean(busy)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-bold text-white disabled:opacity-50">{busy === "create" ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} 새 프로젝트</button></div>
        <select value={projectId || ""} onChange={(event) => setProjectId(Number(event.target.value) || null)} className="mt-4 h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"><option value="">프로젝트 선택</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select>
        <label className="mt-3 block text-xs font-bold text-muted-foreground">프로젝트 코드<input value={config.project_code} onChange={(event) => setConfig({ ...config, project_code: event.target.value })} className="mt-1.5 h-10 w-full rounded-xl border border-border px-3 text-sm text-foreground" /></label>
        <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs font-bold text-muted-foreground">목표 길이<input type="number" min={20} max={50} value={config.target_duration} onChange={(event) => setConfig({ ...config, target_duration: Number(event.target.value) })} className="mt-1.5 h-10 w-full rounded-xl border border-border px-3 text-foreground" /></label><label className="text-xs font-bold text-muted-foreground">분리 개수<select value={config.segment_count} onChange={(event) => setConfig({ ...config, segment_count: Number(event.target.value) })} className="mt-1.5 h-10 w-full rounded-xl border border-border bg-white px-3 text-foreground">{[5, 6, 7].map((count) => <option key={count}>{count}</option>)}</select></label></div>
      </div>

      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><div className="text-xs font-black text-amber-700">STEP 2</div><h2 className="mt-1 font-bold">-ra 레퍼런스 장면 분리</h2><p className="mt-1 text-xs text-muted-foreground">랭킹 영상 안의 장면 변화와 순위 간격으로 5~7개 소스를 분류합니다.</p></div><button onClick={refreshLibrary} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="폴더 새로고침"><RefreshCw size={16} /></button></div>
        <select value={config.reference_path || ""} onChange={(event) => setConfig({ ...config, reference_path: event.target.value })} className="mt-4 h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"><option value="">-ra 영상 선택</option>{library.filter((file) => file.rankingReference).map((file) => <option key={file.path} value={file.path}>{file.name} · {formatDuration(file.duration)}</option>)}</select>
        <button onClick={splitReference} disabled={!projectId || !config.reference_path || Boolean(busy)} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 text-sm font-bold text-white disabled:opacity-40">{busy === "split" ? <Loader2 size={16} className="animate-spin" /> : <Scissors size={16} />} 자동 분리하고 후보 만들기</button>
      </div>
    </section>}

    {requestedStage === "trace" && <section className="rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-xs font-black text-sky-700">STEP 3</div><h2 className="mt-1 font-bold">전체 장면 원본 추적과 부족분 보충</h2><p className="mt-1 text-xs text-muted-foreground">Windows 로컬 비전 모델이 장면을 분석하고, Lens·SNS 후보를 수집한 뒤 실제 프레임까지 비교합니다.</p><p className="mt-1 text-[10px] font-semibold text-amber-700">실행하면 장면당 대표 프레임 2장이 ImgBB에 전송되며 10분 후 자동 삭제됩니다. 전체 영상은 업로드하지 않습니다.</p><p className={`mt-2 text-[10px] font-black ${localVision.online && localVision.modelReady ? "text-emerald-700" : "text-red-600"}`}>{localVision.online && localVision.modelReady ? `로컬 엔진 준비됨 · ${localVision.model}` : `로컬 엔진 미설치 · npm run shorts-family:setup-vision 실행 필요`}</p>{traceProgress && <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3"><div className="flex items-center gap-2 text-xs font-black text-sky-800"><Loader2 size={14} className="animate-spin" /> {traceProgress.step}/3 · {traceProgress.label}</div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sky-100"><div className="h-full rounded-full bg-sky-600 transition-all" style={{ width: `${traceProgress.step / 3 * 100}%` }} /></div></div>}</div><div className="flex flex-wrap gap-2"><button onClick={traceAllOriginals} disabled={candidates.length < 5 || !localVision.modelReady || Boolean(busy)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-bold text-white disabled:opacity-40">{busy === "trace-all" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} 전체 원본 자동 추적</button></div></div>
      <div className={`mt-3 rounded-xl border p-3 ${downloadsReady ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><p className="text-xs font-black">순위 영상 확정 {confirmedRankCount}/5 {downloadsReady ? "· 다음 단계 준비 완료" : "· 각 순위의 원본 또는 보유 소스를 확정해주세요"}</p>{downloadsReady && <a href="/studio/shorts-family?stage=edit" className="mt-2 inline-flex h-9 items-center gap-1 rounded-lg bg-emerald-700 px-3 text-xs font-black text-white">원본 편집으로 이동 <ChevronRight size={13} /></a>}</div><p className="mt-2 text-[10px] text-muted-foreground">원본 다운로드 또는 보유 소스 교체가 끝난 순위만 확정으로 계산합니다. 다섯 순위가 모두 확정되면 다음 단계가 열립니다.</p><div className="mt-4 space-y-3">{candidates.map((candidate, index) => <CandidateReviewEditor key={`${candidate.localPath}-${index}`} index={index} candidate={candidate} matches={sourceMatches[index] || []} review={sourceReview} downloadState={sourceDownloadState} viewedUrls={viewedUrls} lastViewedUrl={lastViewedUrl} downloadedPath={downloadedPaths[index]} matchTitles={matchTitles} setMatchTitle={(url, title) => setMatchTitles((current) => ({ ...current, [url]: title }))} markViewed={markViewed} setReview={reviewSource} acceptOriginal={(match, title) => acceptOriginalMatch(index, match, title)} openFolder={openContainingFolder} />)}{candidates.length === 0 && <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">-ra를 자동 분리하면 이곳에 장면별 원본 후보가 표시됩니다.</div>}</div>
      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
        <div className="flex gap-2"><input value={libraryQuery} onFocus={refreshRecommendationLibrary} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="C:\\Users\\withj\\Dropbox\\source 제목 검색" className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-white px-3 text-sm" /><button type="button" onClick={refreshRecommendationLibrary} disabled={libraryRefreshing} className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 text-xs font-black text-amber-800 disabled:cursor-default disabled:opacity-50">{libraryRefreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} 최신 파일</button></div>
        <p className="mt-2 text-[10px] text-amber-900"><span className="font-black">C:\Users\withj\Dropbox\source</span> 폴더의 최신 목록에서 입력 즉시 검색합니다. 파일명을 누르면 바로 재생되고, 선택 버튼은 후보 지정에만 사용됩니다.</p>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-2">{recommendedLibrary.slice(0, 30).map((file, index) => { const selected = selectedLibraryPath === file.path; const previewing = previewLibraryPath === file.path; return <article key={file.path} className={`min-w-52 rounded-xl border bg-white p-3 transition ${previewing ? "border-sky-500 ring-2 ring-sky-200" : selected ? "border-amber-600 ring-2 ring-amber-200" : "border-border hover:border-amber-500"}`}><div className="flex items-center justify-between gap-2"><span className="text-[9px] font-black text-amber-700">추천 {index + 1}</span><button type="button" onClick={() => selectLibraryFile(file)} className={`cursor-pointer rounded-full border px-2 py-0.5 text-[9px] font-black ${selected ? "border-amber-600 bg-amber-600 text-white" : "border-amber-500 bg-white text-amber-700"}`}>{selected ? "선택됨" : "선택"}</button></div><button type="button" onClick={() => setPreviewLibraryPath(file.path)} className="mt-1 flex w-full cursor-pointer items-center gap-1 text-left text-xs font-bold text-sky-800 hover:underline"><Play size={11} className="shrink-0" /><span className="truncate">{file.name}</span></button><p className="mt-1 text-[10px] text-muted-foreground">{file.recommendationScore > 0 ? `유사 ${Math.round(file.recommendationScore * 100)}% · ` : ""}파일명 클릭해 재생</p></article>; })}</div>
        {recommendedLibrary.length === 0 && <p className="mt-3 text-xs text-muted-foreground">검색 결과가 없습니다.</p>}
        {previewLibraryFile && <div className="mt-4 rounded-xl border border-sky-300 bg-white p-3"><div className="flex items-center justify-between gap-3"><p className="min-w-0 truncate text-xs font-black text-sky-900">미리보기 · {previewLibraryFile.name}</p><button type="button" onClick={() => setPreviewLibraryPath("")} className="cursor-pointer text-[10px] font-black text-zinc-500 hover:text-zinc-900">닫기</button></div><video key={previewLibraryFile.path} src={`${HELPER}/shorts-family/stream?path=${encodeURIComponent(previewLibraryFile.path)}`} controls autoPlay playsInline preload="metadata" className="mt-3 max-h-[480px] w-full rounded-lg bg-black" /></div>}
        {selectedLibraryPath && <div className="mt-4 rounded-xl border border-amber-300 bg-white p-3"><p className="truncate text-xs font-black text-zinc-900">선택 소스 · {recommendationLibrary.find((file) => file.path === selectedLibraryPath)?.name}</p><p className="mt-1 text-[10px] text-muted-foreground">이제 새 후보로 추가하거나, 교체할 기존 후보를 고르세요.</p><div className="mt-3 flex flex-col gap-2 md:flex-row"><button onClick={addSelectedLibraryCandidate} disabled={candidates.length >= 7} className="h-10 rounded-lg bg-amber-600 px-4 text-xs font-black text-white disabled:opacity-40">새 예비 후보로 추가</button><select value={libraryTargetIndex ?? ""} onChange={(event) => setLibraryTargetIndex(event.target.value === "" ? null : Number(event.target.value))} className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-white px-3 text-xs"><option value="">교체할 기존 후보 선택</option>{candidates.map((candidate, index) => <option key={`${candidate.localPath}-${index}`} value={index}>{index + 1}번 · {candidate.sourceTitle}</option>)}</select><button onClick={replaceWithSelectedLibrary} disabled={libraryTargetIndex === null} className="h-10 rounded-lg border border-amber-600 bg-white px-4 text-xs font-black text-amber-700 disabled:opacity-40">선택 후보 교체</button></div></div>}
      </div>
    </section>}

    {requestedStage === "edit" && <section className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-xs font-black text-teal-700">STEP 4</div><h2 className="mt-1 font-bold">원본 편집</h2><p className="mt-1 text-xs text-muted-foreground">다운로드된 후보 영상의 길이와 화면 처리(확대·크롭·블러)를 조절합니다. 순위·문구는 다음 단계에서 정합니다.</p></div><button onClick={saveAll} disabled={!projectId || stagedCandidateIndexes.length === 0 || Boolean(busy)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold disabled:opacity-40">{busy === "save" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} 프로젝트 저장</button></div>{stagedCandidateIndexes.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">STEP 3에서 후보 영상을 먼저 다운로드해주세요.</div> : <div className="mt-5 space-y-3">{stagedCandidateIndexes.map(({ candidate, index }) => <CandidateTrimEditor key={`${candidate.localPath}-${index}`} index={index} candidate={candidate} update={(patch) => updateCandidate(index, patch)} save={() => saveCandidate(index)} saving={busy === `save-candidate-${index}`} />)}{downloadsReady && <a href="/studio/shorts-family?stage=ranking" className="mt-1 inline-flex h-9 items-center gap-1 rounded-lg bg-teal-700 px-3 text-xs font-black text-white">순위·문구 편집으로 이동 <ChevronRight size={13} /></a>}</div>}</section>}

    {requestedStage === "ranking" && <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-xs font-black text-violet-700">STEP 5</div><h2 className="mt-1 font-bold">순위·장면 문구 편집</h2><p className="mt-1 text-xs text-muted-foreground">한국 1위부터 후보 소스를 고르고 장면 범위와 순위 반응 문구를 정합니다. 일본 순위는 한국 순위의 정확한 역순으로 자동 고정됩니다.</p></div><div className="flex flex-wrap gap-2"><button onClick={generateRanking} disabled={!downloadsReady || Boolean(busy)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-40">{busy === "planning" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} 순위 섞기</button><button onClick={generateAllSceneCopies} disabled={!rankingComplete || Boolean(busy)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-bold text-white disabled:opacity-40">{busy === "scene-copy-all" ? <Loader2 size={15} className="animate-spin" /> : <WandSparkles size={15} />} 전체 문구 추천</button><button onClick={saveAll} disabled={!projectId || !downloadsReady || Boolean(busy)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold disabled:opacity-40"><Save size={15} /> 프로젝트 저장</button></div></div>{!downloadsReady ? <div className="mt-4 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6 text-center text-sm font-bold text-amber-800">원본 추적 페이지에서 후보 영상 5개 이상을 먼저 다운로드해주세요. 현재 {stagedCandidateIndexes.length}/5개</div> : <div className="mt-5 space-y-4">{[1, 2, 3, 4, 5].map((rank) => { const selected = candidates.findIndex((candidate) => candidate.koreanRank === rank && /[\\/]01-candidates[\\/]/i.test(candidate.localPath)); return <RankSlotEditor key={rank} rank={rank} selectedIndex={selected} sourceOptions={stagedCandidateIndexes} candidate={selected >= 0 ? candidates[selected] : undefined} sceneCopy={selected >= 0 ? sceneCopies[selected] : undefined} generatingCopy={busy === "planning" || busy === "scene-copy-all" || (selected >= 0 && busy === `scene-copy-${selected}`)} selectSource={(index) => assignRankSource(rank, index)} update={(patch) => selected >= 0 && updateCandidate(selected, patch)} generateCopy={() => selected >= 0 && generateSceneCopy(selected)} />; })}</div>}</section>}

    {requestedStage === "title" && <section className="rounded-2xl border border-fuchsia-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-xs font-black text-fuchsia-700">STEP 6</div><h2 className="mt-1 font-bold">전체 제목 추천</h2><p className="mt-1 text-xs text-muted-foreground">STEP 5에서 정한 순위 문구·소재·감정을 근거로 한국어·일본어 전체 제목 후보를 각각 3개 추천합니다.</p></div><button onClick={() => generateTitles()} disabled={!rankingComplete || Boolean(busy)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-fuchsia-600 px-4 text-sm font-bold text-white disabled:opacity-40">{busy === "titles" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} AI 제목 추천</button></div>{!rankingComplete ? <div className="mt-4 rounded-xl border border-dashed border-fuchsia-300 bg-fuchsia-50 p-6 text-center text-sm font-bold text-fuchsia-800">STEP 5에서 한국 1~5위 순위 문구를 모두 정해주세요.</div> : <div className="mt-5 grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-border bg-stone-50 p-4"><p className="text-xs font-black text-zinc-700">한국어 제목</p>{titleSuggestions && <div className="mt-2 grid gap-2 sm:grid-cols-3">{titleSuggestions.korean.map((suggestion) => { const applied = suggestion === config.korean_title; return <button key={suggestion} onClick={() => setConfig({ ...config, korean_title: suggestion })} className={`flex items-center justify-between gap-2 rounded-lg border p-2 text-left text-[11px] font-black transition ${applied ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-violet-200 bg-white hover:border-violet-500"}`}><span>{suggestion}</span>{applied && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />}</button>; })}</div>}<input value={config.korean_title} onChange={(event) => setConfig({ ...config, korean_title: event.target.value })} className="mt-3 h-11 w-full rounded-xl border border-border px-3 text-sm font-bold" /><p className="mt-1.5 text-[10px] font-black text-emerald-700">이 값이 STEP 7 템플릿에 바로 적용됩니다.</p></div>
      <div className="rounded-xl border border-border bg-stone-50 p-4"><p className="text-xs font-black text-zinc-700">일본어 제목</p>{titleSuggestions && <div className="mt-2 grid gap-2 sm:grid-cols-3">{titleSuggestions.japanese.map((suggestion) => { const applied = suggestion.japanese === config.japanese_title; return <button key={suggestion.japanese} onClick={() => setConfig({ ...config, japanese_title: suggestion.japanese, japanese_title_translation: suggestion.korean })} className={`flex items-start justify-between gap-2 rounded-lg border p-2 text-left transition ${applied ? "border-emerald-600 bg-emerald-50" : "border-sky-200 bg-white hover:border-sky-500"}`}><span><span className="block text-[11px] font-black">{suggestion.japanese}</span><span className="block text-[9px] text-muted-foreground">{suggestion.korean}</span></span>{applied && <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />}</button>; })}</div>}<input value={config.japanese_title} onChange={(event) => setConfig({ ...config, japanese_title: event.target.value })} className="mt-3 h-11 w-full rounded-xl border border-border px-3 text-sm font-bold" /><p className="mt-1.5 text-[10px] font-black text-emerald-700">이 값이 STEP 7 템플릿에 바로 적용됩니다.</p><p className="mt-1 text-xs text-muted-foreground">한국어 번역: {config.japanese_title_translation || "추천 선택 시 자동 입력"}</p></div>
    </div>}
    {titleSuggestions && <div className="mt-4 rounded-xl border border-fuchsia-200 bg-fuchsia-50/60 p-3"><label className="text-[11px] font-black text-fuchsia-900">수정 방향 (선택)</label><textarea value={titleDirection} onChange={(event) => setTitleDirection(event.target.value)} placeholder="예: 더 코믹하게, 반전 포인트를 강조, 귀여운 느낌으로" className="mt-1 h-16 w-full resize-y rounded-lg border border-fuchsia-200 bg-white p-2 text-xs" /><button onClick={() => generateTitles(titleDirection)} disabled={!rankingComplete || Boolean(busy)} className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg bg-fuchsia-600 px-3 text-xs font-black text-white disabled:opacity-40">{busy === "titles" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} 방향 반영해서 다시 추천</button></div>}</section>}

    {requestedStage === "premiere" && <>
    <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-black text-emerald-700">STEP 7</div><h2 className="mt-1 font-bold">템플릿 확인과 Premiere 제작</h2><p className="mt-1 text-xs text-muted-foreground">완성된 제목·순위·문구로 최종 템플릿을 확인한 뒤 Premiere용 XML과 제목·순위 텍스트를 생성합니다. 그래픽·색보정은 Premiere에서 직접 작업합니다.</p>{packageMeta && <p className={`mt-2 text-[10px] font-black ${packageSaved ? "text-emerald-700" : "text-amber-700"}`}>{packageSaved ? `저장됨 · ${new Date(packageMeta.generated_at).toLocaleString("ko-KR")}` : "앞 단계 변경사항이 있습니다. 패키지를 다시 생성해주세요."}</p>}</div><div className="flex flex-wrap gap-2"><button onClick={buildPackage} disabled={!projectId || candidates.length < 5 || Boolean(busy) || packageSaved} className={`inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold text-white disabled:opacity-70 ${packageStale ? "bg-amber-600" : "bg-emerald-600"}`}>{busy === "package" ? <Loader2 size={15} className="animate-spin" /> : packageSaved ? <Check size={15} /> : packageStale ? <RefreshCw size={15} /> : <PackageCheck size={15} />}{busy === "package" ? "생성 중…" : packageSaved ? "저장됨" : packageStale ? "변경사항 다시 생성" : "Premiere XML·텍스트 생성"}</button><button onClick={openProjectFolder} disabled={!projectId || !packageMeta || Boolean(busy)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 text-sm font-bold text-emerald-800 disabled:opacity-40"><FolderOpen size={16} /> 저장 폴더 열기</button></div></div></section>

    <section className="grid gap-4 xl:grid-cols-2"><TemplatePanel locale="ko" title={config.korean_title} setTitle={(value) => setConfig({ ...config, korean_title: value })} candidates={candidates} /><TemplatePanel locale="ja" title={config.japanese_title} translation={config.japanese_title_translation} setTitle={(value) => setConfig({ ...config, japanese_title: value })} candidates={candidates} /></section>

    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 text-emerald-700" size={21} /><div><p className="font-bold text-emerald-950">최종 제작 전 사용자 검수</p><p className="mt-1 text-xs leading-5 text-emerald-800">안전성, 원본 사용 범위, 자동 분리점, 자막 제거, 좌우 반전 문자 왜곡을 확인한 뒤 Premiere Pro 2026 XML을 여세요.</p></div></div><button onClick={openProjectFolder} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-emerald-800 shadow-sm"><FolderOpen size={16} /> 프로젝트 폴더</button></section>
    <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900"><p className="font-black">템플릿 기능이 만드는 것</p><p className="mt-1 text-xs leading-5">한국판·일본판 상단 제목, 로고, 순위 목록, 활성 순위 색상·투명도를 웹에서 미리 보여줍니다. 실제 그래픽·색보정·전환 효과는 이 미리보기를 참고해 Premiere에서 직접 작업합니다. “Premiere XML·텍스트 생성”을 누르면 클립 순서만 잡힌 시퀀스 XML과 제목·순위 텍스트가 만들어집니다.</p></section>
    </>}
    </div>}
  </div>;
}

function DiscoveryCard({ video, index, review, viewed, active, busy, disabled, onOpen, onSelect, onReview }: { video: DiscoveryVideo; index: number; review: ReviewState; viewed: boolean; active: boolean; busy: boolean; disabled: boolean; onOpen: () => void; onSelect: () => void; onReview: (state: ReviewState) => void }) {
  const border = active ? "border-sky-500 ring-2 ring-sky-200" : review === "selected" ? "border-emerald-500" : review === "deferred" ? "border-zinc-400 bg-zinc-50" : "border-violet-300";
  return <article className={`overflow-hidden rounded-xl border transition ${border}`}>
    <div className="relative aspect-video bg-cover bg-center" style={{ backgroundImage: `url(${video.thumbnailUrl})` }}>{viewed && <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-sky-600 px-2 py-1 text-[9px] font-black text-white"><Eye size={10} /> 열어봄</span>}</div>
    <div className="p-3"><div className="flex items-center justify-between gap-2"><span className="rounded-full bg-zinc-900 px-2 py-1 text-[10px] font-black text-white">#{index + 1}</span><span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-black text-violet-700">{video.reason}</span></div>
      <a href={video.url} target="_blank" rel="noreferrer" onClick={onOpen} className="mt-2 block line-clamp-2 text-sm font-bold hover:text-violet-700">{video.title}</a>
      <p className="mt-1 text-[11px] text-muted-foreground">{video.channelName} · 조회 {Math.round(video.viewCount / 10000).toLocaleString()}만 · {video.ageDays < 1 ? `${Math.max(1, Math.round(video.ageDays * 24))}시간` : `${video.ageDays.toFixed(1)}일`} · 시간당 {video.viewsPerHour.toLocaleString()}</p>
      <div className="mt-3 grid grid-cols-3 gap-1"><button onClick={onSelect} disabled={disabled} className={`h-8 rounded-md border text-[10px] font-black disabled:opacity-40 ${review === "selected" ? "border-emerald-700 bg-emerald-700 text-white" : "border-emerald-600 bg-transparent text-emerald-700"}`}>{busy ? "저장 중…" : review === "selected" ? "선택됨" : "선택"}</button><button onClick={() => onReview("deferred")} className={`inline-flex h-8 items-center justify-center gap-1 rounded-md border text-[10px] font-black ${review === "deferred" ? "border-zinc-700 bg-zinc-700 text-white" : "border-zinc-400 bg-transparent text-zinc-700"}`}><PauseCircle size={11} /> {review === "deferred" ? "보류됨" : "보류"}</button><button onClick={() => onReview("deleted")} className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-red-300 bg-transparent text-[10px] font-black text-red-600"><Trash2 size={11} /> 삭제</button></div>
    </div>
  </article>;
}

function CandidateReviewEditor({ index, candidate, matches, review, downloadState, viewedUrls, lastViewedUrl, downloadedPath, matchTitles, setMatchTitle, markViewed, setReview, acceptOriginal, openFolder }: { index: number; candidate: Candidate; matches: SourceMatch[]; review: Record<string, ReviewState>; downloadState: Record<string, SourceDownloadState>; viewedUrls: Record<string, boolean>; lastViewedUrl: string; downloadedPath?: string; matchTitles: Record<string, string>; setMatchTitle: (url: string, title: string) => void; markViewed: (url: string) => void; setReview: (url: string, state: ReviewState) => void; acceptOriginal: (match: SourceMatch, title: string) => void; openFolder: (path: string) => void }) {
  const [referenceStillFailed, setReferenceStillFailed] = useState(false);
  const [confirmedStillFailed, setConfirmedStillFailed] = useState(false);
  const visible = matches.filter((match) => review[match.url] !== "deleted").sort((left, right) => {
    const stateBoost = (value: SourceMatch) => review[value.url] === "selected" ? 3 : review[value.url] === "deferred" ? -1 : 0;
    return stateBoost(right) - stateBoost(left) || right.confidence - left.confidence;
  });
  const referencePath = candidate.referencePath || (candidate.sourceKind === "reference_split" ? candidate.localPath : deriveReferencePath(candidate.localPath, index, candidate.referenceRank));
  const confirmedPath = candidate.sourceKind !== "reference_split" ? candidate.localPath : downloadedPath || "";
  const slotLabel = candidate.referenceRank ? `레퍼런스 ${candidate.referenceRank}위` : `예비 후보 ${index + 1}`;
  const referenceStillUrl = `${HELPER}/shorts-family/still?path=${encodeURIComponent(referencePath)}&at=0.5`;
  const confirmedStillUrl = confirmedPath ? `${HELPER}/shorts-family/still?path=${encodeURIComponent(confirmedPath)}&at=${encodeURIComponent(Math.max(0, candidate.clipStart + 0.5))}` : "";
  return <article className="rounded-xl border border-border bg-stone-50 p-3">
    <div className="mb-3 inline-flex rounded-md border border-violet-300 bg-violet-50 px-3 py-1 text-xs font-black text-violet-900">{slotLabel}</div>
    <div className="mb-3 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-border bg-white p-2">{referenceStillFailed ? <div className="flex aspect-video w-full flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-100 text-[9px] font-bold text-zinc-500"><FileVideo2 size={18} className="mb-1" />레퍼런스 스틸컷 표시 실패</div> : <Image unoptimized src={referenceStillUrl} width={480} height={270} alt={`${slotLabel} 장면`} onError={() => setReferenceStillFailed(true)} className="aspect-video w-full rounded-lg bg-zinc-200 object-cover" />}<p className="mt-2 text-[10px] font-black text-zinc-700">레퍼런스 장면</p></div>
      <div className="rounded-xl border border-border bg-white p-2">{confirmedStillUrl && !confirmedStillFailed ? <Image unoptimized src={confirmedStillUrl} width={480} height={270} alt={`${slotLabel} 확정 영상`} onError={() => setConfirmedStillFailed(true)} className="aspect-video w-full rounded-lg bg-zinc-200 object-cover" /> : <div className="flex aspect-video w-full flex-col items-center justify-center rounded-lg border border-dashed border-amber-300 bg-amber-50 text-[10px] font-black text-amber-800"><FileVideo2 size={20} className="mb-1" />{confirmedStillFailed ? "확정 영상 스틸컷 표시 실패" : "아직 확정된 영상 없음"}</div>}<div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className={`text-[10px] font-black ${confirmedPath ? "text-emerald-700" : "text-amber-700"}`}>{confirmedPath ? "확정 영상" : "원본 또는 보유 소스 선택 필요"}</p>{confirmedPath && <button onClick={() => openFolder(confirmedPath)} className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md bg-emerald-700 px-3 text-[10px] font-black text-white"><FolderOpen size={12} /> 다운로드 완료 · 저장 폴더 열기</button>}</div></div>
    </div>
    {visible.length > 0 && <div className="mt-3 border-t border-border pt-3"><p className="text-[11px] font-black text-sky-800">원본 후보 · 링크를 열어본 항목은 ‘열어봄’, 마지막으로 연 항목은 파란 테두리로 표시됩니다.</p><div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{visible.map((match) => {
      const selected = review[match.url] === "selected";
      const deferred = review[match.url] === "deferred";
      const currentDownloadState = downloadState[match.url] || (selected ? "downloaded" : undefined);
      const downloading = currentDownloadState === "downloading";
      const downloadFailed = currentDownloadState === "failed";
      const active = lastViewedUrl === match.url;
      const editedTitle = matchTitles[match.url] ?? match.title;
      return <div key={match.url} className={`rounded-lg border-2 p-2 text-[10px] transition ${active ? "border-sky-500 ring-2 ring-sky-200" : selected ? "border-emerald-500 bg-emerald-50" : deferred ? "border-zinc-400 bg-zinc-100" : match.verificationStatus === "verified" ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}><div className="mb-1 flex items-center justify-between gap-2"><span className={`rounded-full px-2 py-0.5 font-black ${match.verificationStatus === "verified" ? "bg-emerald-600 text-white" : "bg-amber-500 text-white"}`}>{match.verificationStatus === "verified" ? "영상 일치 검증" : "이미지 근거·미검증"}</span>{viewedUrls[match.url] && <span className="inline-flex items-center gap-1 font-black text-sky-700"><Eye size={10} /> 열어봄</span>}</div><a href={match.url} target="_blank" rel="noreferrer" onClick={() => markViewed(match.url)} className="line-clamp-2 font-bold hover:text-sky-700">{match.title}</a><label className="mt-2 block font-black text-zinc-600">후보 저장 제목<input value={editedTitle} onChange={(event) => setMatchTitle(match.url, event.target.value)} className="mt-1 h-8 w-full rounded-md border border-zinc-300 bg-white px-2 text-[10px] font-semibold text-zinc-900" /></label>{downloading && <p className="mt-1 inline-flex items-center gap-1 font-black text-sky-700"><Loader2 size={10} className="animate-spin" /> 다운로드하는 중입니다…</p>}{downloadFailed && <p className="mt-1 font-black text-red-600">다운로드 불가 · 다시 시도할 수 있습니다.</p>}{currentDownloadState === "downloaded" && <p className="mt-1 font-black text-emerald-700">다운로드 완료</p>}<div className="mt-2 grid grid-cols-3 gap-1"><button onClick={() => acceptOriginal(match, editedTitle)} disabled={downloading || selected} className={`h-8 rounded-md border font-black disabled:cursor-default ${downloading ? "border-sky-500 bg-sky-50 text-sky-700" : selected ? "border-emerald-700 bg-emerald-700 text-white" : "cursor-pointer border-emerald-600 bg-transparent text-emerald-700"}`}>{downloading ? "다운로드 중…" : selected ? "다운로드됨" : downloadFailed ? "다시 시도" : "다운로드"}</button><button onClick={() => setReview(match.url, "deferred")} className={`h-8 cursor-pointer rounded-md border font-black ${deferred ? "border-zinc-700 bg-zinc-700 text-white" : "border-zinc-400 bg-transparent text-zinc-700"}`}>{deferred ? "보류됨" : "보류"}</button><button onClick={() => setReview(match.url, "deleted")} className="h-8 cursor-pointer rounded-md border border-red-300 bg-transparent font-black text-red-600">삭제</button></div></div>;
    })}</div></div>}
  </article>;
}

const TRIM_THUMB_STYLE = "pointer-events-none absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow";

function TrimSlider({ duration, clipStart, clipEnd, update, seekWhenPaused }: { duration: number; clipStart: number; clipEnd: number; update: (patch: Partial<Candidate>) => void; seekWhenPaused: (seconds: number) => void }) {
  const startPct = Math.min(100, (Math.max(0, clipStart) / duration) * 100);
  const endPct = Math.min(100, (Math.max(0, clipEnd) / duration) * 100);
  return <div className="relative h-6 w-full">
    <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-zinc-200" />
    <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-violet-400" style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }} />
    <input aria-label="시작점" title="정지 상태에서 누르면 시작점으로 이동" type="range" min={0} max={duration} step={0.05} value={Math.min(clipStart, clipEnd)} onPointerDown={() => seekWhenPaused(clipStart)} onChange={(event) => { const next = Math.min(Number(event.target.value), clipEnd - 0.1); update({ clipStart: next }); seekWhenPaused(next); }} className={`${TRIM_THUMB_STYLE} [&::-moz-range-thumb]:border-violet-600 [&::-webkit-slider-thumb]:border-violet-600`} />
    <input aria-label="종료점" title="정지 상태에서 누르면 종료점으로 이동" type="range" min={0} max={duration} step={0.05} value={Math.max(clipEnd, clipStart)} onPointerDown={() => seekWhenPaused(clipEnd)} onChange={(event) => { const next = Math.max(Number(event.target.value), clipStart + 0.1); update({ clipEnd: next }); seekWhenPaused(next); }} className={`${TRIM_THUMB_STYLE} [&::-moz-range-thumb]:border-sky-600 [&::-webkit-slider-thumb]:border-sky-600`} />
  </div>;
}

function CandidateTrimEditor({ index, candidate, update, save, saving }: { index: number; candidate: Candidate; update: (patch: Partial<Candidate>) => void; save: () => Promise<boolean>; saving: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);
  const rangeSignature = `${candidate.clipStart}|${candidate.clipEnd ?? ""}`;
  const [savedRangeSignature, setSavedRangeSignature] = useState(rangeSignature);
  const rangeChanged = rangeSignature !== savedRangeSignature;
  const streamUrl = `${HELPER}/shorts-family/stream?path=${encodeURIComponent(candidate.localPath)}`;
  const clipEnd = candidate.clipEnd ?? duration;
  const saveRangeChanges = async () => {
    if (!rangeChanged || saving) return;
    if (await save()) setSavedRangeSignature(rangeSignature);
  };
  const seekWhenPaused = (seconds: number) => {
    const video = videoRef.current;
    if (!video || !video.paused) return;
    video.currentTime = Math.max(0, Math.min(seconds, video.duration || duration));
  };
  return <article className="rounded-xl border border-border bg-white p-4">
    <div className="flex items-start justify-between gap-3"><p className="min-w-0 truncate text-sm font-black">{index + 1}번 · {candidate.sourceTitle}</p><button type="button" onClick={saveRangeChanges} disabled={saving || !rangeChanged} className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-md border px-3 text-[10px] font-black ${rangeChanged ? "border-teal-500 bg-teal-50 text-teal-800" : "border-emerald-300 bg-emerald-50 text-emerald-700"} disabled:opacity-75`}>{saving ? <Loader2 size={12} className="animate-spin" /> : rangeChanged ? <Save size={12} /> : <Check size={12} />} {saving ? "저장 중…" : rangeChanged ? "변경사항 저장" : "저장됨"}</button></div>
    <p className="mt-1 break-all text-[10px] text-muted-foreground">{candidate.localPath}</p>
    {videoFailed
      ? <div className="mt-3 flex aspect-video w-full flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-100 text-[9px] font-bold text-zinc-500"><FileVideo2 size={18} className="mb-1" />로컬 도우미 재시작 후 재생 가능</div>
      : <video ref={videoRef} src={streamUrl} controls preload="metadata" onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)} onError={() => setVideoFailed(true)} className="mt-3 aspect-video w-full rounded-lg bg-black" />}
    {duration > 0 && <div className="mt-3"><TrimSlider duration={duration} clipStart={candidate.clipStart} clipEnd={clipEnd} update={update} seekWhenPaused={seekWhenPaused} /><p className="mt-1 text-[10px] font-bold text-muted-foreground">{candidate.clipStart.toFixed(1)}초 ~ {clipEnd.toFixed(1)}초 · 정지 상태에서 보라·파랑 손잡이를 누르면 해당 지점으로 이동합니다. 재생 중에는 아래 “현재” 버튼으로 지점을 찍을 수 있습니다.</p></div>}
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-[10px] font-bold text-muted-foreground">시작(초)<div className="mt-1 flex gap-1"><input type="number" min={0} step={0.1} value={candidate.clipStart} onChange={(event) => update({ clipStart: Number(event.target.value) })} className="h-9 w-full min-w-0 rounded-lg border border-border px-3 text-xs" /><button type="button" onClick={() => videoRef.current && update({ clipStart: videoRef.current.currentTime })} disabled={!duration} className="shrink-0 rounded-lg border border-violet-300 bg-violet-50 px-2 text-[9px] font-black text-violet-700 disabled:opacity-40">현재</button></div></label>
      <label className="text-[10px] font-bold text-muted-foreground">종료(초)<div className="mt-1 flex gap-1"><input type="number" min={0} step={0.1} value={candidate.clipEnd ?? ""} onChange={(event) => update({ clipEnd: event.target.value ? Number(event.target.value) : null })} className="h-9 w-full min-w-0 rounded-lg border border-border px-3 text-xs" /><button type="button" onClick={() => videoRef.current && update({ clipEnd: videoRef.current.currentTime })} disabled={!duration} className="shrink-0 rounded-lg border border-sky-300 bg-sky-50 px-2 text-[9px] font-black text-sky-700 disabled:opacity-40">현재</button></div></label>
      <label className="text-[10px] font-bold text-muted-foreground">화면 처리<select value={candidate.subtitleStrategy} onChange={(event) => update({ subtitleStrategy: event.target.value as Candidate["subtitleStrategy"] })} className="mt-1 h-9 w-full rounded-lg border border-border bg-white px-2 text-xs"><option value="auto">자동 확대</option><option value="crop">강한 크롭</option><option value="blur">하단 블러</option><option value="keep">유지</option></select></label>
      <label className="flex items-end gap-2 pb-2 text-[10px] font-black text-emerald-700"><input type="checkbox" checked={candidate.safetyStatus === "승인"} onChange={(event) => update({ safetyStatus: event.target.checked ? "승인" : "검수 필요" })} /><Check size={12} /> 안전 검수</label>
    </div>
    <div className="mt-2 flex flex-wrap gap-4 text-[10px] font-bold text-muted-foreground"><label className="flex items-center gap-2"><input type="checkbox" checked={candidate.flipKorean} onChange={(event) => update({ flipKorean: event.target.checked })} /> 한국판 좌우반전</label><label className="flex items-center gap-2"><input type="checkbox" checked={candidate.flipJapanese} onChange={(event) => update({ flipJapanese: event.target.checked })} /> 일본판 좌우반전</label></div>
    <label className="mt-3 block text-[10px] font-black text-zinc-700">순위 문구용 장면 설명<textarea value={candidate.notes} onChange={(event) => update({ notes: event.target.value })} placeholder="예: 아기가 할아버지에게 달려가 안기자 할아버지가 놀라며 웃는 장면" className="mt-1.5 min-h-20 w-full resize-y rounded-lg border border-sky-200 bg-sky-50/40 p-3 text-xs font-medium text-zinc-900 outline-none focus:border-sky-500 focus:bg-white" /></label>
    <p className="mt-1 text-[9px] font-bold text-sky-700">입력 내용은 자동 저장되며 ‘순위·장면 문구 편집 → 3. 장면 설명과 순위 제목’에 즉시 연결됩니다.</p>
  </article>;
}

function RankSlotEditor({ rank, selectedIndex, sourceOptions, candidate, sceneCopy, generatingCopy, selectSource, update, generateCopy }: { rank: number; selectedIndex: number; sourceOptions: Array<{ candidate: Candidate; index: number }>; candidate?: Candidate; sceneCopy?: SceneCopy; generatingCopy: boolean; selectSource: (index: number | null) => void; update: (patch: Partial<Candidate>) => void; generateCopy: () => void }) {
  return <article className="rounded-xl border border-violet-200 bg-violet-50/40 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center"><div className="flex h-12 w-24 shrink-0 items-center justify-center rounded-xl bg-violet-700 text-sm font-black text-white">한국 {rank}위</div><div className="min-w-0 flex-1"><label className="text-[10px] font-black text-violet-900">1. 후보 소스 선택<select value={selectedIndex >= 0 ? selectedIndex : ""} onChange={(event) => selectSource(event.target.value === "" ? null : Number(event.target.value))} className="mt-1 h-10 w-full rounded-lg border border-violet-200 bg-white px-3 text-xs"><option value="">후보 폴더 영상 선택</option>{sourceOptions.map(({ candidate: option, index }) => <option key={`${option.localPath}-${index}`} value={index}>{option.sourceTitle}</option>)}</select></label></div><div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-center text-xs font-black text-sky-800">일본 {6 - rank}위 자동</div></div>{candidate && <div className="mt-4 space-y-4"><p className="break-all text-[10px] text-muted-foreground">{candidate.localPath}</p><div><p className="text-[10px] font-black text-zinc-700">2. 장면 설정</p><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><label className="text-[10px] font-bold text-muted-foreground">시작(초)<input type="number" min={0} step={0.1} value={candidate.clipStart} onChange={(event) => update({ clipStart: Number(event.target.value) })} className="mt-1 h-9 w-full rounded-lg border border-border bg-white px-3" /></label><label className="text-[10px] font-bold text-muted-foreground">종료(초)<input type="number" min={0} step={0.1} value={candidate.clipEnd ?? ""} onChange={(event) => update({ clipEnd: event.target.value ? Number(event.target.value) : null })} className="mt-1 h-9 w-full rounded-lg border border-border bg-white px-3" /></label><label className="text-[10px] font-bold text-muted-foreground">화면 처리<select value={candidate.subtitleStrategy} onChange={(event) => update({ subtitleStrategy: event.target.value as Candidate["subtitleStrategy"] })} className="mt-1 h-9 w-full rounded-lg border border-border bg-white px-2"><option value="auto">자동 확대</option><option value="crop">강한 크롭</option><option value="blur">하단 블러</option><option value="keep">유지</option></select></label><label className="flex items-end gap-2 pb-2 text-[10px] font-black text-emerald-700"><input type="checkbox" checked={candidate.safetyStatus === "승인"} onChange={(event) => update({ safetyStatus: event.target.checked ? "승인" : "검수 필요" })} /> 안전 검수</label></div><div className="mt-2 flex flex-wrap gap-4 text-[10px] font-bold text-muted-foreground"><label className="flex items-center gap-2"><input type="checkbox" checked={candidate.flipKorean} onChange={(event) => update({ flipKorean: event.target.checked })} /> 한국판 좌우반전</label><label className="flex items-center gap-2"><input type="checkbox" checked={candidate.flipJapanese} onChange={(event) => update({ flipJapanese: event.target.checked })} /> 일본판 좌우반전</label></div></div><div><div className="flex items-center justify-between gap-2"><div><p className="text-[10px] font-black text-zinc-700">3. 장면 설명과 순위 제목</p><p className="mt-0.5 text-[9px] font-bold text-sky-700">상단 전체 문구 추천에서 일괄 생성되며, 아래 버튼은 이 장면만 다시 만듭니다.</p></div><button onClick={generateCopy} disabled={generatingCopy} className="inline-flex h-8 items-center gap-1 rounded-md bg-sky-700 px-3 text-[10px] font-black text-white disabled:opacity-50">{generatingCopy ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} 이 장면 후보 다시 생성</button></div><textarea value={candidate.notes} onChange={(event) => update({ notes: event.target.value })} className="mt-2 min-h-20 w-full rounded-lg border border-sky-200 bg-white p-3 text-xs" placeholder="원본 편집에서 입력하거나 여기서 바로 수정하세요." />{sceneCopy && <div className="mt-3 grid gap-3 lg:grid-cols-2"><div><p className="text-[10px] font-black text-emerald-800">한국어 후보</p><div className="mt-2 grid gap-2 sm:grid-cols-3">{sceneCopy.koreanSuggestions.map((item) => <button key={item.korean} onClick={() => update({ koreanLabel: item.korean.replace(/\s/g, "").slice(0, 6) })} className="rounded-lg border border-emerald-200 bg-white p-2 text-left text-xs font-black hover:border-emerald-500">{item.korean}</button>)}</div></div><div><p className="text-[10px] font-black text-sky-800">일본어 후보</p><div className="mt-2 grid gap-2 sm:grid-cols-3">{sceneCopy.suggestions.map((item) => <button key={item.japanese} onClick={() => update({ japaneseLabel: item.japanese, japaneseTranslation: item.korean })} className="rounded-lg border border-sky-200 bg-white p-2 text-left hover:border-sky-500"><span className="block text-xs font-black">{item.japanese}</span><span className="text-[9px] text-muted-foreground">{item.korean}</span></button>)}</div></div></div>}<div className="mt-3 grid gap-2 md:grid-cols-2"><label className="text-[10px] font-black">한국판 제목 (최대 6글자)<input value={candidate.koreanLabel} onChange={(event) => update({ koreanLabel: event.target.value.replace(/\s/g, "").slice(0, 6) })} maxLength={6} className="mt-1 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" /></label><label className="text-[10px] font-black">일본판 제목<input value={candidate.japaneseLabel} onChange={(event) => update({ japaneseLabel: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" /></label></div></div></div>}</article>;
}

function TemplatePanel({ locale, title, translation, setTitle, candidates }: { locale: "ko" | "ja"; title: string; translation?: string; setTitle: (value: string) => void; candidates: Candidate[] }) {
  const rankKey = locale === "ko" ? "koreanRank" : "japaneseRank";
  const labelKey = locale === "ko" ? "koreanLabel" : "japaneseLabel";
  const active = candidates.find((candidate) => candidate[rankKey] === 5) || candidates[0];
  const ordered = candidates.filter((candidate) => candidate[rankKey]).sort((a, b) => Number(a[rankKey]) - Number(b[rankKey]));
  const titleParts = title.split(/[｜|\n]/);
  return <div className="rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-bold">{locale === "ko" ? "한국판 템플릿" : "일본판 템플릿"}</h2><p className="mt-1 text-xs text-muted-foreground">{locale === "ko" ? "강아지 로고 · 컬러 순위 · 비활성 50%" : "고양이 로고 · 흰색 순위 · 현재 빨간 밑줄"}</p></div><WandSparkles size={19} className={locale === "ko" ? "text-violet-600" : "text-sky-600"} /></div><input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-4 h-11 w-full rounded-xl border border-border px-3 text-sm font-bold" />{locale === "ja" && <p className="mt-2 text-xs text-muted-foreground">한국어 번역: {translation || "STEP 5에서 자동 입력"}</p>}
    <div className="relative mx-auto mt-4 aspect-[9/16] max-h-[560px] overflow-hidden rounded-2xl bg-black text-white shadow-lg [container-type:inline-size]">
      <div className="absolute inset-x-0 top-0 h-[19.79%] bg-black" />
      <div className="absolute inset-x-0 bottom-0 top-[19.79%] overflow-hidden bg-gradient-to-b from-stone-300 via-amber-100 to-stone-400"><div className="absolute inset-0 scale-110 bg-gradient-to-br from-amber-100/90 via-sky-200/70 to-rose-200/90 blur-xl" /><div className="absolute inset-[9%_17%] rounded-2xl bg-white/55 shadow-xl" />{!active && <p className="absolute inset-x-5 bottom-6 text-center text-xs font-bold">후보를 추가하면 미리보기가 표시됩니다</p>}</div>
      <Image src={locale === "ko" ? "/shorts-family/logo-korea-dog.png" : "/shorts-family/logo-japan-cat.png"} alt="template logo" width={56} height={56} className="absolute left-[4.44%] top-[1.88%] w-[10.37%] aspect-square object-contain" />
      {locale === "ko"
        ? titleParts[1] ? <>
            <p className="absolute inset-x-[12%] top-[3.1%] text-center text-[5.5cqw] font-black leading-tight text-yellow-300">{titleParts[0]}</p>
            <p className="absolute inset-x-0 top-[8.2%] text-center text-[6.8cqw] font-black leading-tight text-white">{titleParts[1].replace(/TOP\s*5/i, "")}<span className="text-fuchsia-500">TOP5</span></p>
            {titleParts[2] && <p className="absolute inset-x-[8%] top-[14.5%] text-center text-[3.2cqw] font-black leading-tight text-white">{titleParts[2]}</p>}
          </> : <p className="absolute inset-x-0 top-[7.55%] text-center text-[7.04cqw] font-black leading-tight text-violet-300">{title}</p>
        : <>
            <p className={`absolute inset-x-[10%] text-center font-black leading-tight text-white [text-shadow:0_0_8px_#38bdf8] ${titleParts[2] ? "top-[3.4%] text-[4.8cqw]" : titleParts[1] ? "top-[5.47%] text-[5.56cqw]" : "top-[7.55%] text-[7.04cqw]"}`}>{titleParts[0]}</p>
            {titleParts[1] && <p className={`absolute inset-x-[6%] text-center font-black leading-tight text-yellow-300 [text-shadow:0_0_6px_#e11d48] ${titleParts[2] ? "top-[8.4%] text-[5.2cqw]" : "top-[9.64%] text-[6.11cqw]"}`}>{titleParts[1]}</p>}
            {titleParts[2] && <p className="absolute inset-x-[8%] top-[14.5%] text-center text-[3.2cqw] font-black leading-tight text-white">{titleParts[2]}</p>}
          </>}
      {ordered.map((candidate) => { const rank = Number(candidate[rankKey]); const colors = ["#ef4444", "#f59e0b", "#a3e635", "#22c55e", "#818cf8"]; const current = rank === 5; const top = (455 + (rank - 1) * 72) / 1920 * 100; return <p key={`${locale}-${rank}`} style={{ top: `${top}%`, color: locale === "ko" ? colors[rank - 1] : "white", opacity: current ? 1 : locale === "ko" ? 0.5 : 0.32 }} className={`absolute left-[4.17%] font-black [text-shadow:1px_1px_2px_#000] ${current ? "text-[4.44cqw]" : "text-[3.98cqw]"} ${locale === "ja" && current ? "border-b-4 border-red-500" : ""}`}>{rank}. {String(candidate[labelKey])}</p>; })}
    </div>
    <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]"><span className="rounded-lg bg-muted p-2 text-center font-bold"><Play size={13} className="mx-auto mb-1" />5→1 재생</span><span className="rounded-lg bg-muted p-2 text-center font-bold"><Sparkles size={13} className="mx-auto mb-1" />명도·채도 보정</span><span className="rounded-lg bg-muted p-2 text-center font-bold"><ChevronRight size={13} className="mx-auto mb-1" />암전 전환</span></div></div>;
}

function FamilyProjectListView() {
  const supabase = useMemo(() => createClient(), []);
  const [projects, setProjects] = useState<Array<Project & { stageLabel: string; progress: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (active) setLoading(false); return; }
      const { data: projectRows } = await supabase.from("projects").select("id, title, status, updated_at")
        .eq("production_type", productionTypes.shortsHaejja).order("updated_at", { ascending: false });
      if (!active) return;
      const rows = (projectRows ?? []) as Project[];
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) { setProjects([]); setLoading(false); return; }
      const [configsRes, candidatesRes] = await Promise.all([
        supabase.from("shorts_family_configs").select("project_id, korean_title").in("project_id", ids),
        supabase.from("shorts_family_candidates").select("project_id, local_path, korean_rank").in("project_id", ids),
      ]);
      if (!active) return;
      const configByProject = new Map((configsRes.data ?? []).map((row) => [row.project_id, row]));
      const countsByProject = new Map<number, { staged: number; ranked: number }>();
      for (const row of candidatesRes.data ?? []) {
        const entry = countsByProject.get(row.project_id) || { staged: 0, ranked: 0 };
        if (/[\\/]01-candidates[\\/]/i.test(row.local_path || "")) entry.staged += 1;
        if (row.korean_rank) entry.ranked += 1;
        countsByProject.set(row.project_id, entry);
      }
      setProjects(rows.map((row) => {
        const config = configByProject.get(row.id);
        const counts = countsByProject.get(row.id) || { staged: 0, ranked: 0 };
        const hasTitle = Boolean(config?.korean_title && config.korean_title !== initialConfig.korean_title);
        const { label, progress } = familyStageInfo(counts.staged, counts.ranked, hasTitle);
        return { ...row, stageLabel: label, progress };
      }));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [supabase]);

  return <div className="mx-auto max-w-6xl space-y-6">
    <section className="overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-rose-50 p-6 shadow-sm sm:p-8"><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="mb-3 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800"><Baby size={14} /> 숏폼(가족)</div><h1 className="text-3xl font-bold tracking-tight">랭킹형쇼츠 제작 스튜디오</h1><p className="mt-2 text-sm text-muted-foreground">발굴부터 Premiere 제작까지 프로젝트별로 이어서 관리합니다.</p></div><Link href="/studio/shorts-family?stage=discover" className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-amber-700"><Plus size={16} /> 새 프로젝트 발굴</Link></div></section>

    {loading ? <div className="flex min-h-56 items-center justify-center rounded-2xl border border-border bg-white"><Loader2 className="animate-spin text-amber-600" /></div>
      : projects.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white px-6 text-center"><FolderKanban size={34} className="text-muted-foreground/40" /><p className="mt-3 font-bold">아직 프로젝트가 없습니다</p><p className="mt-1 text-sm text-muted-foreground">랭킹형 발굴에서 -ra 레퍼런스를 고르고 프로젝트를 만들면 여기 표시됩니다.</p></div>
        : <div className="grid gap-3 md:grid-cols-3">{projects.map((project) => <FamilyProjectCard key={project.id} project={project} />)}</div>}
  </div>;
}

function FamilyProjectCard({ project }: { project: Project & { stageLabel: string; progress: number } }) {
  return <Link href={`/studio/shorts-family?project_id=${project.id}&stage=setup`} className="block rounded-2xl border border-border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-md">
    <h3 className="truncate text-base font-bold">{project.title}</h3>
    <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 size={13} />{formatDate(project.updated_at)}</div>
    <div className="mt-4"><div className="mb-2 flex items-center justify-between text-xs"><span className="font-semibold text-muted-foreground">{project.stageLabel}</span><span className="font-bold text-amber-700">{project.progress}%</span></div><div className="flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-amber-600" style={{ width: `${project.progress}%` }} /></div><ArrowRight size={15} className="text-muted-foreground" /></div></div>
  </Link>;
}

function ShortsFamilyRouter() {
  const searchParams = useSearchParams();
  if (!searchParams.get("project_id") && !searchParams.get("stage")) return <FamilyProjectListView />;
  return <ShortsFamilyWorkspace />;
}

export default function ShortsFamilyPage() {
  return <Suspense fallback={<div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-amber-600" /></div>}><ShortsFamilyRouter /></Suspense>;
}
