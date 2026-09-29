export const sourceBoardImportKey = (id: string) => `shorts-studio:source-board:${id}`;

export type SourceBoardTransfer = {
  url: string;
  source_board: { id: string; title: string; category: string; memo: string };
  complete?: boolean;
};

export function queueSourceBoardImport(source: { id: number; url: string; title: string | null; category: string; memo: string | null }) {
  let url: URL;
  try { url = new URL(source.url.trim()); }
  catch { throw new Error("연결할 영상 주소를 확인해 주세요."); }
  const host = url.hostname.toLowerCase();
  const instagram = ["instagram.com", "www.instagram.com", "m.instagram.com"].includes(host)
    && /^\/(?:reel|reels|p|tv)\/[A-Za-z0-9_-]{1,100}\/?$/.test(url.pathname);
  const youtube = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"].includes(host)
    && (/^\/(?:shorts|embed|live)\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname)
      || (url.pathname === "/watch" && /^[A-Za-z0-9_-]{11}$/.test(url.searchParams.get("v") || ""))
      || (host.endsWith("youtu.be") && /^\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname)));
  if (url.protocol !== "https:" || url.username || url.password || url.port || (!instagram && !youtube)) {
    throw new Error("유튜브 영상 또는 인스타 릴스·영상 게시물 주소를 연결해 주세요. 계정 홈은 지원하지 않습니다.");
  }
  const id = crypto.randomUUID();
  const data: SourceBoardTransfer = {
    url: url.href,
    source_board: { id: String(source.id), title: (source.title || "").trim(), category: source.category, memo: source.memo || "" },
  };
  try { sessionStorage.setItem(sourceBoardImportKey(id), JSON.stringify(data)); }
  catch { throw new Error("브라우저에 소스를 임시 저장하지 못했습니다. 저장 공간 설정을 확인해 주세요."); }
  return `/studio/shorts-workshop/discover?sourceImport=${id}`;
}
