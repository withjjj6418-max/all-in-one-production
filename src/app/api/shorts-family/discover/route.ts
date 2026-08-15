import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

let discoveryCache: { expiresAt: number; videos: unknown[]; searchedQueries: string[] } | null = null;

type YouTubeSearchItem = { id?: { videoId?: string } };
type YouTubeVideo = {
  id: string;
  snippet?: { title?: string; description?: string; publishedAt?: string; channelTitle?: string; thumbnails?: Record<string, { url?: string }> };
  statistics?: { viewCount?: string; likeCount?: string };
  contentDetails?: { duration?: string };
};

function secondsFromIsoDuration(value = "") {
  const match = value.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return match ? Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0) : 0;
}

async function youtubeJson<T>(url: URL) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || "YouTube API 호출에 실패했습니다.");
  return payload;
}

async function searchIds(apiKey: string, query: string, publishedAfter?: string, maxPages = 1, channelId = "") {
  const ids: string[] = [];
  let pageToken = "";
  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.search = new URLSearchParams({ part: "id", type: "video", order: "viewCount", maxResults: "50", key: apiKey,
      ...(query ? { q: query } : {}), ...(channelId ? { channelId } : {}), ...(publishedAfter ? { publishedAfter } : {}), ...(pageToken ? { pageToken } : {}) }).toString();
    const data = await youtubeJson<{ items?: YouTubeSearchItem[]; nextPageToken?: string }>(url);
    ids.push(...(data.items || []).map((item) => item.id?.videoId || "").filter(Boolean));
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }
  return ids;
}

async function videoDetails(apiKey: string, ids: string[]) {
  const videos: YouTubeVideo[] = [];
  for (let index = 0; index < ids.length; index += 50) {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.search = new URLSearchParams({ part: "snippet,statistics,contentDetails", id: ids.slice(index, index + 50).join(","), key: apiKey }).toString();
    const data = await youtubeJson<{ items?: YouTubeVideo[] }>(url);
    videos.push(...(data.items || []));
  }
  return videos;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const apiKey = process.env.YOUTUBE_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "YOUTUBE_API_KEY가 설정되지 않았습니다." }, { status: 503 });
    const body = await request.json().catch(() => ({})) as { force?: boolean; extraQueries?: string[] };
    if (!body.force && discoveryCache && discoveryCache.expiresAt > Date.now()) {
      return NextResponse.json({ success: true, cached: true, criteria: "1,000만+ 또는 게시 7일 이내 300만+, 조회 속도와 게시 경과시간 우선", searchedQueries: discoveryCache.searchedQueries, videos: discoveryCache.videos });
    }
    const recentAfter = new Date(Date.now() - 7 * 86400000).toISOString();
    const searches = [
      { query: "funny babies ranking top 5 shorts", recent: false },
      { query: "funny kids moments ranking shorts", recent: false },
      { query: "family funny moments top 5 shorts", recent: false },
      { query: "赤ちゃん 面白い ランキング shorts", recent: false },
      { query: "子供 ハプニング 5選 shorts", recent: false },
      { query: "家族 爆笑 ランキング shorts", recent: false },
      { query: "baby family ranking viral shorts", recent: true },
      { query: "赤ちゃん 子供 家族 ランキング", recent: true },
      ...(body.extraQueries || []).map(String).map((value) => value.trim()).filter(Boolean).slice(0, 2).map((query) => ({ query, recent: false })),
    ];
    const batches = await Promise.all(searches.map((search) => searchIds(apiKey, search.query, search.recent ? recentAfter : undefined)));
    const sourceQueries = new Map<string, string[]>();
    batches.forEach((batch, index) => batch.forEach((id) => sourceQueries.set(id, [...(sourceQueries.get(id) || []), searches[index].query])));
    const ids = [...new Set(batches.flat())].slice(0, 450);
    const now = Date.now();
    const rankingMarker = /(ランキング|ランク|TOP\s*\d*|ベスト\s*\d*|\d+選|まとめ|rank(?:ing)?|top\s*\d*)/iu;
    const familyMarker = /(赤ちゃん|子供|こども|家族|パパ|ママ|baby|kid|child|family|dad|mom)/iu;
    const videos = (await videoDetails(apiKey, ids)).map((video) => {
      const publishedAt = video.snippet?.publishedAt || new Date(0).toISOString();
      const ageHours = Math.max(1, (now - new Date(publishedAt).getTime()) / 3600000);
      const ageDays = ageHours / 24;
      const viewCount = Number(video.statistics?.viewCount || 0);
      const viewsPerHour = Math.round(viewCount / ageHours);
      const text = `${video.snippet?.title || ""} ${video.snippet?.description || ""}`;
      const matchedQueries = sourceQueries.get(video.id) || [];
      const rankingLike = rankingMarker.test(text) || matchedQueries.length > 0;
      const familyLike = familyMarker.test(text) || matchedQueries.length > 0;
      const tenMillion = viewCount >= 10_000_000;
      const rapidHit = ageDays <= 7 && viewCount >= 3_000_000;
      const qualified = rankingLike && familyLike && (tenMillion || rapidHit);
      const thumbnails = video.snippet?.thumbnails || {};
      const thumbnailUrl = thumbnails.maxres?.url || thumbnails.standard?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || "";
      return {
        videoId: video.id, url: `https://www.youtube.com/shorts/${video.id}`, title: video.snippet?.title || "제목 없음",
        channelName: video.snippet?.channelTitle || "", publishedAt, ageDays: Number(ageDays.toFixed(2)), viewCount,
        likeCount: Number(video.statistics?.likeCount || 0), viewsPerHour, durationSeconds: secondsFromIsoDuration(video.contentDetails?.duration),
        thumbnailUrl, qualified, referenceChannel: false, matchedQueries, reason: rapidHit ? `7일 이내 ${Math.round(viewCount / 10000).toLocaleString()}만 조회` : tenMillion ? "누적 1,000만 조회 이상" : "관찰 후보",
        score: Math.round(Math.log10(Math.max(10, viewCount)) * 100000 + viewsPerHour * 8 - ageHours * 3),
      };
    }).filter((video) => video.durationSeconds > 0 && video.durationSeconds <= 180 && video.qualified)
      .sort((left, right) => Number(right.qualified) - Number(left.qualified) || right.score - left.score || right.viewCount - left.viewCount)
      .slice(0, 20);
    discoveryCache = { expiresAt: Date.now() + 6 * 3600000, videos, searchedQueries: searches.map((search) => search.query) };
    return NextResponse.json({ success: true, cached: false, criteria: "1,000만+ 또는 게시 7일 이내 300만+, 조회 속도와 게시 경과시간 우선", searchedQueries: searches.map((search) => search.query), videos });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "랭킹형쇼츠 발굴에 실패했습니다." }, { status: 500 });
  }
}
