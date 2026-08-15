import { GoogleGenAI } from "@google/genai";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 180;

type Analysis = {
  index?: number;
  description?: string;
  ocr?: string[];
  watermarks?: string[];
  queries?: string[];
  jobId?: string;
};

type Candidate = {
  url: string;
  title: string;
  platform: string;
  confidence: number;
  publishedAt: string | null;
  reason: string;
  thumbnail: string | null;
};

type SerpDiagnostics = {
  uploadedFrames: number;
  lensSearches: number;
  textSearches: number;
  errors: string[];
};

function platformFromUrl(url: string) {
  const value = url.toLowerCase();
  if (value.includes("youtube.com") || value.includes("youtu.be")) return "youtube";
  if (value.includes("tiktok.com")) return "tiktok";
  if (value.includes("instagram.com")) return "instagram";
  if (value.includes("facebook.com") || value.includes("fb.watch")) return "facebook";
  if (value.includes("xiaohongshu.com") || value.includes("xhslink.com")) return "xiaohongshu";
  if (value.includes("reddit.com")) return "reddit";
  return "web";
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || ["feature", "si", "fbclid", "gclid", "igsh"].includes(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function directSocialBoost(platform: string) {
  return platform === "web" ? 0 : 20;
}

function rankingRepostPenalty(title: string) {
  return /(ranking|ranked|top\s*\d+|compilation|랭킹|순위|ランキング|まとめ)/iu.test(title) ? 18 : 0;
}

async function resolveGroundingUrl(rawUrl: string) {
  try {
    const response = await fetch(rawUrl, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    return normalizeUrl(response.url || rawUrl);
  } catch {
    return normalizeUrl(rawUrl);
  }
}

async function readFrames(jobId: string) {
  if (!/^[\w.-]+$/.test(jobId)) return [] as Buffer[];
  const root = path.resolve("source-finder", "outputs");
  const directory = path.resolve(root, jobId, "frames", "cropped");
  if (!directory.startsWith(`${root}${path.sep}`)) return [] as Buffer[];
  const names = (await fs.readdir(directory))
    .filter((name) => /^representative_\d+\.jpg$/i.test(name))
    .sort();
  const selected = names.length <= 3
    ? names
    : [names[0], names[Math.floor(names.length / 2)], names.at(-1)!];
  return Promise.all(selected.map((name) => fs.readFile(path.join(directory, name))));
}

function selectLensFrames(frames: Buffer[]) {
  if (frames.length <= 2) return frames;
  return [frames[Math.floor(frames.length / 2)], frames.at(-1)!];
}

async function uploadTemporaryFrame(apiKey: string, frame: Buffer) {
  const form = new URLSearchParams();
  form.set("image", frame.toString("base64"));
  const response = await fetch(`https://api.imgbb.com/1/upload?expiration=600&key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success || !payload.data?.url) {
    throw new Error(payload.error?.message || "ImgBB 임시 프레임 업로드 실패");
  }
  return String(payload.data.url);
}

function serpCandidate(item: Record<string, unknown>, source: "lens" | "text"): Candidate | null {
  const url = normalizeUrl(String(item.link || item.source || ""));
  if (!url) return null;
  const platform = platformFromUrl(url);
  const exact = item.exact_matches === true;
  return {
    url,
    title: String(item.title || (source === "lens" ? "Google Lens 유사 장면" : "Google 검색 후보")),
    platform,
    confidence: source === "lens" ? (exact ? 97 : 89) : (platform === "web" ? 68 : 78),
    publishedAt: null,
    reason: source === "lens"
      ? (exact ? "SerpApi Google Lens에서 정확히 일치하는 이미지로 표시된 후보입니다." : "SerpApi Google Lens 시각 일치 후보입니다.")
      : "OCR·워터마크·장면 설명을 조합한 Google 검색 후보입니다.",
    thumbnail: typeof item.thumbnail === "string" ? item.thumbnail : null,
  };
}

async function serpApiCandidates(apiKey: string, imgbbKey: string, analysis: Analysis, frames: Buffer[]) {
  const candidates: Candidate[] = [];
  const diagnostics: SerpDiagnostics = { uploadedFrames: 0, lensSearches: 0, textSearches: 0, errors: [] };
  const lensFrames = selectLensFrames(frames);

  const imageUrls = await Promise.all(lensFrames.map(async (frame) => {
    try {
      const imageUrl = await uploadTemporaryFrame(imgbbKey, frame);
      diagnostics.uploadedFrames += 1;
      return imageUrl;
    } catch (error) {
      diagnostics.errors.push(error instanceof Error ? error.message : "ImgBB 업로드 실패");
      return "";
    }
  }));

  const lensResults = await Promise.all(imageUrls.filter(Boolean).map(async (imageUrl) => {
    try {
      const endpoint = new URL("https://serpapi.com/search.json");
      endpoint.search = new URLSearchParams({
        engine: "google_lens",
        url: imageUrl,
        type: "all",
        hl: "en",
        country: "us",
        safe: "active",
        api_key: apiKey,
      }).toString();
      const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(45_000) });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "SerpApi Lens 검색 실패");
      diagnostics.lensSearches += 1;
      return [
        ...(Array.isArray(payload.visual_matches) ? payload.visual_matches : []),
        ...(Array.isArray(payload.exact_matches) ? payload.exact_matches : []),
      ] as Array<Record<string, unknown>>;
    } catch (error) {
      diagnostics.errors.push(error instanceof Error ? error.message : "SerpApi Lens 검색 실패");
      return [] as Array<Record<string, unknown>>;
    }
  }));
  for (const item of lensResults.flat()) {
    const candidate = serpCandidate(item, "lens");
    if (candidate) candidates.push(candidate);
  }

  const clues = [...(analysis.watermarks || []), ...(analysis.ocr || []), ...(analysis.queries || [])]
    .map(String)
    .map((value) => value.trim())
    .filter((value) => value.length >= 3)
    .slice(0, 5);
  const query = clues.length
    ? `${clues.map((value) => `"${value.replace(/^"|"$/g, "")}"`).join(" ")} (site:tiktok.com OR site:instagram.com OR site:youtube.com OR site:facebook.com OR site:reddit.com)`
    : `${analysis.description || "family funny moment"} original video`;

  try {
    const endpoint = new URL("https://serpapi.com/search.json");
    endpoint.search = new URLSearchParams({
      engine: "google",
      q: query,
      num: "20",
      hl: "en",
      gl: "us",
      safe: "active",
      api_key: apiKey,
    }).toString();
    const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(45_000) });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || "SerpApi 텍스트 검색 실패");
    diagnostics.textSearches += 1;
    for (const item of (payload.organic_results || []) as Array<Record<string, unknown>>) {
      const candidate = serpCandidate(item, "text");
      if (candidate) candidates.push(candidate);
    }
  } catch (error) {
    diagnostics.errors.push(error instanceof Error ? error.message : "SerpApi 텍스트 검색 실패");
  }

  return { candidates, diagnostics };
}

async function visionCandidates(apiKey: string, frames: Buffer[]) {
  if (!frames.length) return [] as Candidate[];
  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: frames.map((frame) => ({
        image: { content: frame.toString("base64") },
        features: [{ type: "WEB_DETECTION", maxResults: 30 }],
      })),
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const payload = await response.json();
  if (!response.ok) return [] as Candidate[];
  const found = new Map<string, Candidate>();
  for (const result of payload.responses || []) {
    for (const page of result.webDetection?.pagesWithMatchingImages || []) {
      const url = normalizeUrl(page.url || page.pageUrl || "");
      if (!url) continue;
      const platform = platformFromUrl(url);
      const exact = (page.fullMatchingImages || []).length > 0;
      const partial = (page.partialMatchingImages || []).length > 0;
      const confidence = exact ? 96 : partial ? 86 : 72;
      const previous = found.get(url);
      if (!previous || confidence > previous.confidence) {
        found.set(url, {
          url,
          title: page.pageTitle || "Google Vision 이미지 일치 페이지",
          platform,
          confidence,
          publishedAt: null,
          reason: exact
            ? "Google Vision에서 동일 이미지가 확인된 페이지입니다."
            : partial
              ? "Google Vision에서 부분 일치 이미지가 확인된 페이지입니다."
              : "Google Vision 시각 검색 결과입니다.",
          thumbnail: null,
        });
      }
    }
  }
  return [...found.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 12);
}

async function groundedCandidates(ai: GoogleGenAI, analysis: Analysis, frames: Buffer[]) {
  const clues = [...(analysis.watermarks || []), ...(analysis.ocr || []), ...(analysis.queries || [])]
    .filter(Boolean)
    .slice(0, 10);
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{
    text: `Find the exact original public social-media video shown in these frames. Search the web using exact quoted text, creator handles, visual action and repost citations. Clues:\n${clues.map((item) => `- ${item}`).join("\n")}\nScene: ${analysis.description || "unknown"}\nPrioritize direct TikTok, Instagram Reel, YouTube Shorts, Facebook video, Reddit video or Xiaohongshu post URLs. Exclude compilation, ranking and reaction reposts. Do not invent URLs.`,
  }];
  frames.forEach((frame, index) => {
    parts.push({ text: `FRAME ${index + 1}` });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: frame.toString("base64") } });
  });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: parts,
    config: { tools: [{ googleSearch: {} }], temperature: 0.05, maxOutputTokens: 600 },
  });
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const resolved = await Promise.all(chunks.slice(0, 15).map((chunk) => chunk.web?.uri ? resolveGroundingUrl(chunk.web.uri) : ""));
  return resolved.map((url, index): Candidate | null => url ? {
    url,
    title: chunks[index]?.web?.title || "Google 검색 근거 후보",
    platform: platformFromUrl(url),
    confidence: 82,
    publishedAt: null,
    reason: "장면 이미지와 OCR 문구를 함께 사용한 Google 검색 근거 후보입니다.",
    thumbnail: null,
  } : null).filter((item): item is Candidate => Boolean(item));
}

async function youtubeCandidates(apiKey: string, analysis: Analysis) {
  const strongest = [...(analysis.watermarks || []), ...(analysis.ocr || []), ...(analysis.queries || [])]
    .map(String)
    .map((value) => value.trim())
    .filter((value) => value.length >= 4)
    .slice(0, 3);
  const found = new Map<string, Candidate>();
  for (const query of strongest) {
    const endpoint = new URL("https://www.googleapis.com/youtube/v3/search");
    endpoint.search = new URLSearchParams({
      part: "snippet",
      type: "video",
      order: "relevance",
      maxResults: "5",
      q: `"${query.replace(/^"|"$/g, "")}"`,
      key: apiKey,
    }).toString();
    const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    const payload = await response.json();
    if (!response.ok) continue;
    for (const item of payload.items || []) {
      const id = item.id?.videoId;
      if (!id || found.has(id)) continue;
      found.set(id, {
        url: `https://www.youtube.com/watch?v=${id}`,
        title: item.snippet?.title || "제목 없음",
        platform: "youtube",
        confidence: 58,
        publishedAt: item.snippet?.publishedAt?.slice(0, 10) || null,
        reason: `정확 문구 ‘${query}’ YouTube 검색 후보입니다.`,
        thumbnail: item.snippet?.thumbnails?.high?.url || null,
      });
    }
  }
  return [...found.values()];
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const youtubeKey = process.env.YOUTUBE_API_KEY?.trim();
    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    const visionKey = (process.env.GOOGLE_CLOUD_VISION_API_KEY || geminiKey)?.trim();
    const serpApiKey = process.env.SERPAPI_API_KEY?.trim();
    const imgbbKey = process.env.IMGBB_API_KEY?.trim();
    if (!youtubeKey || !geminiKey || !visionKey || !serpApiKey || !imgbbKey) {
      return NextResponse.json({ error: "YouTube·Gemini·Google Vision·SerpApi·ImgBB API 설정이 필요합니다." }, { status: 503 });
    }

    const body = await request.json() as { analyses?: Analysis[] };
    const analyses = (body.analyses || []).slice(0, 7);
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const results = [];

    for (let offset = 0; offset < analyses.length; offset += 2) {
      results.push(...await Promise.all(analyses.slice(offset, offset + 2).map(async (analysis) => {
        const frames = await readFrames(String(analysis.jobId || ""));
        const [serp, vision, grounded, youtube] = await Promise.all([
          serpApiCandidates(serpApiKey, imgbbKey, analysis, frames),
          visionCandidates(visionKey, frames).catch(() => [] as Candidate[]),
          groundedCandidates(ai, analysis, frames).catch(() => [] as Candidate[]),
          youtubeCandidates(youtubeKey, analysis).catch(() => [] as Candidate[]),
        ]);

        const byUrl = new Map<string, Candidate>();
        for (const candidate of [...serp.candidates, ...vision, ...grounded, ...youtube]) {
          const previous = byUrl.get(candidate.url);
          if (!previous || candidate.confidence > previous.confidence) byUrl.set(candidate.url, candidate);
        }
        const candidates = [...byUrl.values()].sort((a, b) =>
          (b.confidence + directSocialBoost(b.platform) - rankingRepostPenalty(b.title))
          - (a.confidence + directSocialBoost(a.platform) - rankingRepostPenalty(a.title)),
        ).slice(0, 12);

        return {
          index: Number(analysis.index),
          jobId: analysis.jobId,
          description: analysis.description || "",
          candidates,
          diagnostics: {
            serpLens: serp.diagnostics.lensSearches,
            serpText: serp.diagnostics.textSearches,
            imgbbUploads: serp.diagnostics.uploadedFrames,
            serpErrors: serp.diagnostics.errors,
            vision: vision.length,
            grounded: grounded.length,
            youtube: youtube.length,
          },
        };
      })));
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "전체 원본 후보 검색에 실패했습니다.",
    }, { status: 500 });
  }
}
