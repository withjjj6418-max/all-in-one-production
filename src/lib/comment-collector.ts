export type CommentRow = { id: string; author: string; text: string; likes: number | null; publishedAt: string; url: string; translationKo?: string };
export type Collection = { platform: 'youtube' | 'instagram'; sourceUrl: string; collectedAt: string; comments: CommentRow[]; partial: boolean; nextPageToken?: string; order: 'relevance' | 'time'; note: string };
export function commentSource(raw: string) {
  let u: URL; try { u = new URL(raw.trim()); } catch { throw Error('영상 주소를 입력하세요.'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) throw Error('https 영상 주소를 입력하세요.');
  const host = u.hostname.toLowerCase();
  if (['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) {
    const id = host === 'youtu.be' ? u.pathname.slice(1) : u.pathname === '/watch' ? u.searchParams.get('v') : u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)\/?$/)?.[1];
    if (!id || !/^[\w-]{11}$/.test(id)) throw Error('유튜브 영상 또는 Shorts 주소를 입력하세요.');
    return { platform: 'youtube' as const, id, url: `https://www.youtube.com/watch?v=${id}` };
  }
  const match = u.pathname.match(/^\/(?:p|reel|reels|tv)\/([\w-]+)\/?$/);
  if (['instagram.com', 'www.instagram.com'].includes(host) && match) return { platform: 'instagram' as const, id: match[1], url: `https://www.instagram.com/p/${match[1]}/` };
  throw Error('유튜브 영상 또는 인스타그램 게시물·릴스 주소를 입력하세요. 계정 홈은 사용할 수 없습니다.');
}
export function mergeComments(old: CommentRow[], incoming: CommentRow[]) {
  const rows = new Map(old.map(c => [c.id || `${c.author}\n${c.text}`, c]));
  incoming.forEach(c => rows.set(c.id || `${c.author}\n${c.text}`, c));
  return [...rows.entries()].map(([id,c])=>({...c,id}));
}
export function collectionRequest(raw: string) {
  if (raw.length > 32768) throw Error('입력 내용이 너무 큽니다.');
  const body = JSON.parse(raw), source = commentSource(String(body?.url || ''));
  const token = String(body?.pageToken || '');
  if (token.length > 16384) throw Error('다음 수집 정보가 올바르지 않습니다.');
  return { source, token, order: body?.order === 'time' ? 'time' as const : 'relevance' as const };
}
export function commentsCsv(rows: CommentRow[]) {
  const cell = (value: unknown) => { let s = String(value ?? ''); if (/^[\s]*[=+@-]/.test(s)) s = "'" + s; return `"${s.replaceAll('"', '""')}"`; };
  return '\ufeff' + [['작성자', '댓글 원문', '좋아요', '작성 시각', '출처'], ...rows.map(c => [c.author, c.text, c.likes, c.publishedAt, c.url])].map(row => row.map(cell).join(',')).join('\r\n');
}
type YouTubeComment = { snippet?: { topLevelComment?: { id?: string; snippet?: { authorDisplayName?: string; textOriginal?: string; textDisplay?: string; likeCount?: number; publishedAt?: string } } } };
export async function youtubeComments(source: ReturnType<typeof commentSource>, key: string, order: 'relevance' | 'time', token: string, fetcher: typeof fetch = fetch): Promise<Collection> {
  if (!key) throw Error('유튜브 API 설정이 없습니다. 서버 설정을 확인하세요.');
  const q = new URLSearchParams({ part: 'snippet', videoId: source.id, order, textFormat: 'plainText', maxResults: '100', key });
  if (token) q.set('pageToken', token);
  const response = await fetcher('https://www.googleapis.com/youtube/v3/commentThreads?' + q, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok) { const reason = data.error?.errors?.[0]?.reason; throw Error(reason === 'commentsDisabled' ? '이 영상은 댓글이 비활성화되어 있습니다.' : reason === 'videoNotFound' ? '영상을 찾을 수 없습니다.' : ['quotaExceeded', 'dailyLimitExceeded'].includes(reason) ? '유튜브 수집 한도에 도달했습니다. 나중에 다시 시도하세요.' : '유튜브 댓글에 접근하지 못했습니다. 영상 공개 상태와 API 설정을 확인하세요.'); }
  const comments = (data.items || []).flatMap((item: YouTubeComment): CommentRow[] => {
    const c = item.snippet?.topLevelComment, s = c?.snippet;
    if (!c?.id || !s) return [];
    return [{ id: c.id, author: s.authorDisplayName || '', text: s.textOriginal ?? s.textDisplay ?? '', likes: s.likeCount ?? 0, publishedAt: s.publishedAt || '', url: `${source.url}&lc=${encodeURIComponent(c.id)}` }];
  });
  return { platform: 'youtube', sourceUrl: source.url, collectedAt: new Date().toISOString(), comments, partial: Boolean(data.nextPageToken), nextPageToken: data.nextPageToken || '', order, note: '최상위 댓글을 수집합니다. 답글은 포함하지 않습니다. 좋아요순은 현재 수집한 범위의 순위입니다.' };
}
