import { createClient } from '@/lib/supabase/server';
import { collectionRequest, youtubeComments, type CommentRow } from '@/lib/comment-collector';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: '허용되지 않은 요청입니다.' }, { status: 403 });
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  try {
    const { source, token, order } = collectionRequest(await request.text());
    if (source.platform === 'youtube') return Response.json(await youtubeComments(source, process.env.YOUTUBE_API_KEY || '', order, token));
    if (process.env.VERCEL) return Response.json({ error: '인스타그램 수집은 이 PC에서 실행 중인 올인원으로 접속하세요. 연결된 크롬을 사용합니다.' }, { status: 503 });
    const response = await fetch('http://127.0.0.1:8791/api/standalone-comments', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shorts-Client': 'local-ui' }, body: JSON.stringify({ url: source.url }), signal: AbortSignal.timeout(115000) });
    if (response.status === 404) throw Error('인스타그램 연결 기능을 반영하려면 로컬 제작실을 다시 시작하세요.');
    const data = await response.json(); if (!response.ok) throw Error(data.error || '인스타그램 댓글을 읽지 못했습니다.');
    return Response.json({ platform: 'instagram', sourceUrl: source.url, collectedAt: new Date().toISOString(), comments: (data.comments || []).map((c: CommentRow) => ({ ...c, publishedAt: c.publishedAt || '' })), partial: true, order, note: data.scope + (data.reason ? ' · ' + data.reason : '') });
  } catch (e) {
    const error = e instanceof Error && !['TypeError', 'TimeoutError', 'AbortError', 'SyntaxError'].includes(e.name) ? e.message : '수집 서버에 연결하지 못했습니다. 기존 결과는 유지됩니다. 잠시 후 다시 시도하세요.';
    return Response.json({ error }, { status: 400 });
  }
}
