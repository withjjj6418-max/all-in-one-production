import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 180;

type SearchItem = { id?: { videoId?: string } };
type YouTubeVideo = {
  id: string;
  snippet?: { title?: string; description?: string; publishedAt?: string; channelId?: string; channelTitle?: string; thumbnails?: Record<string, { url?: string }> };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
};
type HotVideoRow = {
  id: string; video_id: string; url: string; title: string; channel_id: string; channel_name: string; country: string; category: string;
  thumbnail_url: string; published_at: string; duration_seconds: number; first_seen_at: string; last_seen_at: string;
  latest_view_count: number; latest_like_count: number; latest_comment_count: number; dismissed_at: string | null; saved_at: string | null;
};
type SnapshotRow = { hot_video_id: string; captured_at: string; view_count: number; like_count: number; comment_count: number };

const DISCOVERY_QUERIES = [
  { query: "funny baby family ranking shorts", country: "US", language: "en" },
  { query: "funny kids family top 5 shorts", country: "US", language: "en" },
  { query: "赤ちゃん 面白い ランキング ショート", country: "JP", language: "ja" },
  { query: "子供 家族 ハプニング 5選", country: "JP", language: "ja" },
  { query: "아기 가족 웃긴 랭킹 쇼츠", country: "KR", language: "ko" },
  { query: "어린이 가족 해프닝 TOP5 쇼츠", country: "KR", language: "ko" },
] as const;

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

async function searchRecent(apiKey: string, query: string, country: string, language: string, publishedAfter: string) {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.search = new URLSearchParams({ part: "id", type: "video", order: "date", maxResults: "50", key: apiKey, q: query,
    publishedAfter, regionCode: country, relevanceLanguage: language }).toString();
  const data = await youtubeJson<{ items?: SearchItem[] }>(url);
  return (data.items || []).map((item) => item.id?.videoId || "").filter(Boolean);
}

async function videoDetails(apiKey: string, ids: string[]) {
  const output: YouTubeVideo[] = [];
  for (let index = 0; index < ids.length; index += 50) {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.search = new URLSearchParams({ part: "snippet,statistics,contentDetails", id: ids.slice(index, index + 50).join(","), key: apiKey }).toString();
    const data = await youtubeJson<{ items?: YouTubeVideo[] }>(url);
    output.push(...(data.items || []));
  }
  return output;
}

function categoryFor(text: string) {
  if (/(赤ちゃん|아기|baby|toddler)/iu.test(text)) return "아기";
  if (/(子供|こども|어린이|아이|kid|child)/iu.test(text)) return "어린이";
  if (/(ランキング|ランク|랭킹|순위|top\s*\d|ranking)/iu.test(text)) return "랭킹형";
  return "가족";
}

function closestAtOrBefore(rows: SnapshotRow[], timestamp: number) {
  return rows.find((row) => new Date(row.captured_at).getTime() <= timestamp) || null;
}

function metricFor(video: HotVideoRow, snapshots: SnapshotRow[], compareHours: number) {
  const now = Date.now();
  const published = new Date(video.published_at).getTime();
  const ageHours = Math.max(1, (now - published) / 3600000);
  const rows = snapshots.slice().sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime());
  const latest = rows[0];
  const currentViews = Number(latest?.view_count ?? video.latest_view_count ?? 0);
  const target = now - compareHours * 3600000;
  const previousTarget = now - compareHours * 2 * 3600000;
  const baseline = closestAtOrBefore(rows, target);
  const previousBaseline = closestAtOrBefore(rows, previousTarget);
  const latestTime = latest ? new Date(latest.captured_at).getTime() : now;
  const measuredHours = baseline ? Math.max(0.05, (latestTime - new Date(baseline.captured_at).getTime()) / 3600000) : 0;
  const viewDelta = baseline ? Math.max(0, currentViews - Number(baseline.view_count)) : 0;
  const measuredSpeed = baseline ? Math.round(viewDelta / measuredHours) : null;
  const averageSpeed = Math.round(currentViews / ageHours);
  const speed = measuredSpeed ?? averageSpeed;
  let acceleration: number | null = null;
  if (baseline && previousBaseline) {
    const previousHours = Math.max(0.05, (new Date(baseline.captured_at).getTime() - new Date(previousBaseline.captured_at).getTime()) / 3600000);
    const previousSpeed = Math.max(0, (Number(baseline.view_count) - Number(previousBaseline.view_count)) / previousHours);
    acceleration = previousSpeed > 0 ? Number((speed / previousSpeed).toFixed(2)) : null;
  }
  const ageDays = ageHours / 24;
  const verified = ageDays <= 7 && currentViews >= 3_000_000;
  const detecting = ageDays <= 7 && currentViews >= 1_000_000;
  const status = verified ? "verified" : detecting ? "detecting" : "tracking";
  const badge = speed >= 100_000 || Number(acceleration || 0) >= 2 ? "Hot" : speed >= 20_000 ? "고속" : speed >= 10_000 ? "급상승" : speed >= 5_000 ? "상승 중" : "관찰";
  const score = speed * 0.5 + speed * Math.min(3, Number(acceleration || 1)) * 0.25 + Math.max(0, 168 - ageHours) * 1000 * 0.15;
  return { ...video, ageHours, ageDays, currentViews, viewDelta, speed, acceleration, speedEstimated: !baseline, status, badge, score };
}

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const params = new URL(request.url).searchParams;
    const compareHours = Math.min(24, Math.max(1, Number(params.get("hours") || 3)));
    const country = params.get("country") || "ALL";
    const category = params.get("category") || "전체";
    const state = params.get("state") || "active";
    const sort = params.get("sort") || "rising";
    const query = (params.get("q") || "").trim().toLocaleLowerCase();
    const { data: videos, error } = await supabase.from("shorts_family_hot_videos").select("*").order("published_at", { ascending: false }).limit(1000);
    if (error) throw error;
    const rows = (videos || []) as HotVideoRow[];
    const { data: configs } = await supabase.from("shorts_family_configs").select("discovery_review");
    const importedVideoIds = new Set<string>();
    for (const config of configs || []) {
      const review = config.discovery_review && typeof config.discovery_review === "object" ? config.discovery_review as Record<string, string> : {};
      Object.entries(review).forEach(([videoId, reviewState]) => { if (reviewState === "selected") importedVideoIds.add(videoId); });
    }
    const ids = rows.map((video) => video.id);
    const since = new Date(Date.now() - 50 * 3600000).toISOString();
    const snapshots: SnapshotRow[] = [];
    for (let index = 0; index < ids.length; index += 20) {
      const { data, error: snapshotError } = await supabase.from("shorts_family_hot_snapshots")
        .select("hot_video_id,captured_at,view_count,like_count,comment_count")
        .in("hot_video_id", ids.slice(index, index + 20)).gte("captured_at", since).order("captured_at", { ascending: false }).limit(1000);
      if (snapshotError) throw snapshotError;
      snapshots.push(...((data || []) as SnapshotRow[]));
    }
    const grouped = new Map<string, SnapshotRow[]>();
    for (const snapshot of snapshots) grouped.set(snapshot.hot_video_id, [...(grouped.get(snapshot.hot_video_id) || []), snapshot]);
    const allMetrics = rows.map((video) => metricFor(video, grouped.get(video.id) || [], compareHours));
    const metrics = allMetrics.filter((video) => state === "dismissed" ? Boolean(video.dismissed_at) : !video.dismissed_at && !video.saved_at && !importedVideoIds.has(video.video_id))
      .filter((video) => country === "ALL" || video.country === country)
      .filter((video) => category === "전체" || video.category === category)
      .filter((video) => !query || `${video.title} ${video.channel_name}`.toLocaleLowerCase().includes(query))
      .filter((video) => state === "all" || state === "dismissed" || state === "tracking" ? true : state === "verified" ? video.status === "verified" : video.status === "detecting" || video.status === "verified");
    metrics.sort((left, right) => sort === "views" ? right.currentViews - left.currentViews : sort === "latest" ? new Date(right.published_at).getTime() - new Date(left.published_at).getTime() : right.score - left.score);
    const lastUpdatedAt = rows.reduce<string | null>((latest, video) => !latest || video.last_seen_at > latest ? video.last_seen_at : latest, null);
    return NextResponse.json({ success: true, compareHours, lastUpdatedAt, counts: {
      active: rows.filter((video) => !video.dismissed_at && !video.saved_at && !importedVideoIds.has(video.video_id)).length,
      dismissed: rows.filter((video) => video.dismissed_at).length,
      detecting: allMetrics.filter((video) => !video.dismissed_at && !video.saved_at && !importedVideoIds.has(video.video_id) && video.status === "detecting").length,
      verified: allMetrics.filter((video) => !video.dismissed_at && !video.saved_at && !importedVideoIds.has(video.video_id) && video.status === "verified").length,
    }, videos: metrics.slice(0, 200) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "급상승 영상을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const body = await request.json().catch(() => ({})) as { action?: string; videoId?: string; reason?: string };
    if (body.action === "dismiss" || body.action === "restore" || body.action === "save") {
      if (!body.videoId) return NextResponse.json({ error: "영상 ID가 필요합니다." }, { status: 400 });
      const patch = body.action === "dismiss" ? { dismissed_at: new Date().toISOString(), dismissed_reason: body.reason || "사용자 제외" }
        : body.action === "restore" ? { dismissed_at: null, dismissed_reason: "" }
          : { saved_at: new Date().toISOString() };
      const { error } = await supabase.from("shorts_family_hot_videos").update(patch).eq("video_id", body.videoId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }
    const apiKey = process.env.YOUTUBE_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "YOUTUBE_API_KEY가 설정되지 않았습니다." }, { status: 503 });
    let countryById = new Map<string, string>();
    let ids: string[] = [];
    if (body.action === "discover") {
      const publishedAfter = new Date(Date.now() - 7 * 86400000).toISOString();
      const batches = await Promise.all(DISCOVERY_QUERIES.map((item) => searchRecent(apiKey, item.query, item.country, item.language, publishedAfter)));
      batches.forEach((batch, index) => batch.forEach((id) => { if (!countryById.has(id)) countryById.set(id, DISCOVERY_QUERIES[index].country); }));
      ids = [...new Set(batches.flat())];
    } else {
      const after = new Date(Date.now() - 8 * 86400000).toISOString();
      const { data, error } = await supabase.from("shorts_family_hot_videos").select("video_id,country").is("dismissed_at", null).gte("published_at", after).limit(1000);
      if (error) throw error;
      ids = (data || []).map((item) => String(item.video_id));
      countryById = new Map((data || []).map((item) => [String(item.video_id), String(item.country || "ALL")]));
    }
    if (!ids.length) return NextResponse.json({ success: true, discovered: 0, tracked: 0, message: "갱신할 영상이 없습니다." });
    const details = await videoDetails(apiKey, ids);
    const now = new Date().toISOString();
    const media = details.map((video) => {
      const text = `${video.snippet?.title || ""} ${video.snippet?.description || ""}`;
      const thumbnails = video.snippet?.thumbnails || {};
      return {
        user_id: user.id, video_id: video.id, url: `https://www.youtube.com/shorts/${video.id}`, title: video.snippet?.title || "제목 없음",
        channel_id: video.snippet?.channelId || "", channel_name: video.snippet?.channelTitle || "", country: countryById.get(video.id) || "ALL",
        category: categoryFor(text), thumbnail_url: thumbnails.maxres?.url || thumbnails.standard?.url || thumbnails.high?.url || thumbnails.medium?.url || "",
        published_at: video.snippet?.publishedAt || now, duration_seconds: secondsFromIsoDuration(video.contentDetails?.duration), last_seen_at: now,
        latest_view_count: Number(video.statistics?.viewCount || 0), latest_like_count: Number(video.statistics?.likeCount || 0), latest_comment_count: Number(video.statistics?.commentCount || 0), updated_at: now,
      };
    }).filter((video) => video.duration_seconds > 0 && video.duration_seconds <= 180 && Date.now() - new Date(video.published_at).getTime() <= 7 * 86400000);
    if (!media.length) return NextResponse.json({ success: true, discovered: 0, tracked: 0, message: "조건에 맞는 쇼츠가 없습니다." });
    const { data: upserted, error: upsertError } = await supabase.from("shorts_family_hot_videos").upsert(media, { onConflict: "user_id,video_id" }).select("id,video_id,latest_view_count,latest_like_count,latest_comment_count,dismissed_at");
    if (upsertError) throw upsertError;
    const snapshotRows = (upserted || []).filter((video) => !video.dismissed_at).map((video) => ({ user_id: user.id, hot_video_id: video.id, captured_at: now,
      view_count: video.latest_view_count, like_count: video.latest_like_count, comment_count: video.latest_comment_count }));
    if (snapshotRows.length) {
      const { error } = await supabase.from("shorts_family_hot_snapshots").insert(snapshotRows);
      if (error) throw error;
    }
    return NextResponse.json({ success: true, discovered: body.action === "discover" ? media.length : 0, tracked: snapshotRows.length, capturedAt: now });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "급상승 수집에 실패했습니다." }, { status: 500 });
  }
}
