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
  candidateMatches: number;
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

async function resolveGroundingUrl(rawUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const resolved = await fetch(rawUrl, { redirect: "follow", cache: "no-store", signal: controller.signal });
    const url = resolved.url || rawUrl;
    await resolved.body?.cancel();
    return url;
  } catch {
    return rawUrl;
  } finally {
    clearTimeout(timeout);
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
    candidateMatches: 0,
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
        if (fullMatches === 0 && partialMatches === 0) continue;
        const matchLabel = fullMatches > 0 ? "동일 이미지" : "부분 일치 이미지";
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
    status.candidateMatches = candidates.length;
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

function buildVisionIdentityQueries(
  candidates: SourceCandidate[],
  queries: Array<{ query: string; frameIndex: number; description: string }>,
) {
  const ignoredHandles = new Set(["shorts", "viral", "funny", "fyp", "reels", "instagram", "streamer", "boxing"]);
  const handles = new Map<string, number>();
  for (const candidate of candidates) {
    for (const match of candidate.title.matchAll(/[@#]([a-z][a-z0-9_.]{3,30})/gi)) {
      const handle = match[1].toLowerCase();
      if (!ignoredHandles.has(handle)) handles.set(handle, (handles.get(handle) || 0) + 1);
    }
  }
  const ignoredWords = new Set(["streamer", "stream", "video", "clip", "holding", "wearing", "asian", "white", "guy", "with", "from", "the", "towel", "cloth", "fabric", "beanie", "jacket", "looking", "down"]);
  const words = new Map<string, number>();
  for (const entry of queries) {
    for (const word of entry.query.toLowerCase().match(/[a-z0-9]{4,}/g) || []) {
      if (!ignoredWords.has(word)) words.set(word, (words.get(word) || 0) + 1);
    }
  }
  const identities = [...handles.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([handle]) => handle);
  const keywords = [...words.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([word]) => word);
  return identities.flatMap((identity) => [
    `${identity} ${keywords.join(" ")}`.trim(),
    `${identity} "${keywords[0] || "original"}" clip`,
  ]).map((query) => ({ query, frameIndex: 1, description: "Vision 페이지에서 반복 확인된 공개 크리에이터 핸들" }));
}

function buildCoreContentQueries(queries: Array<{ query: string; frameIndex: number; description: string }>) {
  const ignoredWords = new Set([
    "meme", "reaction", "video", "clip", "short", "shorts", "viral", "funny",
    "streamer", "stream", "holding", "wearing", "asian", "white", "guy", "with", "from", "the",
  ]);
  const words = new Map<string, number>();
  for (const entry of queries) {
    for (const word of entry.query.toLowerCase().match(/[a-z0-9]{4,}/g) || []) {
      if (!ignoredWords.has(word)) words.set(word, (words.get(word) || 0) + 1);
    }
  }
  const keywords = [...words.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([word]) => word);
  if (keywords.length < 2) return [];
  return [{ query: keywords.join(" "), frameIndex: 1, description: "여러 장면에서 반복된 핵심 사물·문구" }];
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
    endpoint.searchParams.set("maxResults", "10");
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
    config: { tools: [{ googleSearch: {} }], temperature: 0.1, maxOutputTokens: 700 },
  });
  const metadata = response.candidates?.[0]?.groundingMetadata;
  const candidates: SourceCandidate[] = [];
  const chunks = (metadata?.groundingChunks || []).slice(0, 12);
  const resolvedUrls = await Promise.all(chunks.map((chunk) => chunk.web?.uri ? resolveGroundingUrl(chunk.web.uri) : ""));
  for (const [index, chunk] of chunks.entries()) {
    const rawUrl = chunk.web?.uri;
    const title = chunk.web?.title || "웹 원출처 후보";
    if (!rawUrl || hasHangul(title)) continue;
    const resolvedUrl = resolvedUrls[index] || rawUrl;
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

async function searchGroundedVisual(
  ai: GoogleGenAI,
  referenceFrames: Buffer[],
  inputUrl: string,
  visionHints: SourceCandidate[],
) {
  const hintText = visionHints.slice(0, 8)
    .map((candidate) => `- ${candidate.title} (${candidate.url})`)
    .join("\n");
  const contents: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{
    text: `These are clean scene crops from a reposted livestream or social video. Use Google Search to identify public creators only with supporting evidence and find the exact underlying clip. Search exact visible phrases, creator names, room/setup clues and collaborations. Return concise findings with real direct YouTube, Instagram, TikTok or Xiaohongshu post URLs. Avoid generic topic/tutorial pages and do not invent URLs. Independent reverse-image results below may contain false positives; treat recurring creator names as hints and verify them against the frames:\n${hintText || "(no page-title hints)"}`,
  }];
  for (const [index, frame] of referenceFrames.entries()) {
    contents.push({ text: `CLEAN FRAME ${index + 1}` });
    contents.push({ inlineData: { mimeType: "image/jpeg", data: frame.toString("base64") } });
  }
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    config: { tools: [{ googleSearch: {} }], temperature: 0.1, maxOutputTokens: 700 },
  });
  const metadata = response.candidates?.[0]?.groundingMetadata;
  const candidates: SourceCandidate[] = [];
  const chunks = (metadata?.groundingChunks || []).slice(0, 12);
  const resolvedUrls = await Promise.all(chunks.map((chunk) => chunk.web?.uri ? resolveGroundingUrl(chunk.web.uri) : ""));
  for (const [index, chunk] of chunks.entries()) {
    const rawUrl = chunk.web?.uri;
    if (!rawUrl) continue;
    const resolvedUrl = resolvedUrls[index] || rawUrl;
    const url = normalizeUrl(resolvedUrl);
    const platform = platformFromUrl(url);
    if (!url || url === inputUrl || !isTargetVideoPlatform(platform)) continue;
    candidates.push({
      url,
      title: chunk.web?.title || "Google 검색 근거가 있는 시각 후보",
      reason: "깨끗하게 자른 실제 장면을 Google 검색과 함께 분석해 인물·문구·방송 환경이 연결된 게시물입니다.",
      confidence: 84,
      frameIndexes: referenceFrames.map((_, index) => index + 1),
      platform,
      originalType: "grounded_visual_source",
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
  const verifiable = candidates
    .filter((candidate) => candidate.thumbnail)
    .slice(0, 60);
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
      candidate.confidence = Math.round(candidate.confidence * 0.25 + visualMatch * 0.75);
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
    const visionResult = await visionPromise;
    const groundedVisualPromise = searchGroundedVisual(ai, referenceFrames, inputUrl, visionResult.candidates);
    const youtubePromise = queryEntries.length > 0
      ? searchYouTube(youtubeKey, queryEntries, inputUrl)
      : Promise.resolve([] as SourceCandidate[]);
    const openWebPromise = queryEntries.length > 0
      ? searchOpenWeb(ai, queryEntries, inputUrl)
      : Promise.resolve({ candidates: [] as SourceCandidate[], queries: [] as string[] });
    const [groundedVisualSettled, youtubeSettled, openWebSettled] = await Promise.allSettled([
      groundedVisualPromise,
      youtubePromise,
      openWebPromise,
    ]);
    const youtubeCandidates = youtubeSettled.status === "fulfilled" ? youtubeSettled.value : [];
    const groundedVisualResult = groundedVisualSettled.status === "fulfilled"
      ? groundedVisualSettled.value
      : { candidates: [], queries: [] };
    const webResult = openWebSettled.status === "fulfilled"
      ? openWebSettled.value
      : { candidates: [] as SourceCandidate[], queries: [] as string[] };
    const visionIdentityEntries = buildVisionIdentityQueries(visionResult.candidates, queryEntries);
    const coreContentEntries = buildCoreContentQueries(queryEntries);
    const groundedEntries = [...groundedVisualResult.queries]
      .sort((left, right) => {
        const priority = (value: string) => (/jason|lacy|creator|streamer/i.test(value) ? 3 : 0)
          + (/something|exact|shirt/i.test(value) ? 3 : 0)
          + (/youtube|clip|short/i.test(value) ? 1 : 0);
        return priority(right) - priority(left);
      })
      .slice(0, 4)
      .map((query) => ({ query, frameIndex: 1, description: "Google 검색으로 식별된 인물과 장면" }));
    const targetedEntries = [...coreContentEntries, ...visionIdentityEntries.slice(0, 1), ...groundedEntries.slice(0, 2)]
      .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.query.toLowerCase() === entry.query.toLowerCase()) === index)
      .slice(0, 4);
    const targetedYouTube = targetedEntries.length > 0
      ? await searchYouTube(youtubeKey, targetedEntries, inputUrl).catch(() => [] as SourceCandidate[])
      : [];
    for (const candidate of targetedYouTube) {
      candidate.originalType = "possible_source";
      candidate.confidence = Math.max(62, candidate.confidence);
      candidate.reason = `깨끗한 장면의 Google 검색에서 식별한 인물·문구로 YouTube를 재검색했습니다. ${candidate.reason}`;
    }
    const byUrl = new Map<string, SourceCandidate>();
    const evidenceRank: Record<string, number> = {
      grounded_visual_source: 5,
      vision_full_match: 4,
      vision_partial_match: 3,
      visually_matched_source: 2,
      possible_source: 1,
    };
    for (const candidate of [...visionResult.candidates, ...groundedVisualResult.candidates, ...targetedYouTube, ...youtubeCandidates, ...webResult.candidates]) {
      const previous = byUrl.get(candidate.url);
      if (!previous) byUrl.set(candidate.url, candidate);
      else {
        previous.confidence = Math.max(previous.confidence, candidate.confidence);
        previous.frameIndexes = [...new Set([...previous.frameIndexes, ...candidate.frameIndexes])];
        if ((evidenceRank[candidate.originalType] || 0) > (evidenceRank[previous.originalType] || 0)) {
          previous.originalType = candidate.originalType;
          previous.reason = candidate.reason;
          previous.grounded = candidate.grounded;
        }
      }
    }
    const verified = await verifyYouTubeThumbnails(referenceFrames, [...byUrl.values()]);
    const ranked = verified.sort((a, b) => b.confidence - a.confidence
      || (b.visualMatch || 0) - (a.visualMatch || 0)
      || String(a.publishedAt || "9999").localeCompare(String(b.publishedAt || "9999")));
    const candidates: SourceCandidate[] = [];
    const addCandidate = (candidate: SourceCandidate) => {
      if (candidates.length < 12 && !candidates.some((selected) => selected.url === candidate.url)) candidates.push(candidate);
    };
    ranked
      .filter((candidate) => candidate.visualMatch !== undefined)
      .sort((a, b) => (b.visualMatch || 0) - (a.visualMatch || 0) || b.confidence - a.confidence)
      .slice(0, 8)
      .forEach(addCandidate);
    ranked
      .filter((candidate) => candidate.originalType.startsWith("vision_") || candidate.originalType === "grounded_visual_source")
      .slice(0, 4)
      .forEach(addCandidate);
    ranked.forEach(addCandidate);

    await fs.writeFile(path.join(jobDir, "discovery-results.json"), JSON.stringify({
      inputUrl,
      queryEntries,
      visionIdentityEntries,
      groundedQueries: groundedVisualResult.queries,
      targetedEntries,
      vision: visionResult.status,
      candidates,
    }, null, 2), "utf8").catch((error) => {
      console.warn("failed to persist source discovery diagnostics", error);
    });

    return NextResponse.json({
      success: true,
      summary: visual.summary || "프레임별 시각 단서로 해외 원본 후보를 자동 검색했습니다.",
      candidates,
      queries: [...queryEntries.map((entry) => entry.query), ...groundedVisualResult.queries, ...webResult.queries],
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
