import { NextResponse } from 'next/server'
import { YoutubeTranscript } from 'youtube-transcript'

/**
 * YouTube 영상 정보 및 자막 추출 API
 */

function extractVideoId(url: string): string | null {
    const patterns = [
        /(?:v=|\/shorts\/|\/embed\/|\/v\/|youtu\.be\/|\/watch\?v=)([^#&?]{11})/,
        /^([^#&?]{11})$/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) return match[1];
    }
    return null;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const url = searchParams.get('url')

    if (!url) {
        return NextResponse.json({ 
            success: false, 
            error: 'YouTube URL이 필요합니다.' 
        }, { status: 400 })
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
        return NextResponse.json({ 
            success: false, 
            error: '유효한 YouTube Video ID를 찾을 수 없습니다.' 
        }, { status: 400 })
    }

    try {
        const apiKey = process.env.YOUTUBE_API_KEY;
        
        // 1. 메타데이터와 자막을 병렬로 요청
        const [metaRes, transcriptData] = await Promise.allSettled([
            fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${apiKey}`),
            YoutubeTranscript.fetchTranscript(videoId)
        ]);

        let metadata: any = null;
        if (metaRes.status === 'fulfilled' && metaRes.value.ok) {
            const metaJson = await metaRes.value.json();
            if (metaJson.items && metaJson.items.length > 0) {
                const item = metaJson.items[0];
                const { snippet, statistics, contentDetails } = item;
                const thumbnails = snippet.thumbnails;
                metadata = {
                    videoId: item.id,
                    title: snippet.title,
                    description: snippet.description,
                    channelName: snippet.channelTitle,
                    channelId: snippet.channelId,
                    thumbnailUrl: thumbnails.maxres?.url || thumbnails.standard?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url,
                    publishedAt: snippet.publishedAt,
                    viewCount: parseInt(statistics.viewCount || "0"),
                    likeCount: parseInt(statistics.likeCount || "0"),
                    commentCount: parseInt(statistics.commentCount || "0"),
                    duration: contentDetails.duration,
                    channelSubscribers: 0 // 기본값
                };

                // 채널 정보(구독자 수) 추가 요청
                try {
                    const channelRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${snippet.channelId}&key=${apiKey}`);
                    if (channelRes.ok) {
                        const channelJson = await channelRes.json();
                        if (channelJson.items && channelJson.items.length > 0) {
                            metadata.channelSubscribers = parseInt(channelJson.items[0].statistics.subscriberCount || "0");
                        }
                    }
                } catch (e) {
                    console.error('Failed to fetch channel stats:', e);
                }
            }
        }

        if (!metadata) {
            return NextResponse.json({ success: false, error: '영상을 찾을 수 없습니다.' }, { status: 404 });
        }

        // 자막 처리
        let fullText = null;
        if (transcriptData.status === 'fulfilled' && transcriptData.value) {
            fullText = transcriptData.value
                .map(item => item.text)
                .join(' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&nbsp;/g, ' ');
        }

        return NextResponse.json({
            success: true,
            data: {
                ...metadata,
                transcript: fullText,
                transcriptLanguage: 'ko' // 기본값
            }
        });

    } catch (error: any) {
        console.error('[YouTube Transcript API Error]:', error);
        return NextResponse.json({ 
            success: false, 
            error: '서버 오류가 발생했습니다.',
            details: error.message
        }, { status: 500 });
    }
}
