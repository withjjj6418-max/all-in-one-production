import { NextRequest, NextResponse } from "next/server";

/**
 * YouTube URL에서 비디오 ID를 추출하는 함수
 */
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:v=|\/shorts\/|\/embed\/|\/v\/|youtu\.be\/|\/watch\?v=)([^#&?]{11})/,
    /^([^#&?]{11})$/ // ID만 입력한 경우 대응
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    // 1. URL 파라미터 체크
    if (!url) {
      return NextResponse.json(
        { success: false, error: "URL이 필요합니다" },
        { status: 400 }
      );
    }

    // 2. 비디오 ID 추출
    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json(
        { success: false, error: "올바른 YouTube URL이 아닙니다" },
        { status: 400 }
      );
    }

    // 3. API 키 체크
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      console.error("YOUTUBE_API_KEY is missing in env");
      return NextResponse.json(
        { success: false, error: "서버 설정 오류" },
        { status: 500 }
      );
    }

    // 4. YouTube Data API 호출
    const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${apiKey}`;
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { success: false, error: errorData.error?.message || "YouTube API 호출 실패" },
        { status: response.status }
      );
    }

    const data = await response.json();

    // 5. 영상 존재 여부 확인
    if (!data.items || data.items.length === 0) {
      return NextResponse.json(
        { success: false, error: "영상을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    const item = data.items[0];
    const { snippet, statistics, contentDetails } = item;

    // 6. 썸네일 우선순위 결정 (maxres > standard > high > medium > default)
    const thumbnails = snippet.thumbnails;
    const thumbnailUrl = 
      thumbnails.maxres?.url || 
      thumbnails.standard?.url || 
      thumbnails.high?.url || 
      thumbnails.medium?.url || 
      thumbnails.default?.url;

    // 7. 결과 반환
    return NextResponse.json({
      success: true,
      data: {
        videoId: item.id,
        title: snippet.title,
        description: snippet.description,
        channelName: snippet.channelTitle,
        channelId: snippet.channelId,
        thumbnailUrl: thumbnailUrl,
        publishedAt: snippet.publishedAt,
        viewCount: parseInt(statistics.viewCount || "0"),
        likeCount: parseInt(statistics.likeCount || "0"),
        commentCount: parseInt(statistics.commentCount || "0"),
        duration: contentDetails.duration
      }
    });

  } catch (error) {
    console.error("YouTube API Route Error:", error);
    return NextResponse.json(
      { success: false, error: "내부 서버 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
