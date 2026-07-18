import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 120;

interface DiscoverBody {
  jobId: string;
  inputUrl?: string | null;
  inputTitle?: string | null;
  inputUploader?: string | null;
  inputUploadDate?: string | null;
}

interface ShotClue {
  frameIndex?: number;
  description?: string;
  watermark?: string;
  searchQueries?: string[];
}

interface VisualAnalysis {
  summary?: string;
  shots?: ShotClue[];
}

interface YouTubeSearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
  };
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
  error?: { message?: string };
}

interface VisionWebPage {
  url?: string;
  pageUrl?: string;
  pageTitle?: string;
  score?: number;
  fullMatchingImages?: Array<{ url?: string }>;
  partialMatchingImages?: Array<{ url?: string }>;
}

interface VisionAnnotateResponse {
  responses?: Array<{
    webDetection?: { pagesWithMatchingImages?: VisionWebPage[] };
    error?: { code?: number; message?: string; status?: string };
  }>;
  error?: { code?: number; message?: string; status?: string };
}

interface VisionStatus {
  configured: boolean;
  succeeded: boolean;
  searchedFrames: number;
  pageMatches: number;
  error?: string;
}

interface SourceCandidate {
  url: string;
  title: string;
  reason: string;
  confidence: number;
  frameIndexes: number[];
  platform: string;
  originalType: string;
  grounded: boolean;
  uploader?: string | null;
  publishedAt?: string | null;
  thumbnail?: string | null;
  visualMatch?: number;
}

function platformFromUrl(url: string) {
  const value = url.toLowerCase();
  if (value.includes("youtube.com") || value.includes("youtu.be")) return "youtube";
  if (value.includes("tiktok.com")) return "tiktok";
  if (value.includes("instagram.com")) return "instagram";
  if (value.includes("xiaohongshu.com") || value.includes("xhslink.com")) return "xiaohongshu";
  if (value.includes("facebook.com")) return "facebook";
  if (value.includes("vimeo.com")) return "vimeo";
  return "web";
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || ["feature", "si", "fbclid", "gclid"].includes(key)) url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function parseJson<T>(text: string): T | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned) as T; } catch { /* fall through */ }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)) as T; } catch { return null; }
}

function hasHangul(value: string) {
  return /[가-힣]/.test(value);
}

function isTargetVideoPlatform(platform: string) {
  return ["youtube", "tiktok", "instagram", "xiaohongshu"].includes(platform);
}

async function searchVisionWeb(referenceFrames: Buffer[], inputUrl: string) {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY || process.env.GEMINI_API_KEY;
  const status: VisionStatus = {
    configured: Boolean(apiKey),
    succeeded: false,
    searchedFrames: 0,
    pageMatches: 0,
  };
  if (!apiKey) return { candidates: [] as SourceCandidate[], status };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: referenceFrames.slice(0, 4).map((image) => ({
          image: { content: image.toString("base64") },
          features: [{ type: "WEB_DETECTION", maxResults: 20 }],
        })),
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await response.json() as VisionAnnotateResponse;
    const topError = data.error || data.responses?.find((item) => item.error)?.error;
    if (!response.ok || topError) {
      throw new Error(topError?.message || `Google Vision 요청 실패 (${response.status})`);
    }

    status.succeeded = true;
    status.searchedFrames = referenceFrames.length;
    const candidates: SourceCandidate[] = [];
    for (const [frameOffset, annotation] of (data.responses || []).entries()) {
      const pages = annotation.webDetection?.pagesWithMatchingImages || [];
      status.pageMatches += pages.length;
      for (const page of pages) {
        const url = normalizeUrl(page.url || page.pageUrl || "");
        const title = page.pageTitle?.trim() || "Google Vision 시각 일치 후보";
        const platform = platformFromUrl(url);
        if (!url || url === inputUrl || !isTargetVideoPlatform(platform) || hasHangul(title)) continue;
        const fullMatches = page.fullMatchingImages?.length || 0;
        const partialMatches = page.partialMatchingImages?.length || 0;
        const matchLabel = fullMatches > 0 ? "동일 이미지" : partialMatches > 0 ? "부분 일치 이미지" : "시각 일치 이미지";
        const baseConfidence = fullMatches > 0 ? 94 : partialMatches > 0 ? 84 : 74;
        candidates.push({
          url,
          title,
          reason: `Google Vision Web Detection에서 FRAME ${frameOffset + 1}과 ${matchLabel}가 게시된 페이지로 확인했습니다. 전체 영상을 내려받아 실제 일치 구간을 추가 검증합니다.`,
          confidence: Math.min(99, Math.max(baseConfidence, Math.round((page.score || 0) * 100))),
          frameIndexes: [frameOffset + 1],
          platform,
          originalType: fullMatches > 0 ? "vision_full_match" : "vision_partial_match",
          grounded: true,
        });
      }
    }
    return { candidates, status };
  } catch (error) {
    status.error = error instanceof Error ? error.message : "Google Vision Web Detection에 실패했습니다.";
    return { candidates: [] as SourceCandidate[], status };
  }
}

function dedupeQueries(shots: ShotClue[]) {
  const entries: Array<{ query: string; frameIndex: number; description: string }> = [];
  const seen = new Set<string>();
  for (const shot of shots) {
    for (const rawQuery of shot.searchQueries || []) {
      const query = String(rawQuery).replace(/\s+/g, " ").trim();
      const key = query.toLowerCase();
      if (query.length < 4 || seen.has(key)) continue;
      seen.add(key);
      entries.push({
        query,
        frameIndex: Number(shot.frameIndex) || 1,
        description: shot.description || shot.watermark || "대표 프레임과 일치하는 장면",
      });
    }
  }
  return entries.slice(0, 6);
}

async function searchYouTube(
  apiKey: string,
  queries: Array<{ query: string; frameIndex: number; description: string }>,
  inputUrl: string,
) {
  const results = await Promise.all(queries.slice(0, 4).map(async (entry, queryIndex) => {
    const endpoint = new URL("https://www.googleapis.com/youtube/v3/search");
    endpoint.searchParams.set("part", "snippet");
    endpoint.searchParams.set("type", "video");
    endpoint.searchParams.set("order", "relevance");
    endpoint.searchParams.set("maxResults", "5");
    endpoint.searchParams.set("q", entry.query);
    endpoint.searchParams.set("key", apiKey);
    const response = await fetch(endpoint, { cache: "no-store" });
    const data = await response.json() as YouTubeSearchResponse;
    if (!response.ok) throw new Error(data.error?.message || "YouTube 검색에 실패했습니다.");

    return (data.items || []).flatMap((item, resultIndex): SourceCandidate[] => {
      const videoId = item.id?.videoId;
      const title = item.snippet?.title || "YouTube 원본 후보";
      if (!videoId || hasHangul(title)) return [];
      const url = normalizeUrl(`https://www.youtube.com/watch?v=${videoId}`);
      if (!url || url === inputUrl) return [];
      return [{
        url,
        title,
        reason: `FRAME ${entry.frameIndex}의 ${entry.description} 단서로 “${entry.query}”를 검색해 찾은 해외 영상입니다.`,
        confidence: Math.max(38, 72 - queryIndex * 6 - resultIndex * 4),
        frameIndexes: [entry.frameIndex],
        platform: "youtube",
        originalType: "possible_source",
        grounded: true,
        uploader: item.snippet?.channelTitle || null,
        publishedAt: item.snippet?.publishedAt?.slice(0, 10) || null,
        thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || null,
      }];
    });
  }));
  return results.flat();
}

async function searchOpenWeb(
  ai: GoogleGenAI,
  queries: Array<{ query: string; frameIndex: number; description: string }>,
  inputUrl: string,
) {
  if (queries.length === 0) return { candidates: [] as SourceCandidate[], queries: [] as string[] };
  const queryText = queries.slice(0, 4).map((entry, index) => `${index + 1}. ${entry.query}`).join("\n");
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Find likely original foreign video/source pages for these visual-search queries extracted from a Korean re-edit:\n${queryText}\nSearch all of these explicitly: site:tiktok.com, site:instagram.com/reel, site:xiaohongshu.com/explore (Xiaohongshu/RED), site:xhslink.com, YouTube, creator pages, news/official sources and stock footage. Exclude Korean reposts and compilations. Cite only actual post/video/creator pages that appear in Google Search, not generic articles. Be concise.`,
    config: { tools: [{ googleSearch: {} }], temperature: 0.1 },
  });
  const metadata = response.candidates?.[0]?.groundingMetadata;
  const candidates: SourceCandidate[] = [];
  for (const chunk of metadata?.groundingChunks || []) {
    const rawUrl = chunk.web?.uri;
    const title = chunk.web?.title || "웹 원출처 후보";
    if (!rawUrl || hasHangul(title)) continue;
    let resolvedUrl = rawUrl;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const resolved = await fetch(rawUrl, { redirect: "follow", cache: "no-store", signal: controller.signal });
      clearTimeout(timeout);
      resolvedUrl = resolved.url || rawUrl;
      await resolved.body?.cancel();
    } catch {
      resolvedUrl = rawUrl;
    }
    const url = normalizeUrl(resolvedUrl);
    if (!url || url === inputUrl) continue;
    const platform = platformFromUrl(url);
    candidates.push({
      url,
      title,
      reason: "대표 프레임에서 추출한 외국어 시각 단서를 Google 검색으로 교차 확인한 원출처 후보입니다.",
      confidence: platform === "web" ? 42 : 52,
      frameIndexes: [],
      platform,
      originalType: "possible_source",
      grounded: true,
    });
  }
  return { candidates, queries: metadata?.webSearchQueries || [] };
}

async function perceptualHash(image: Buffer) {
  const { data } = await sharp(image).greyscale().resize(32, 32, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const coefficients: number[] = [];
  for (let u = 0; u < 8; u += 1) {
    for (let v = 0; v < 8; v += 1) {
      let sum = 0;
      for (let x = 0; x < 32; x += 1) {
        for (let y = 0; y < 32; y += 1) {
          sum += data[y * 32 + x]
            * Math.cos(((2 * x + 1) * u * Math.PI) / 64)
            * Math.cos(((2 * y + 1) * v * Math.PI) / 64);
        }
      }
      coefficients.push(sum);
    }
  }
  const values = coefficients.slice(1);
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return values.map((value) => value > median);
}

function hashSimilarity(left: boolean[], right: boolean[]) {
  const length = Math.min(left.length, right.length);
  if (length === 0) return 0;
  let equal = 0;
  for (let index = 0; index < length; index += 1) if (left[index] === right[index]) equal += 1;
  return equal / length;
}

async function verifyYouTubeThumbnails(referenceFrames: Buffer[], candidates: SourceCandidate[]) {
  const verifiable = candidates.filter((candidate) => candidate.thumbnail).slice(0, 6);
  if (verifiable.length === 0) return candidates;
  const referenceHashes = await Promise.all(referenceFrames.map(perceptualHash));
  await Promise.all(verifiable.map(async (candidate) => {
    try {
      const response = await fetch(candidate.thumbnail!, { cache: "no-store" });
      if (!response.ok) return;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 5 * 1024 * 1024) return;
      const candidateHash = await perceptualHash(buffer);
      const rawSimilarity = Math.max(...referenceHashes.map((hash) => hashSimilarity(hash, candidateHash)));
      const visualMatch = Math.max(0, Math.min(100, Math.round((rawSimilarity - 0.45) * 182)));
      candidate.visualMatch = visualMatch;
      candidate.confidence = Math.round(candidate.confidence * 0.3 + visualMatch * 0.7);
      if (visualMatch >= 70) {
        candidate.originalType = "visually_matched_source";
        candidate.reason = `원본 프레임과 썸네일의 픽셀 구조가 ${visualMatch}% 일치합니다. ${candidate.reason}`;
      } else if (visualMatch < 30) {
        candidate.reason = `화면 구조 일치도가 낮아 유사 주제 영상일 가능성이 큽니다. ${candidate.reason}`;
      }
    } catch {
      // 개별 썸네일을 읽지 못한 후보는 검색 점수를 유지한다.
    }
  }));
  return candidates;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as DiscoverBody;
    if (!/^[\w.-]+$/.test(body.jobId || "")) {
      return NextResponse.json({ error: "유효하지 않은 분석 작업입니다." }, { status: 400 });
    }
    const geminiKey = process.env.GEMINI_API_KEY;
    const youtubeKey = process.env.YOUTUBE_API_KEY;
    if (!geminiKey || !youtubeKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY와 YOUTUBE_API_KEY 설정이 필요합니다." }, { status: 500 });
    }

    const outputsRoot = path.resolve(process.cwd(), "source-finder", "outputs");
    const jobDir = path.resolve(outputsRoot, body.jobId);
    if (!jobDir.startsWith(`${outputsRoot}${path.sep}`)) {
      return NextResponse.json({ error: "허용되지 않은 작업 경로입니다." }, { status: 400 });
    }
    const framesDir = path.join(jobDir, "frames", "cropped");
    const frameNames = (await fs.readdir(framesDir))
      .filter((name) => /^representative_\d+\.jpg$/i.test(name)).sort().slice(0, 4);
    if (frameNames.length === 0) {
      return NextResponse.json({ error: "자동 탐색에 사용할 대표 프레임이 없습니다." }, { status: 404 });
    }

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const referenceFrames: Buffer[] = [];
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: `These frames are from a Korean re-edited video, not the original. Analyze EACH frame separately for automatic source retrieval. Extract exact visible watermarks/usernames/logos/text, identify people/events/locations if reasonably certain, and create 2 concise search queries per frame in English or the likely original language. Queries must target the underlying foreign footage, not the Korean title “${body.inputTitle || "unknown"}”. Return JSON only: {"summary":"Korean summary","shots":[{"frameIndex":1,"description":"specific visual clue in Korean","watermark":"exact text or empty","searchQueries":["query 1","query 2"]}]}` }];
    for (let index = 0; index < frameNames.length; index += 1) {
      parts.push({ text: `FRAME ${index + 1}` });
      const buffer = await fs.readFile(path.join(framesDir, frameNames[index]));
      referenceFrames.push(buffer);
      parts.push({ inlineData: { mimeType: "image/jpeg", data: buffer.toString("base64") } });
    }

    const inputUrl = normalizeUrl(body.inputUrl || "");
    const visionPromise = searchVisionWeb(referenceFrames, inputUrl);

    const visualResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: parts,
      config: { responseMimeType: "application/json", temperature: 0.1 },
    });
    const visual = parseJson<VisualAnalysis>(visualResponse.text || "") || {};
    const queryEntries = dedupeQueries(visual.shots || []);
    const semanticSearches = queryEntries.length > 0
      ? [searchYouTube(youtubeKey, queryEntries, inputUrl), searchOpenWeb(ai, queryEntries, inputUrl)] as const
      : [Promise.resolve([] as SourceCandidate[]), Promise.resolve({ candidates: [] as SourceCandidate[], queries: [] as string[] })] as const;
    const [visionResult, youtubeSettled, webSettled] = await Promise.all([
      visionPromise,
      Promise.resolve(semanticSearches[0]).then((value) => ({ status: "fulfilled" as const, value })).catch((reason) => ({ status: "rejected" as const, reason })),
      Promise.resolve(semanticSearches[1]).then((value) => ({ status: "fulfilled" as const, value })).catch((reason) => ({ status: "rejected" as const, reason })),
    ]);
    const youtubeCandidates = youtubeSettled.status === "fulfilled" ? youtubeSettled.value : [];
    const webResult = webSettled.status === "fulfilled" ? webSettled.value : { candidates: [], queries: [] };

    const byUrl = new Map<string, SourceCandidate>();
    for (const candidate of [...visionResult.candidates, ...youtubeCandidates, ...webResult.candidates]) {
      const previous = byUrl.get(candidate.url);
      if (!previous) byUrl.set(candidate.url, candidate);
      else {
        previous.confidence = Math.max(previous.confidence, candidate.confidence);
        previous.frameIndexes = [...new Set([...previous.frameIndexes, ...candidate.frameIndexes])];
      }
    }
    const verified = await verifyYouTubeThumbnails(referenceFrames, [...byUrl.values()]);
    const candidates = verified
      .sort((a, b) => b.confidence - a.confidence || String(a.publishedAt || "9999").localeCompare(String(b.publishedAt || "9999")))
      .slice(0, 12);

    return NextResponse.json({
      success: true,
      summary: visual.summary || "프레임별 시각 단서로 해외 원본 후보를 자동 검색했습니다.",
      candidates,
      queries: [...queryEntries.map((entry) => entry.query), ...webResult.queries],
      searchedFrames: frameNames.length,
      vision: visionResult.status,
      notice: visionResult.status.succeeded
        ? "Google Vision 시각 일치 페이지를 우선 수집한 뒤 검색어 기반 후보를 보강했습니다. 후보의 실제 일치 구간 검증은 후속 단계입니다."
        : "Google Vision을 사용할 수 없어 검색어 기반 후보만 수집했습니다. GOOGLE_CLOUD_VISION_API_KEY와 API 활성화 상태를 확인하세요.",
    });
  } catch (error) {
    console.error("source discovery error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "자동 원본 탐색에 실패했습니다." }, { status: 500 });
  }
}
