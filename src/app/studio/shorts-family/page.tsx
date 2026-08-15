"use client";

import Image from "next/image";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Baby, Check, ChevronRight, Download, ExternalLink, FileVideo2, FolderOpen,
  Eye, GripVertical, Loader2, PackageCheck, PauseCircle, Play, Plus, RefreshCw, Save, Scissors,
  ShieldCheck, Sparkles, Trash2, WandSparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { productionTypes } from "@/lib/project-workflows";

const HELPER = "http://localhost:8787";
const CATEGORY = "4.아기&가족";

type ResearchSource = { id: number; title: string | null; url: string; memo: string | null; category: string };
type LibraryFile = { name: string; path: string; rankingReference: boolean; duration: number | null; width: number | null; height: number | null; size: number; modifiedAt: string };
type Project = { id: number; title: string; status: string | null; updated_at: string | null };
type Config = {
  project_id: number; project_code: string; reference_source_id: number | null; reference_path: string | null;
  korean_title: string; japanese_title: string; japanese_title_translation: string; target_duration: number; segment_count: number; status: string;
};
type ReviewState = "pending" | "selected" | "deferred" | "deleted";
type DiscoveryVideo = {
  videoId: string; url: string; title: string; channelName: string; publishedAt: string; ageDays: number; viewCount: number;
  viewsPerHour: number; durationSeconds: number; thumbnailUrl: string; qualified: boolean; referenceChannel: boolean; reason: string; score: number;
};
type SourceMatch = { url: string; title: string; platform: string; confidence: number; visualMatch?: number; publishedAt?: string | null; reason: string; thumbnail?: string | null; matchStartSeconds?: number; verificationStatus?: "verified" | "visual_evidence" | "unverified" };
type PlanningEntry = { index: number; korean_label: string; japanese_label: string; japanese_korean: string; material: string; emotion: string; cause: string; korean_rank: number | null; japanese_rank: number | null };
type PlanningResult = { korean_title: string; japanese_title: string; japanese_title_korean: string; korean_title_candidates: string[]; japanese_title_candidates: Array<{ japanese: string; korean: string }>; concept: string; overall_emotion: string; entries: PlanningEntry[] };
type LocalAnalysis = { index: number; jobId: string; description: string; ocr: string[]; watermarks: string[]; language: string; queries: string[] };
type SceneCopy = { japaneseDescription: string; koreanSuggestions: Array<{ korean: string; tone: string }>; suggestions: Array<{ japanese: string; korean: string; tone: string }> };
type Candidate = {
  id?: string; sourceTitle: string; sourceUrl: string; localPath: string; sourceKind: "reference_split" | "library" | "original_found";
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

function isRankingTitle(title: string | null) {
  return /(^|[\s_\-()[\]{}])ㄹ(?=$|[\s_\-()[\]{}])/u.test(title || "");
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
    referenceRank: null, clipStart: 0, clipEnd: file.duration, koreanLabel: `후보${index + 1}`.slice(0, 4),
    japaneseLabel: `候補${index + 1}`, koreanRank, japaneseRank: koreanRank ? 6 - koreanRank : null,
    flipKorean: index === 1 || index === 3, flipJapanese: index === 0 || index === 4,
    subtitleStrategy: "auto", safetyStatus: "검수 필요", notes: "",
  };
}

function ShortsFamilyWorkspace() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const requestedStage = searchParams.get("stage") || "discover";
  const workspaceStage = requestedStage === "discover" ? "discover" : "setup";
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [sources, setSources] = useState<ResearchSource[]>([]);
  const [library, setLibrary] = useState<LibraryFile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [config, setConfig] = useState<Omit<Config, "project_id"> | Config>(initialConfig);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [helperOnline, setHelperOnline] = useState(false);
  const [databaseReady, setDatabaseReady] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [discoveryVideos, setDiscoveryVideos] = useState<DiscoveryVideo[]>([]);
  const [sourceMatches, setSourceMatches] = useState<Record<number, SourceMatch[]>>({});
  const [sourceReview, setSourceReview] = useState<Record<string, ReviewState>>({});
  const [discoveryReview, setDiscoveryReview] = useState<Record<string, ReviewState>>({});
  const [viewedUrls, setViewedUrls] = useState<Record<string, boolean>>({});
  const [lastViewedUrl, setLastViewedUrl] = useState("");
  const [downloadedPaths, setDownloadedPaths] = useState<Record<number, string>>({});
  const [matchTitles, setMatchTitles] = useState<Record<string, string>>({});
  const [traceProgress, setTraceProgress] = useState<{ step: number; label: string } | null>(null);
  const [sceneCopies, setSceneCopies] = useState<Record<number, SceneCopy>>({});
  const [planning, setPlanning] = useState<PlanningResult | null>(null);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryTargetIndex, setLibraryTargetIndex] = useState<number | null>(null);
  const [selectedLibraryPath, setSelectedLibraryPath] = useState("");
  const [localVision, setLocalVision] = useState({ online: false, modelReady: false, model: "gemma4:e2b-it-qat" });

  const recommendedLibrary = useMemo(() => library.filter((file) => !file.rankingReference).map((file) => ({
    ...file, recommendationScore: libraryQuery ? titleSimilarity(file.name, libraryQuery) : 0,
  })).filter((file) => !libraryQuery || file.name.toLocaleLowerCase().includes(libraryQuery.toLocaleLowerCase()) || file.recommendationScore > 0)
    .sort((left, right) => right.recommendationScore - left.recommendationScore || right.modifiedAt.localeCompare(left.modifiedAt)), [library, libraryQuery]);
  const stagedCandidateIndexes = useMemo(() => candidates.map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => /[\\/]01-candidates[\\/]/i.test(candidate.localPath)), [candidates]);
  const downloadsReady = stagedCandidateIndexes.length >= 5;

  const callHelper = useCallback(async <T,>(path: string, options?: RequestInit): Promise<T> => {
    const response = await fetch(`${HELPER}${path}`, options);
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "로컬 도우미 요청에 실패했습니다.");
    return payload as T;
  }, []);

  const refreshLibrary = useCallback(async () => {
    try {
      const health = await fetch(`${HELPER}/health`);
      setHelperOnline(health.ok);
      if (!health.ok) return;
      const payload = await callHelper<{ files: LibraryFile[] }>("/shorts-family/library");
      setLibrary(payload.files);
      const vision = await callHelper<{ online: boolean; modelReady: boolean; model: string }>("/shorts-family/local-vision-status");
      setLocalVision(vision);
    } catch {
      setHelperOnline(false);
    }
  }, [callHelper]);

  const loadBaseData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [sourceRes, projectRes] = await Promise.all([
      supabase.from("research_sources").select("id, title, url, memo, category").eq("category", CATEGORY).order("created_at", { ascending: false }),
      supabase.from("projects").select("id, title, status, updated_at").eq("production_type", productionTypes.shortsHaejja).order("updated_at", { ascending: false }),
    ]);
    setSources((sourceRes.data ?? []) as ResearchSource[]);
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
    const root = workspaceRef.current;
    if (!root || requestedStage === "discover") return;
    const classify = (text: string) => text.includes("작업 프로젝트") || text.includes("레퍼런스 장면 분리") || text.includes("보유 소스 가져오기") ? "setup"
      : text.includes("전체 장면 원본 추적") ? "trace"
        : text.includes("순위·장면·제목 편집") || text.includes("AI 기획안") || text.includes("한국판 템플릿") || text.includes("일본판 템플릿") || text.includes("템플릿 기능이 만드는 것") ? "template"
          : text.includes("초벌 영상과 Premiere") || text.includes("최종 제작 전 사용자 검수") ? "premiere" : "common";
    root.querySelectorAll<HTMLElement>("section").forEach((section) => {
      const stage = classify(section.textContent || "");
      section.hidden = stage !== "common" && stage !== requestedStage;
    });
  }, [requestedStage, candidates.length, planning]);

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
      if (configRes.data) {
        const row = configRes.data;
        setConfig({
          project_id: row.project_id, project_code: row.project_code, reference_source_id: row.reference_source_id,
          reference_path: row.reference_path || "", korean_title: row.korean_title, japanese_title: row.japanese_title,
          japanese_title_translation: row.japanese_title_translation || "",
          target_duration: row.target_duration, segment_count: row.segment_count, status: row.status,
        });
        setDiscoveryVideos(Array.isArray(row.discovery_results) ? (row.discovery_results as DiscoveryVideo[]).slice(0, 20) : []);
        setPlanning(row.planning_result && typeof row.planning_result === "object" ? row.planning_result as PlanningResult : null);
      }
      setCandidates((candidatesRes.data ?? []).map((row) => ({
        id: row.id, sourceTitle: row.source_title, sourceUrl: row.source_url || "", localPath: row.local_path || "",
        sourceKind: row.source_kind, referenceRank: row.reference_rank, clipStart: Number(row.clip_start || 0),
        clipEnd: row.clip_end === null ? null : Number(row.clip_end), koreanLabel: row.korean_label,
        japaneseLabel: row.japanese_label, koreanRank: row.korean_rank, japaneseRank: row.korean_rank ? 6 - row.korean_rank : null,
        flipKorean: row.flip_korean, flipJapanese: row.flip_japanese, subtitleStrategy: row.subtitle_strategy,
        safetyStatus: row.safety_status, notes: row.notes,
        material: row.material || "", emotion: row.emotion || "", viralCause: row.viral_cause || "", japaneseTranslation: row.japanese_translation || "",
      })));
    })();
    return () => { active = false; };
  }, [projectId, supabase]);

  async function createProject() {
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
    } catch (error) { setMessage(error instanceof Error ? error.message : "프로젝트 생성 실패"); }
    finally { setBusy(null); }
  }

  async function downloadSource(source: ResearchSource) {
    setBusy(`download-${source.id}`); setMessage("");
    try {
      const result = await callHelper<{ filename: string }>("/shorts-family/download", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: source.url, title: source.title || "제목없음" }),
      });
      setMessage(`${result.filename} 저장 완료`);
      await refreshLibrary();
    } catch (error) { setMessage(error instanceof Error ? error.message : "다운로드 실패"); }
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
      await refreshLibrary();
      setMessage(`${result.filename}을 레퍼런스로 선택했습니다. 프로젝트 생성 후 자동 분리를 누르세요.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "레퍼런스 저장 실패"); }
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
        referenceRank: item.referenceRank, clipStart: 0, clipEnd: item.duration,
        koreanLabel: `장면${index + 1}`.slice(0, 4), japaneseLabel: `シーン${index + 1}`,
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
    const file = library.find((item) => item.path === selectedLibraryPath);
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
    const file = library.find((item) => item.path === selectedLibraryPath);
    if (!file) return setMessage("먼저 보유 소스를 선택해주세요.");
    if (libraryTargetIndex === null || !candidates[libraryTargetIndex]) return setMessage("교체할 기존 후보를 선택해주세요.");
    const targetIndex = libraryTargetIndex;
    const previous = candidates[targetIndex];
    setBusy("stage-library");
    try {
      const staged = await callHelper<{ path: string; filename: string; folder: string }>("/shorts-family/stage-candidate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectCode: config.project_code, filePath: file.path, title: file.name.replace(/\.[^.]+$/, ""), index: targetIndex + 1 }),
      });
      updateCandidate(targetIndex, { sourceTitle: file.name.replace(/\.[^.]+$/, ""), localPath: staged.path, sourceUrl: "", sourceKind: "library", clipStart: 0,
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
      const response = await fetch("/api/shorts-family/scene-copy", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description }), signal: AbortSignal.timeout(60000),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "한·일 제목 추천 생성 실패");
      setSceneCopies((current) => ({ ...current, [index]: { japaneseDescription: payload.japaneseDescription, koreanSuggestions: payload.koreanSuggestions || [], suggestions: payload.suggestions || [] } }));
      setMessage(`${index + 1}번 한국어·일본어 제목 후보를 각각 3개 만들었습니다.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "장면 설명 생성 실패"); }
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
        japanese_title_translation: config.japanese_title_translation, discovery_results: discoveryVideos, planning_result: planning,
        target_duration: config.target_duration, segment_count: config.segment_count, status: config.status,
        updated_at: new Date().toISOString(),
      };
      const { error: configError } = await supabase.from("shorts_family_configs").upsert(configValues);
      if (configError) throw configError;
      const { error: deleteError } = await supabase.from("shorts_family_candidates").delete().eq("project_id", projectId);
      if (deleteError) throw deleteError;
      if (candidates.length) {
        const rows = candidates.map((candidate) => ({
          project_id: projectId, user_id: user.id, source_title: candidate.sourceTitle, source_url: candidate.sourceUrl || null,
          local_path: candidate.localPath, source_kind: candidate.sourceKind, reference_rank: candidate.referenceRank,
          clip_start: candidate.clipStart, clip_end: candidate.clipEnd, korean_label: candidate.koreanLabel.replace(/\s/g, "").slice(0, 4),
          japanese_label: candidate.japaneseLabel, korean_rank: candidate.koreanRank, japanese_rank: candidate.japaneseRank,
          flip_korean: candidate.flipKorean, flip_japanese: candidate.flipJapanese,
          subtitle_strategy: candidate.subtitleStrategy, safety_status: candidate.safetyStatus, notes: candidate.notes,
          japanese_translation: candidate.japaneseTranslation || "", material: candidate.material || "", emotion: candidate.emotion || "", viral_cause: candidate.viralCause || "",
        }));
        const { error } = await supabase.from("shorts_family_candidates").insert(rows);
        if (error) throw error;
      }
  }

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
    setBusy("package"); setMessage("한국판·일본판 초벌 영상과 Premiere 패키지를 만드는 중입니다. 몇 분 걸릴 수 있습니다.");
    try {
      await persistAll();
      const result = await callHelper<{ projectRoot: string }>("/shorts-family/package", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectCode: config.project_code, koreanTitle: config.korean_title, japaneseTitle: config.japanese_title,
          targetDuration: config.target_duration, renderPreview: true, candidates,
        }),
      });
      setMessage(`제작 패키지 완료: ${result.projectRoot}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "패키지 생성 실패"); }
    finally { setBusy(null); }
  }

  async function openProjectFolder() {
    try {
      await callHelper("/shorts-family/open-folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectCode: config.project_code }) });
    } catch (error) { setMessage(error instanceof Error ? error.message : "폴더 열기 실패"); }
  }

  async function investigateCandidate(candidate: Candidate, index: number) {
    setBusy(`investigate-${index}`);
    setMessage(`${index + 1}번 장면을 분석해 YouTube·웹의 원본 후보를 찾고 있습니다.`);
    try {
      const analysis = await callHelper<{ jobId: string; sourceUrl: string; title: string; uploader?: string; uploadDate?: string }>("/investigate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: candidate.localPath, openFolder: false }),
      });
      const response = await fetch("/api/source-finder/discover", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          jobId: analysis.jobId, inputUrl: analysis.sourceUrl, inputTitle: analysis.title, inputUploader: analysis.uploader, inputUploadDate: analysis.uploadDate,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "원본 후보 검색에 실패했습니다.");
      const searched = (result.candidates || []).slice(0, 12) as SourceMatch[];
      let matched = searched;
      if (searched.length > 0) {
        setMessage(`후보 ${searched.length}개를 내려받아 ${index + 1}번 장면과 프레임 단위로 대조하고 있습니다.`);
        const verification = await callHelper<{ results: Array<{ url: string; ok: boolean; score: number; matchedFrames: number; bestSimilarity: number; matchStartSeconds?: number; templatePenalty?: number; overlayBlackRatio?: number }> }>("/verify-candidates", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: analysis.jobId, urls: searched.map((item) => item.url) }),
        });
        const scores = new Map(verification.results.map((item) => [item.url, item]));
        matched = searched.map((item) => {
          const score = scores.get(item.url);
          const titlePenalty = rankingRepostPenalty(item.title);
          return score?.ok ? { ...item, confidence: Math.max(0, score.score - titlePenalty), matchStartSeconds: score.matchStartSeconds, reason: `실제 영상에서 ${score.matchedFrames}개 프레임 일치·최고 유사도 ${score.bestSimilarity}%.${score.templatePenalty ? ` 상단 검은 템플릿 비율 ${score.overlayBlackRatio}%로 ${score.templatePenalty}점 감점.` : ""}${titlePenalty ? ` 랭킹·모음형 제목으로 ${titlePenalty}점 추가 감점.` : ""} ${item.reason}` } : { ...item, confidence: 0 };
        }).filter((item) => item.confidence >= 55).sort((left, right) => right.confidence - left.confidence).slice(0, 6);
      }
      setSourceMatches((current) => ({ ...current, [index]: matched }));
      setMessage(matched.length ? `${index + 1}번 장면과 실제 영상이 일치한 원본 후보 ${matched.length}개만 남겼습니다.` : `${index + 1}번 장면과 실제로 일치하는 원본을 찾지 못했습니다. 보유 영상으로 채워주세요.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "원본 조사 실패"); }
    finally { setBusy(null); }
  }

  async function acceptOriginalMatch(index: number, match: SourceMatch, editedTitle?: string) {
    setBusy(`original-${index}`); setMessage("원본 영상을 후보 폴더로 바로 다운로드하고 있습니다.");
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
      updateCandidate(index, { localPath: staged.path, sourceUrl: match.url, sourceTitle: chosenTitle, sourceKind: "original_found", clipStart: matchedStart, clipEnd: matchedStart + previousDuration, notes: `원본 후보 신뢰도 ${match.confidence}% · ${matchedStart}초 부근 자동 매칭, 직접 검수 필요` });
      reviewSource(match.url, "selected");
      setDownloadedPaths((current) => ({ ...current, [index]: staged.path }));
      setMessage(`${index + 1}번 원본 다운로드 완료: ${staged.path}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "원본 다운로드 실패"); }
    finally { setBusy(null); }
  }

  async function generatePlanning() {
    if (!downloadsReady) return setMessage("후보 폴더에 원본 영상 5개 이상을 먼저 다운로드해주세요.");
    const planningCandidates = stagedCandidateIndexes.slice(0, 7);
    setBusy("planning"); setMessage("각 장면을 분석해 전체 제목 후보와 한·일 역순 순위를 만들고 있습니다.");
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
      const plan: PlanningResult = {
        ...rawPlan,
        korean_title_candidates: (rawPlan.korean_title_candidates || [rawPlan.korean_title]).filter(Boolean).slice(0, 3),
        japanese_title_candidates: (rawPlan.japanese_title_candidates || [{ japanese: rawPlan.japanese_title, korean: rawPlan.japanese_title_korean }]).filter((item) => item?.japanese).slice(0, 3),
        entries: rawPlan.entries.map((entry) => ({ ...entry, japanese_rank: entry.korean_rank ? 6 - entry.korean_rank : null })),
      };
      setPlanning(plan);
      setConfig({ ...config, korean_title: plan.korean_title, japanese_title: plan.japanese_title, japanese_title_translation: plan.japanese_title_korean });
      setCandidates((current) => current.map((candidate, index) => {
        const planningIndex = planningCandidates.findIndex((item) => item.index === index);
        const entry = planningIndex >= 0 ? plan.entries.find((item) => Number(item.index) === planningIndex + 1) : undefined;
        return entry ? { ...candidate, koreanLabel: entry.korean_label.replace(/\s/g, "").slice(0, 4), japaneseLabel: entry.japanese_label,
          koreanRank: entry.korean_rank, japaneseRank: entry.korean_rank ? 6 - entry.korean_rank : null, material: entry.material, emotion: entry.emotion,
          viralCause: entry.cause, japaneseTranslation: entry.japanese_korean } : { ...candidate, koreanRank: null, japaneseRank: null };
      }));
      setMessage("한·일 제목과 순위 기획안을 적용했습니다. 한국어 번역과 장면 분석을 읽고 수정한 뒤 저장하세요.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "AI 기획안 생성 실패"); }
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

  return <div ref={workspaceRef} className="mx-auto max-w-7xl space-y-6">
    <section className="overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-rose-50 p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"><div><div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800"><Baby size={15} /> 랭킹형쇼츠 자동화</div><h1 className="mt-4 text-3xl font-black tracking-tight">숏폼(가족)</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">검증된 -ra 영상을 분리하고 후보 7개를 구성해 한국판·일본판을 서로 다른 순서로 제작합니다.</p></div><div className="flex items-center gap-3"><Image src="/shorts-family/logo-korea-dog.png" alt="한국판 강아지 로고" width={84} height={84} className="h-20 w-20 object-contain" /><Image src="/shorts-family/logo-japan-cat.png" alt="일본판 고양이 로고" width={84} height={84} className="h-20 w-20 object-contain" /></div></div>
      <div className="mt-6 flex flex-wrap items-center gap-2 text-xs font-bold"><span className={`rounded-full px-3 py-1.5 ${helperOnline ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{helperOnline ? "로컬 도우미 연결됨" : "npm run dev로 도우미를 시작하세요"}</span><span className="rounded-full bg-white px-3 py-1.5 text-muted-foreground">Premiere Pro 2026</span><span className="rounded-full bg-white px-3 py-1.5 text-muted-foreground">1080×1920 · 20~50초</span></div>
    </section>

    {!databaseReady && <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><b>데이터베이스 준비가 필요합니다.</b> `supabase/migrations/20260812_shorts_family_foundation.sql`을 Supabase에 적용한 뒤 새로고침해주세요.</section>}
    {message && <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{message}</section>}
    {workspaceStage === "discover" && <div className="contents">

    <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-xs font-black text-violet-700">STEP 1</div><h2 className="mt-1 font-bold">YouTube 전체에서 검증된 랭킹형쇼츠 발굴</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">특정 채널에 한정하지 않고 영어·일본어 가족/아기/어린이 랭킹 검색을 합칩니다. 1,000만 조회 이상 또는 게시 7일 이내 300만 이상만 남기고 조회 속도로 정렬합니다.</p></div><button onClick={discoverRankingShorts} disabled={Boolean(busy)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-40">{busy === "discover" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} YouTube 전체 발굴</button></div>
      {discoveryVideos.some((video) => discoveryReview[video.videoId] !== "deleted") && <div className="mt-4 grid max-h-[620px] gap-3 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">{discoveryVideos.filter((video) => discoveryReview[video.videoId] !== "deleted").slice(0, 20).map((video, index) => <DiscoveryCard key={video.videoId} video={video} index={index} review={discoveryReview[video.videoId] || "pending"} viewed={Boolean(viewedUrls[video.url])} active={lastViewedUrl === video.url} busy={busy === `reference-${video.videoId}`} disabled={!helperOnline || Boolean(busy)} onOpen={() => markViewed(video.url)} onSelect={() => chooseDiscoveredReference(video)} onReview={(state) => setDiscoveryReview((current) => ({ ...current, [video.videoId]: state }))} />)}</div>}
    </section></div>}

    {workspaceStage === "setup" && <div className="contents"><section className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><div className="text-xs font-black text-amber-700">STEP 2</div><h2 className="mt-1 font-bold">작업 프로젝트</h2><p className="mt-1 text-xs text-muted-foreground">선택한 레퍼런스를 담을 제작 폴더입니다.</p></div><button onClick={createProject} disabled={Boolean(busy)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-bold text-white disabled:opacity-50">{busy === "create" ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} 새 프로젝트</button></div>
        <select value={projectId || ""} onChange={(event) => setProjectId(Number(event.target.value) || null)} className="mt-4 h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"><option value="">프로젝트 선택</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select>
        <label className="mt-3 block text-xs font-bold text-muted-foreground">프로젝트 코드<input value={config.project_code} onChange={(event) => setConfig({ ...config, project_code: event.target.value })} className="mt-1.5 h-10 w-full rounded-xl border border-border px-3 text-sm text-foreground" /></label>
        <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs font-bold text-muted-foreground">목표 길이<input type="number" min={20} max={50} value={config.target_duration} onChange={(event) => setConfig({ ...config, target_duration: Number(event.target.value) })} className="mt-1.5 h-10 w-full rounded-xl border border-border px-3 text-foreground" /></label><label className="text-xs font-bold text-muted-foreground">분리 개수<select value={config.segment_count} onChange={(event) => setConfig({ ...config, segment_count: Number(event.target.value) })} className="mt-1.5 h-10 w-full rounded-xl border border-border bg-white px-3 text-foreground">{[5, 6, 7].map((count) => <option key={count}>{count}</option>)}</select></label></div>
      </div>

      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><div className="text-xs font-black text-amber-700">STEP 2</div><h2 className="mt-1 font-bold">-ra 레퍼런스 장면 분리</h2><p className="mt-1 text-xs text-muted-foreground">랭킹 영상 안의 장면 변화와 순위 간격으로 5~7개 소스를 분류합니다.</p></div><button onClick={refreshLibrary} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="폴더 새로고침"><RefreshCw size={16} /></button></div>
        <select value={config.reference_path || ""} onChange={(event) => setConfig({ ...config, reference_path: event.target.value })} className="mt-4 h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"><option value="">-ra 영상 선택</option>{library.filter((file) => file.rankingReference).map((file) => <option key={file.path} value={file.path}>{file.name} · {formatDuration(file.duration)}</option>)}</select>
        <button onClick={splitReference} disabled={!projectId || !config.reference_path || Boolean(busy)} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 text-sm font-bold text-white disabled:opacity-40">{busy === "split" ? <Loader2 size={16} className="animate-spin" /> : <Scissors size={16} />} 자동 분리하고 후보 만들기</button>
      </div>
    </section>

    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-bold">보유 소스 가져오기 · {CATEGORY}</h2><p className="mt-1 text-xs text-muted-foreground">원본을 못 찾은 자리는 게시판과 보유 영상으로 채웁니다. 독립된 ㄹ은 -ra로 저장됩니다.</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">{sources.length}개</span></div>
      <div className="mt-4 grid max-h-80 gap-2 overflow-y-auto md:grid-cols-2">{sources.map((source) => <article key={source.id} className="flex items-center gap-3 rounded-xl border border-border p-3"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isRankingTitle(source.title) ? "bg-violet-100 text-violet-700" : "bg-amber-100 text-amber-700"}`}><FileVideo2 size={17} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{source.title || "제목 없음"}</p><div className="mt-1 flex gap-2"><a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-foreground"><ExternalLink size={11} /> 원본 열기</a>{isRankingTitle(source.title) && <span className="text-[10px] font-black text-violet-700">-ra 저장</span>}</div></div><button onClick={() => downloadSource(source)} disabled={Boolean(busy)} className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted disabled:opacity-40">{busy === `download-${source.id}` ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}</button></article>)}</div>
    </section>

    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-xs font-black text-sky-700">STEP 3</div><h2 className="mt-1 font-bold">전체 장면 원본 추적과 부족분 보충</h2><p className="mt-1 text-xs text-muted-foreground">Windows 로컬 비전 모델이 장면을 분석하고, Lens·SNS 후보를 수집한 뒤 실제 프레임까지 비교합니다.</p><p className="mt-1 text-[10px] font-semibold text-amber-700">실행하면 장면당 대표 프레임 2장이 ImgBB에 전송되며 10분 후 자동 삭제됩니다. 전체 영상은 업로드하지 않습니다.</p><p className={`mt-2 text-[10px] font-black ${localVision.online && localVision.modelReady ? "text-emerald-700" : "text-red-600"}`}>{localVision.online && localVision.modelReady ? `로컬 엔진 준비됨 · ${localVision.model}` : `로컬 엔진 미설치 · npm run shorts-family:setup-vision 실행 필요`}</p>{traceProgress && <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3"><div className="flex items-center gap-2 text-xs font-black text-sky-800"><Loader2 size={14} className="animate-spin" /> {traceProgress.step}/3 · {traceProgress.label}</div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sky-100"><div className="h-full rounded-full bg-sky-600 transition-all" style={{ width: `${traceProgress.step / 3 * 100}%` }} /></div></div>}</div><div className="flex flex-wrap gap-2"><button onClick={traceAllOriginals} disabled={candidates.length < 5 || !localVision.modelReady || Boolean(busy)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-bold text-white disabled:opacity-40">{busy === "trace-all" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} 전체 원본 자동 추적</button></div></div>
      <div className={`mt-3 rounded-xl border p-3 ${downloadsReady ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><p className="text-xs font-black">후보 폴더 다운로드 {stagedCandidateIndexes.length}/5 {downloadsReady ? "· 다음 단계 준비 완료" : "· 원본 후보에서 다운로드 버튼을 눌러주세요"}</p>{downloadsReady && <a href="/studio/shorts-family?stage=template" className="mt-2 inline-flex h-9 items-center gap-1 rounded-lg bg-emerald-700 px-3 text-xs font-black text-white">순위·장면·제목 편집으로 이동 <ChevronRight size={13} /></a>}</div><p className="mt-2 text-[10px] text-muted-foreground">이 페이지에서는 원본 추적과 다운로드만 진행합니다. 다운로드 버튼을 누르면 프로젝트의 01-candidates 폴더에 즉시 저장되며 프로젝트 저장을 기다리지 않습니다.</p><div className="mt-4 space-y-3">{candidates.map((candidate, index) => <CandidateReviewEditor key={`${candidate.localPath}-${index}`} index={index} candidate={candidate} update={(patch) => updateCandidate(index, patch)} remove={() => setCandidates((current) => current.filter((_, currentIndex) => currentIndex !== index))} investigate={() => investigateCandidate(candidate, index)} investigating={busy === `investigate-${index}`} matches={sourceMatches[index] || []} review={sourceReview} viewedUrls={viewedUrls} lastViewedUrl={lastViewedUrl} downloadedPath={downloadedPaths[index]} matchTitles={matchTitles} sceneCopy={sceneCopies[index]} generatingCopy={busy === `scene-copy-${index}`} generateCopy={() => generateSceneCopy(index)} setMatchTitle={(url, title) => setMatchTitles((current) => ({ ...current, [url]: title }))} markViewed={markViewed} setReview={reviewSource} acceptOriginal={(match, title) => acceptOriginalMatch(index, match, title)} openFolder={openContainingFolder} />)}{candidates.length === 0 && <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">-ra를 자동 분리하면 이곳에 장면별 원본 조사 버튼이 생깁니다.</div>}</div>
      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-4"><input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="보유 소스 제목 검색" className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" /><p className="mt-2 text-[10px] text-amber-900">검색어와 제목이 비슷한 보유 영상을 위에 표시합니다. 먼저 사용할 소스를 선택하세요.</p><div className="mt-3 flex gap-2 overflow-x-auto pb-2">{recommendedLibrary.slice(0, 30).map((file, index) => { const selected = selectedLibraryPath === file.path; return <button key={file.path} onClick={() => selectLibraryFile(file)} className={`min-w-52 rounded-xl border bg-white p-3 text-left transition ${selected ? "border-amber-600 ring-2 ring-amber-200" : "border-border hover:border-amber-500"}`}><div className="flex items-center justify-between gap-2"><span className="text-[9px] font-black text-amber-700">추천 {index + 1}</span>{selected ? <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[9px] font-black text-white">선택됨</span> : file.recommendationScore > 0 && <span className="text-[9px] text-muted-foreground">유사 {Math.round(file.recommendationScore * 100)}%</span>}</div><p className="mt-1 truncate text-xs font-bold">{file.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{formatDuration(file.duration)} · 클릭해 선택</p></button>; })}</div>{recommendedLibrary.length === 0 && <p className="mt-3 text-xs text-muted-foreground">검색 결과가 없습니다.</p>}{selectedLibraryPath && <div className="mt-4 rounded-xl border border-amber-300 bg-white p-3"><p className="truncate text-xs font-black text-zinc-900">선택 소스 · {library.find((file) => file.path === selectedLibraryPath)?.name}</p><p className="mt-1 text-[10px] text-muted-foreground">이제 새 후보로 추가하거나, 교체할 기존 후보를 고르세요.</p><div className="mt-3 flex flex-col gap-2 md:flex-row"><button onClick={addSelectedLibraryCandidate} disabled={candidates.length >= 7} className="h-10 rounded-lg bg-amber-600 px-4 text-xs font-black text-white disabled:opacity-40">새 예비 후보로 추가</button><select value={libraryTargetIndex ?? ""} onChange={(event) => setLibraryTargetIndex(event.target.value === "" ? null : Number(event.target.value))} className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-white px-3 text-xs"><option value="">교체할 기존 후보 선택</option>{candidates.map((candidate, index) => <option key={`${candidate.localPath}-${index}`} value={index}>{index + 1}번 · {candidate.sourceTitle}</option>)}</select><button onClick={replaceWithSelectedLibrary} disabled={libraryTargetIndex === null} className="h-10 rounded-lg border border-amber-600 bg-white px-4 text-xs font-black text-amber-700 disabled:opacity-40">선택 후보 교체</button></div></div>}</div>
    </section>

    <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-xs font-black text-violet-700">STEP 4</div><h2 className="mt-1 font-bold">순위·장면·제목 편집</h2><p className="mt-1 text-xs text-muted-foreground">한국 1위부터 후보 소스를 고르고 장면 범위와 제목을 정합니다. 일본 순위는 한국 순위의 정확한 역순으로 자동 고정됩니다.</p></div><div className="flex gap-2"><button onClick={generatePlanning} disabled={!downloadsReady || Boolean(busy)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-40">{busy === "planning" ? <Loader2 size={15} className="animate-spin" /> : <WandSparkles size={15} />} 전체 제목·순위 후보 생성</button><button onClick={saveAll} disabled={!projectId || !downloadsReady || Boolean(busy)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold disabled:opacity-40"><Save size={15} /> 프로젝트 저장</button></div></div>{!downloadsReady ? <div className="mt-4 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6 text-center text-sm font-bold text-amber-800">원본 추적 페이지에서 후보 영상 5개 이상을 먼저 다운로드해주세요. 현재 {stagedCandidateIndexes.length}/5개</div> : <div className="mt-5 space-y-4">{[1, 2, 3, 4, 5].map((rank) => { const selected = candidates.findIndex((candidate) => candidate.koreanRank === rank && /[\\/]01-candidates[\\/]/i.test(candidate.localPath)); return <RankSlotEditor key={rank} rank={rank} selectedIndex={selected} sourceOptions={stagedCandidateIndexes} candidate={selected >= 0 ? candidates[selected] : undefined} sceneCopy={selected >= 0 ? sceneCopies[selected] : undefined} generatingCopy={selected >= 0 && busy === `scene-copy-${selected}`} selectSource={(index) => assignRankSource(rank, index)} update={(patch) => selected >= 0 && updateCandidate(selected, patch)} generateCopy={() => selected >= 0 && generateSceneCopy(selected)} />; })}</div>}</section>

    {planning && <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5"><div className="text-xs font-black text-violet-700">STEP 4 · AI 기획안</div><h2 className="mt-1 text-xl font-black">{planning.korean_title}</h2><p className="mt-2 font-bold text-violet-950">{planning.japanese_title} <span className="font-medium text-violet-700">({planning.japanese_title_korean})</span></p><p className="mt-3 text-sm leading-6 text-violet-900">소재: {planning.concept}<br />핵심 감정: {planning.overall_emotion}</p><div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{planning.entries.map((entry) => <article key={entry.index} className="rounded-xl bg-white p-3 text-xs leading-5 shadow-sm"><p className="font-black">후보 {entry.index} · 한국 {entry.korean_rank || "예비"}위 / 일본 {entry.japanese_rank || "예비"}위</p><p className="mt-1">{entry.japanese_label} ({entry.japanese_korean}) · {entry.korean_label}</p><p className="mt-2 text-muted-foreground">소재: {entry.material}<br />감정: {entry.emotion}<br />조회 원인: {entry.cause}</p></article>)}</div></section>}

    <section className="grid gap-4 xl:grid-cols-2"><TemplatePanel locale="ko" title={config.korean_title} suggestions={planning?.korean_title_candidates || []} setTitle={(value) => setConfig({ ...config, korean_title: value })} candidates={candidates} /><TemplatePanel locale="ja" title={config.japanese_title} translation={config.japanese_title_translation} suggestions={(planning?.japanese_title_candidates || []).map((item) => item.japanese)} setTitle={(value) => { const matched = planning?.japanese_title_candidates.find((item) => item.japanese === value); setConfig({ ...config, japanese_title: value, japanese_title_translation: matched?.korean || config.japanese_title_translation }); }} candidates={candidates} /></section>

    <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-black text-emerald-700">STEP 5</div><h2 className="mt-1 font-bold">초벌 영상과 Premiere 제작</h2><p className="mt-1 text-xs text-muted-foreground">기획과 안전 검수를 마친 뒤 한국판·일본판을 동시에 생성합니다.</p></div><button onClick={buildPackage} disabled={!projectId || candidates.length < 5 || Boolean(busy)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white disabled:opacity-40">{busy === "package" ? <Loader2 size={15} className="animate-spin" /> : <PackageCheck size={15} />} 초벌·Premiere 생성</button></div></section>

    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 text-emerald-700" size={21} /><div><p className="font-bold text-emerald-950">최종 제작 전 사용자 검수</p><p className="mt-1 text-xs leading-5 text-emerald-800">안전성, 원본 사용 범위, 자동 분리점, 자막 제거, 좌우 반전 문자 왜곡을 확인한 뒤 Premiere Pro 2026 XML을 여세요.</p></div></div><button onClick={openProjectFolder} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-emerald-800 shadow-sm"><FolderOpen size={16} /> 프로젝트 폴더</button></section>
    <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900"><p className="font-black">템플릿 기능이 만드는 것</p><p className="mt-1 text-xs leading-5">한국판·일본판 상단 제목, 로고, 순위 목록, 활성 순위 색상·투명도, 가로 영상용 블러 배경, 확대·크롭·좌우반전 설정을 미리 보여주고 Premiere 제작 설정에 반영합니다. 실제 영상과 Premiere 파일은 마지막 단계에서 생성됩니다.</p></section>
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

function CandidateReviewEditor({ index, candidate, update, remove, investigate, investigating, matches, review, viewedUrls, lastViewedUrl, downloadedPath, matchTitles, sceneCopy, generatingCopy, generateCopy, setMatchTitle, markViewed, setReview, acceptOriginal, openFolder }: { index: number; candidate: Candidate; update: (patch: Partial<Candidate>) => void; remove: () => void; investigate: () => void; investigating: boolean; matches: SourceMatch[]; review: Record<string, ReviewState>; viewedUrls: Record<string, boolean>; lastViewedUrl: string; downloadedPath?: string; matchTitles: Record<string, string>; sceneCopy?: SceneCopy; generatingCopy: boolean; generateCopy: () => void; setMatchTitle: (url: string, title: string) => void; markViewed: (url: string) => void; setReview: (url: string, state: ReviewState) => void; acceptOriginal: (match: SourceMatch, title: string) => void; openFolder: (path: string) => void }) {
  const [stillFailed, setStillFailed] = useState(false);
  const visible = matches.filter((match) => review[match.url] !== "deleted").sort((left, right) => {
    const stateBoost = (value: SourceMatch) => review[value.url] === "selected" ? 3 : review[value.url] === "deferred" ? -1 : 0;
    return stateBoost(right) - stateBoost(left) || right.confidence - left.confidence;
  });
  const stillUrl = `${HELPER}/shorts-family/still?path=${encodeURIComponent(candidate.localPath)}&at=${encodeURIComponent(Math.max(0, candidate.clipStart + 0.5))}`;
  return <article className="rounded-xl border border-border bg-stone-50 p-3">
    <div className="mb-3 grid gap-3 sm:grid-cols-[160px_1fr] sm:items-center">{stillFailed ? <div className="flex aspect-video w-full flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-100 text-[9px] font-bold text-zinc-500"><FileVideo2 size={18} className="mb-1" />로컬 도우미 재시작 후 표시</div> : <Image unoptimized src={stillUrl} width={480} height={270} alt="" onError={() => setStillFailed(true)} className="aspect-video w-full rounded-lg bg-zinc-200 object-cover" />}<div><p className="text-xs font-black text-zinc-800">{index + 1}번 장면 참고 스틸컷</p><p className="mt-1 text-[10px] text-muted-foreground">원본 후보를 열 때 이 장면과 비교하세요.</p>{downloadedPath && <button onClick={() => openFolder(downloadedPath)} className="mt-2 inline-flex h-8 items-center gap-1 rounded-md bg-emerald-700 px-3 text-[10px] font-black text-white"><FolderOpen size={12} /> 다운로드 완료 · 저장 폴더 열기</button>}</div></div>
    <CandidateEditor traceOnly candidate={candidate} update={update} remove={remove} investigate={investigate} investigating={investigating} matches={[]} acceptOriginal={(match) => acceptOriginal(match, match.title)} openFolder={() => openFolder(candidate.localPath)} sceneCopy={sceneCopy} generatingCopy={generatingCopy} generateCopy={generateCopy} />
    {visible.length > 0 && <div className="mt-3 border-t border-border pt-3"><p className="text-[11px] font-black text-sky-800">원본 후보 · 링크를 열어본 항목은 ‘열어봄’, 마지막으로 연 항목은 파란 테두리로 표시됩니다.</p><div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{visible.map((match) => {
      const selected = review[match.url] === "selected";
      const deferred = review[match.url] === "deferred";
      const active = lastViewedUrl === match.url;
      const editedTitle = matchTitles[match.url] ?? match.title;
      return <div key={match.url} className={`rounded-lg border-2 p-2 text-[10px] transition ${active ? "border-sky-500 ring-2 ring-sky-200" : selected ? "border-emerald-500 bg-emerald-50" : deferred ? "border-zinc-400 bg-zinc-100" : match.verificationStatus === "verified" ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}><div className="mb-1 flex items-center justify-between gap-2"><span className={`rounded-full px-2 py-0.5 font-black ${match.verificationStatus === "verified" ? "bg-emerald-600 text-white" : "bg-amber-500 text-white"}`}>{match.verificationStatus === "verified" ? "영상 일치 검증" : "이미지 근거·미검증"}</span>{viewedUrls[match.url] && <span className="inline-flex items-center gap-1 font-black text-sky-700"><Eye size={10} /> 열어봄</span>}</div><a href={match.url} target="_blank" rel="noreferrer" onClick={() => markViewed(match.url)} className="line-clamp-2 font-bold hover:text-sky-700">{match.title}</a><label className="mt-2 block font-black text-zinc-600">후보 저장 제목<input value={editedTitle} onChange={(event) => setMatchTitle(match.url, event.target.value)} className="mt-1 h-8 w-full rounded-md border border-zinc-300 bg-white px-2 text-[10px] font-semibold text-zinc-900" /></label><p className="mt-1 text-muted-foreground">근거 점수 {match.confidence}%</p><p className="mt-1 line-clamp-3 text-muted-foreground">{match.reason}</p><div className="mt-2 grid grid-cols-3 gap-1"><button onClick={() => acceptOriginal(match, editedTitle)} className={`h-8 rounded-md border font-black ${selected ? "border-emerald-700 bg-emerald-700 text-white" : "border-emerald-600 bg-transparent text-emerald-700"}`}>{selected ? "다운로드됨" : "다운로드"}</button><button onClick={() => setReview(match.url, "deferred")} className={`h-8 rounded-md border font-black ${deferred ? "border-zinc-700 bg-zinc-700 text-white" : "border-zinc-400 bg-transparent text-zinc-700"}`}>{deferred ? "보류됨" : "보류"}</button><button onClick={() => setReview(match.url, "deleted")} className="h-8 rounded-md border border-red-300 bg-transparent font-black text-red-600">삭제</button></div></div>;
    })}</div></div>}
  </article>;
}

function CandidateEditor({ candidate, update, remove, investigate, investigating, matches, acceptOriginal, openFolder, sceneCopy, generatingCopy, generateCopy, traceOnly = false }: { candidate: Candidate; update: (patch: Partial<Candidate>) => void; remove: () => void; investigate: () => void; investigating: boolean; matches: SourceMatch[]; acceptOriginal: (match: SourceMatch) => void; openFolder: () => void; sceneCopy?: SceneCopy; generatingCopy: boolean; generateCopy: () => void; traceOnly?: boolean }) {
  if (traceOnly) return <article className="rounded-xl border border-border bg-white p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-black">{candidate.sourceTitle}</p><p className="mt-1 break-all text-[10px] text-muted-foreground">{candidate.localPath}</p></div><button onClick={openFolder} className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-3 text-[10px] font-black text-amber-800"><FolderOpen size={12} /> 폴더 열기</button></div><div className="mt-3 flex gap-3"><button onClick={investigate} className="text-[10px] font-black text-sky-700">{investigating ? "원본 검색 중…" : "이 장면 원본 찾기"}</button><button onClick={remove} className="text-[10px] font-black text-red-600">추적 목록에서 제거</button></div>{candidate.notes && <p className="mt-3 text-[10px] leading-5 text-muted-foreground">{candidate.notes}</p>}</article>;
  return <article className="rounded-xl border border-border bg-white p-4"><div className="flex items-start gap-3"><GripVertical size={17} className="mt-1 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="truncate text-base font-black">{candidate.sourceTitle}</p><p className="mt-1 break-all text-[10px] leading-4 text-muted-foreground">{candidate.localPath}</p></div><button onClick={openFolder} className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-3 text-[10px] font-black text-amber-800"><FolderOpen size={12} /> 폴더 열기</button></div><div className="mt-3 grid grid-cols-2 gap-3"><label className="text-[10px] font-bold text-muted-foreground">시작(초)<input type="number" min={0} step={0.1} value={candidate.clipStart} onChange={(event) => update({ clipStart: Number(event.target.value) })} className="mt-1 h-9 w-full rounded-lg border border-border px-3 text-xs" /></label><label className="text-[10px] font-bold text-muted-foreground">종료(초)<input type="number" min={0} step={0.1} value={candidate.clipEnd ?? ""} onChange={(event) => update({ clipEnd: event.target.value ? Number(event.target.value) : null })} className="mt-1 h-9 w-full rounded-lg border border-border px-3 text-xs" /></label></div><div className="mt-2 flex gap-3"><button onClick={investigate} className="text-[10px] font-black text-sky-700">{investigating ? "원본 검색 중…" : "이 장면 원본 찾기"}</button><button onClick={remove} className="text-[10px] font-black text-red-600">후보에서 제거</button></div><div className="mt-4 rounded-xl border border-sky-100 bg-sky-50/50 p-3"><div className="flex items-center justify-between gap-2"><label className="text-[11px] font-black text-sky-900">장면 상황 설명</label><button onClick={generateCopy} disabled={generatingCopy} className="inline-flex h-8 items-center gap-1 rounded-md bg-sky-700 px-3 text-[10px] font-black text-white disabled:opacity-50">{generatingCopy ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} AI 설명·한일 제목 추천</button></div><textarea value={candidate.notes} onChange={(event) => update({ notes: event.target.value })} placeholder="이 장면에서 누가 무엇을 하고 어떤 반응이나 반전이 생기는지 한국어로 적으세요. 비워두고 AI 버튼을 누르면 영상 장면을 읽어 자동 생성합니다." className="mt-2 min-h-24 w-full resize-y rounded-lg border border-sky-200 bg-white p-3 text-xs leading-5" />{sceneCopy && <div className="mt-3 space-y-2"><p className="text-[10px] font-bold leading-4 text-sky-900">일본어 상황 번역: {sceneCopy.japaneseDescription}</p><p className="text-[10px] font-black text-sky-800">일본 릴스·쇼츠용 제목 후보 3개 · 눌러서 일본판 제목에 적용</p><div className="grid gap-2 sm:grid-cols-3">{sceneCopy.suggestions.map((suggestion) => <button key={`${suggestion.japanese}-${suggestion.korean}`} onClick={() => update({ japaneseLabel: suggestion.japanese, japaneseTranslation: suggestion.korean })} className="rounded-lg border border-sky-200 bg-white p-2 text-left hover:border-sky-500"><span className="block text-xs font-black text-zinc-900">{suggestion.japanese}</span><span className="mt-1 block text-[9px] text-muted-foreground">{suggestion.korean} · {suggestion.tone}</span></button>)}</div></div>}</div><div className="mt-4 space-y-4"><div><p className="mb-1.5 text-[11px] font-black text-zinc-700">한국판</p><div className="grid grid-cols-[minmax(0,1fr)_90px] gap-2"><input value={candidate.koreanLabel} maxLength={6} onChange={(event) => update({ koreanLabel: event.target.value.replace(/\s/g, "").slice(0, 4) })} placeholder="한국 4글자" className="h-10 min-w-0 rounded-lg border border-border px-3 text-sm" /><select value={candidate.koreanRank || ""} onChange={(event) => update({ koreanRank: Number(event.target.value) || null })} className="h-10 rounded-lg border border-border bg-white px-2 text-xs"><option value="">예비</option>{[5, 4, 3, 2, 1].map((rank) => <option key={rank}>{rank}위</option>)}</select></div><label className="mt-2 flex items-center gap-2 text-[11px] font-bold text-muted-foreground"><input type="checkbox" checked={candidate.flipKorean} onChange={(event) => update({ flipKorean: event.target.checked })} /> 한국판 좌우반전</label></div><div><p className="mb-1.5 text-[11px] font-black text-zinc-700">일본판</p><div className="grid grid-cols-[minmax(0,1fr)_90px] gap-2"><input value={candidate.japaneseLabel} onChange={(event) => update({ japaneseLabel: event.target.value })} placeholder="日本語タイトル" className="h-10 min-w-0 rounded-lg border border-border px-3 text-sm" /><select value={candidate.japaneseRank || ""} onChange={(event) => update({ japaneseRank: Number(event.target.value) || null })} className="h-10 rounded-lg border border-border bg-white px-2 text-xs"><option value="">예비</option>{[5, 4, 3, 2, 1].map((rank) => <option key={rank}>{rank}위</option>)}</select></div><p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">한국어 뜻: {candidate.japaneseTranslation || "추천 표현을 선택하거나 직접 입력하세요"}</p><label className="mt-2 flex items-center gap-2 text-[11px] font-bold text-muted-foreground"><input type="checkbox" checked={candidate.flipJapanese} onChange={(event) => update({ flipJapanese: event.target.checked })} /> 일본판 좌우반전</label></div><div><p className="mb-1.5 text-[11px] font-black text-zinc-700">화면 처리</p><select value={candidate.subtitleStrategy} onChange={(event) => update({ subtitleStrategy: event.target.value as Candidate["subtitleStrategy"] })} className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"><option value="auto">자동 확대</option><option value="crop">강한 크롭</option><option value="blur">하단 블러</option><option value="keep">유지</option></select><label className="mt-2 flex items-center gap-2 text-[11px] font-black text-emerald-700"><input type="checkbox" checked={candidate.safetyStatus === "승인"} onChange={(event) => update({ safetyStatus: event.target.checked ? "승인" : "검수 필요" })} /><Check size={12} /> 안전 검수</label></div></div></div></div>{matches.length > 0 && <div className="mt-3 hidden">{matches.map((match) => <button key={match.url} onClick={() => acceptOriginal(match)}>{match.title}</button>)}</div>}</article>;
}

function RankSlotEditor({ rank, selectedIndex, sourceOptions, candidate, sceneCopy, generatingCopy, selectSource, update, generateCopy }: { rank: number; selectedIndex: number; sourceOptions: Array<{ candidate: Candidate; index: number }>; candidate?: Candidate; sceneCopy?: SceneCopy; generatingCopy: boolean; selectSource: (index: number | null) => void; update: (patch: Partial<Candidate>) => void; generateCopy: () => void }) {
  return <article className="rounded-xl border border-violet-200 bg-violet-50/40 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center"><div className="flex h-12 w-24 shrink-0 items-center justify-center rounded-xl bg-violet-700 text-sm font-black text-white">한국 {rank}위</div><div className="min-w-0 flex-1"><label className="text-[10px] font-black text-violet-900">1. 후보 소스 선택<select value={selectedIndex >= 0 ? selectedIndex : ""} onChange={(event) => selectSource(event.target.value === "" ? null : Number(event.target.value))} className="mt-1 h-10 w-full rounded-lg border border-violet-200 bg-white px-3 text-xs"><option value="">후보 폴더 영상 선택</option>{sourceOptions.map(({ candidate: option, index }) => <option key={`${option.localPath}-${index}`} value={index}>{option.sourceTitle}</option>)}</select></label></div><div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-center text-xs font-black text-sky-800">일본 {6 - rank}위 자동</div></div>{candidate && <div className="mt-4 space-y-4"><p className="break-all text-[10px] text-muted-foreground">{candidate.localPath}</p><div><p className="text-[10px] font-black text-zinc-700">2. 장면 설정</p><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><label className="text-[10px] font-bold text-muted-foreground">시작(초)<input type="number" min={0} step={0.1} value={candidate.clipStart} onChange={(event) => update({ clipStart: Number(event.target.value) })} className="mt-1 h-9 w-full rounded-lg border border-border bg-white px-3" /></label><label className="text-[10px] font-bold text-muted-foreground">종료(초)<input type="number" min={0} step={0.1} value={candidate.clipEnd ?? ""} onChange={(event) => update({ clipEnd: event.target.value ? Number(event.target.value) : null })} className="mt-1 h-9 w-full rounded-lg border border-border bg-white px-3" /></label><label className="text-[10px] font-bold text-muted-foreground">화면 처리<select value={candidate.subtitleStrategy} onChange={(event) => update({ subtitleStrategy: event.target.value as Candidate["subtitleStrategy"] })} className="mt-1 h-9 w-full rounded-lg border border-border bg-white px-2"><option value="auto">자동 확대</option><option value="crop">강한 크롭</option><option value="blur">하단 블러</option><option value="keep">유지</option></select></label><label className="flex items-end gap-2 pb-2 text-[10px] font-black text-emerald-700"><input type="checkbox" checked={candidate.safetyStatus === "승인"} onChange={(event) => update({ safetyStatus: event.target.checked ? "승인" : "검수 필요" })} /> 안전 검수</label></div><div className="mt-2 flex flex-wrap gap-4 text-[10px] font-bold text-muted-foreground"><label className="flex items-center gap-2"><input type="checkbox" checked={candidate.flipKorean} onChange={(event) => update({ flipKorean: event.target.checked })} /> 한국판 좌우반전</label><label className="flex items-center gap-2"><input type="checkbox" checked={candidate.flipJapanese} onChange={(event) => update({ flipJapanese: event.target.checked })} /> 일본판 좌우반전</label></div></div><div><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black text-zinc-700">3. 장면 설명과 순위 제목</p><button onClick={generateCopy} disabled={generatingCopy} className="inline-flex h-8 items-center gap-1 rounded-md bg-sky-700 px-3 text-[10px] font-black text-white disabled:opacity-50">{generatingCopy ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} 한·일 후보 3개씩</button></div><textarea value={candidate.notes} onChange={(event) => update({ notes: event.target.value })} className="mt-2 min-h-20 w-full rounded-lg border border-sky-200 bg-white p-3 text-xs" placeholder="장면 상황을 적거나 AI 버튼으로 분석하세요." />{sceneCopy && <div className="mt-3 grid gap-3 lg:grid-cols-2"><div><p className="text-[10px] font-black text-emerald-800">한국어 후보</p><div className="mt-2 grid gap-2 sm:grid-cols-3">{sceneCopy.koreanSuggestions.map((item) => <button key={item.korean} onClick={() => update({ koreanLabel: item.korean.replace(/\s/g, "").slice(0, 4) })} className="rounded-lg border border-emerald-200 bg-white p-2 text-left text-xs font-black hover:border-emerald-500">{item.korean}</button>)}</div></div><div><p className="text-[10px] font-black text-sky-800">일본어 후보</p><div className="mt-2 grid gap-2 sm:grid-cols-3">{sceneCopy.suggestions.map((item) => <button key={item.japanese} onClick={() => update({ japaneseLabel: item.japanese, japaneseTranslation: item.korean })} className="rounded-lg border border-sky-200 bg-white p-2 text-left hover:border-sky-500"><span className="block text-xs font-black">{item.japanese}</span><span className="text-[9px] text-muted-foreground">{item.korean}</span></button>)}</div></div></div>}<div className="mt-3 grid gap-2 md:grid-cols-2"><label className="text-[10px] font-black">한국판 제목<input value={candidate.koreanLabel} onChange={(event) => update({ koreanLabel: event.target.value.replace(/\s/g, "").slice(0, 4) })} className="mt-1 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" /></label><label className="text-[10px] font-black">일본판 제목<input value={candidate.japaneseLabel} onChange={(event) => update({ japaneseLabel: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" /></label></div></div></div>}</article>;
}

function TemplatePanel({ locale, title, translation, suggestions, setTitle, candidates }: { locale: "ko" | "ja"; title: string; translation?: string; suggestions: string[]; setTitle: (value: string) => void; candidates: Candidate[] }) {
  const rankKey = locale === "ko" ? "koreanRank" : "japaneseRank";
  const labelKey = locale === "ko" ? "koreanLabel" : "japaneseLabel";
  const active = candidates.find((candidate) => candidate[rankKey] === 5) || candidates[0];
  const ordered = candidates.filter((candidate) => candidate[rankKey]).sort((a, b) => Number(a[rankKey]) - Number(b[rankKey]));
  const titleParts = title.split(/[｜|\n]/);
  return <div className="rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-bold">{locale === "ko" ? "한국판 템플릿" : "일본판 템플릿"}</h2><p className="mt-1 text-xs text-muted-foreground">{locale === "ko" ? "강아지 로고 · 컬러 순위 · 비활성 50%" : "고양이 로고 · 흰색 순위 · 현재 빨간 밑줄"}</p></div><WandSparkles size={19} className={locale === "ko" ? "text-violet-600" : "text-sky-600"} /></div>{suggestions.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-3">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => setTitle(suggestion)} className="rounded-lg border border-violet-200 bg-violet-50 p-2 text-left text-[10px] font-black hover:border-violet-500">{suggestion}</button>)}</div>}<input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-4 h-11 w-full rounded-xl border border-border px-3 text-sm font-bold" />{locale === "ja" && <p className="mt-2 text-xs text-muted-foreground">한국어 번역: {translation || "자동 기획 후 표시"}</p>}
    <div className="mx-auto mt-4 aspect-[9/16] max-h-[560px] overflow-hidden rounded-2xl bg-black text-white shadow-lg"><div className="relative h-[22%] bg-black px-5 pt-5 text-center"><Image src={locale === "ko" ? "/shorts-family/logo-korea-dog.png" : "/shorts-family/logo-japan-cat.png"} alt="template logo" width={56} height={56} className="absolute left-3 top-3 h-12 w-12 object-contain" />{locale === "ko" ? <p className="pt-8 text-[clamp(20px,3vw,34px)] font-black leading-tight text-violet-300">{title}</p> : <div className="pt-7 font-black leading-tight"><p className="text-[clamp(16px,2.4vw,25px)] text-white [text-shadow:0_0_8px_#38bdf8]">{titleParts[0]}</p><p className="text-[clamp(17px,2.6vw,28px)] text-yellow-300 [text-shadow:0_0_6px_#e11d48]">{titleParts[1] || "家族のバズった5選"}</p></div>}</div><div className="relative h-[78%] overflow-hidden bg-gradient-to-b from-stone-300 via-amber-100 to-stone-400"><div className="absolute inset-0 scale-110 bg-gradient-to-br from-amber-100/90 via-sky-200/70 to-rose-200/90 blur-xl" /><div className="absolute inset-[9%_17%] rounded-2xl bg-white/55 shadow-xl" /><div className="absolute left-4 top-5 space-y-2">{ordered.map((candidate) => { const rank = Number(candidate[rankKey]); const colors = ["#ef4444", "#f59e0b", "#a3e635", "#22c55e", "#818cf8"]; const current = rank === 5; return <p key={`${locale}-${rank}`} style={{ color: locale === "ko" ? colors[rank - 1] : "white", opacity: current ? 1 : locale === "ko" ? 0.5 : 0.32 }} className={`text-base font-black [text-shadow:1px_1px_2px_#000] ${locale === "ja" && current ? "border-b-4 border-red-500" : ""}`}>{rank}. {String(candidate[labelKey])}</p>; })}</div>{!active && <p className="absolute inset-x-5 bottom-6 text-center text-xs font-bold">후보를 추가하면 미리보기가 표시됩니다</p>}</div></div>
    <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]"><span className="rounded-lg bg-muted p-2 text-center font-bold"><Play size={13} className="mx-auto mb-1" />5→1 재생</span><span className="rounded-lg bg-muted p-2 text-center font-bold"><Sparkles size={13} className="mx-auto mb-1" />명도·채도 보정</span><span className="rounded-lg bg-muted p-2 text-center font-bold"><ChevronRight size={13} className="mx-auto mb-1" />암전 전환</span></div></div>;
}

export default function ShortsFamilyPage() {
  return <Suspense fallback={<div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-amber-600" /></div>}><ShortsFamilyWorkspace /></Suspense>;
}
