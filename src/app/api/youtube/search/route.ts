/**
 * YouTube 검색 API
 * 1회 호출당 사용 unit:
 * - search.list: 100 unit
 * - videos.list (10개 영상): 1 unit
 * - channels.list: 1 unit
 * 총 약 102 unit / 검색
 * 일일 무료 한도: 10,000 unit (약 98회 검색 가능)
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const maxSubscribers = searchParams.get("maxSubscribers") ? parseInt(searchParams.get("maxSubscribers")!) : null;
    const minViews = searchParams.get("minViews") ? parseInt(searchParams.get("minViews")!) : null;
    const periodDays = searchParams.get("periodDays") ? parseInt(searchParams.get("periodDays")!) : null;
    const regionCode = searchParams.get("regionCode") || "KR";

    // 1. 필수 파라미터 체크
    if (!q) {
      return NextResponse.json(
        { success: false, error: "검색 키워드가 필요합니다" },
        { status: 400 }
      );
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      console.error("YOUTUBE_API_KEY is missing in env");
      return NextResponse.json(
        { success: false, error: "서버 설정 오류" },
        { status: 500 }
      );
    }

    // ─── 1단계: search.list 호출 ───
    let searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&order=relevance&maxResults=10&key=${apiKey}`;
    
    if (regionCode !== "WORLD") {
      searchUrl += `&regionCode=${regionCode}&relevanceLanguage=${regionCode.toLowerCase() === 'kr' ? 'ko' : regionCode.toLowerCase()}`;
    }

    if (periodDays) {
      const publishedAfter = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();
      searchUrl += `&publishedAfter=${publishedAfter}`;
    }

    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      const errorData = await searchResponse.json();
      return NextResponse.json(
        { success: false, error: errorData.error?.message || "YouTube Search API 호출 실패" },
        { status: 500 }
      );
    }

    const searchData = await searchResponse.json();
    const items = searchData.items || [];

    if (items.length === 0) {
      return NextResponse.json({
        success: true,
        totalResults: 0,
        filteredCount: 0,
        data: []
      });
    }

    const videoIds = items.map((item: any) => item.id.videoId).join(",");
    const channelIds = Array.from(new Set(items.map((item: any) => item.snippet.channelId))).join(",");

    // ─── 2단계: videos.list 호출 (통계 및 상세 정보) ───
    const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}&key=${apiKey}`;
    const videosResponse = await fetch(videosUrl);
    if (!videosResponse.ok) {
      const errorData = await videosResponse.json();
      return NextResponse.json(
        { success: false, error: errorData.error?.message || "YouTube Videos API 호출 실패" },
        { status: 500 }
      );
    }
    const videosData = await videosResponse.json();

    // ─── 3단계: channels.list 호출 (구독자 수) ───
    const channelsUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelIds}&key=${apiKey}`;
    const channelsResponse = await fetch(channelsUrl);
    if (!channelsResponse.ok) {
      const errorData = await channelsResponse.json();
      return NextResponse.json(
        { success: false, error: errorData.error?.message || "YouTube Channels API 호출 실패" },
        { status: 500 }
      );
    }
    const channelsData = await channelsResponse.json();

    // 데이터 매핑 및 필터링 준비
    const channelStatsMap = new Map();
    channelsData.items?.forEach((item: any) => {
      channelStatsMap.set(item.id, parseInt(item.statistics.subscriberCount || "0"));
    });

    const results = videosData.items.map((video: any) => {
      const snippet = video.snippet;
      const statistics = video.statistics;
      const contentDetails = video.contentDetails;
      const channelSubscribers = channelStatsMap.get(snippet.channelId) || 0;

      const thumbnails = snippet.thumbnails;
      const thumbnailUrl =
        thumbnails.maxres?.url ||
        thumbnails.standard?.url ||
        thumbnails.high?.url ||
        thumbnails.medium?.url ||
        thumbnails.default?.url;

      return {
        videoId: video.id,
        title: snippet.title,
        description: snippet.description,
        channelName: snippet.channelTitle,
        channelId: snippet.channelId,
        channelSubscribers: channelSubscribers,
        thumbnailUrl: thumbnailUrl,
        publishedAt: snippet.publishedAt,
        viewCount: parseInt(statistics.viewCount || "0"),
        likeCount: parseInt(statistics.likeCount || "0"),
        commentCount: parseInt(statistics.commentCount || "0"),
        duration: contentDetails.duration
      };
    });

    // ─── 4단계: 서버 사이드 필터링 ───
    let filteredResults = results;

    if (maxSubscribers !== null) {
      filteredResults = filteredResults.filter((v: any) => v.channelSubscribers <= maxSubscribers);
    }

    if (minViews !== null) {
      filteredResults = filteredResults.filter((v: any) => v.viewCount >= minViews);
    }

    return NextResponse.json({
      success: true,
      totalResults: results.length,
      filteredCount: filteredResults.length,
      data: filteredResults
    });

  } catch (error) {
    console.error("YouTube Search Route Error:", error);
    return NextResponse.json(
      { success: false, error: "내부 서버 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
