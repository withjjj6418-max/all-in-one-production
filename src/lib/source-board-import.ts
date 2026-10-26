export const sourceBoardImportKey = (id: string) => `shorts-studio:source-board:${id}`;

/** 소스 게시판 링크 종류. null = 미선택(연결할 때 용도를 물어봄) */
export type SourceRole = "original" | "reference" | null;

export const MAX_EXTRA_SOURCES = 19;
export const MAX_PLAN_DIRECTION = 10000;

/** 추가원본은 순서대로 추가원본1, 추가원본2 … 로 부른다. */
export const extraSourceLabel = (index: number) => `추가원본${index + 1}`;

export type BoardSource = {
  id: number;
  url: string;
  title: string | null;
  category: string;
  memo: string | null;
  source_role?: SourceRole;
  extra_sources?: string[] | null;
  plan_direction?: string | null;
};

export type SourceBoardTransfer = {
  url: string;
  /** 제작실 카드 종류: source(원본) / reference(레퍼런스). 없으면 제작실에서 선택 */
  input_role?: "source" | "reference";
  source_board: {
    id: string; title: string; category: string; memo: string;
    extra_sources: string[]; plan_direction: string;
  };
  complete?: boolean;
};

const VIDEO_HOSTS = ["youtube.com", "youtu.be", "instagram.com", "tiktok.com", "reddit.com", "redd.it", "threads.net", "threads.com", "facebook.com", "fb.watch", "fb.com"];

/** 추가원본 주소 검사: 제작실이 내려받을 수 있는 영상 사이트의 https 주소만 허용 */
export function extraSourceError(value: string): string | null {
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { return "영상 주소 형식이 아닙니다."; }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")
    || !VIDEO_HOSTS.some(domain => host === domain || host.endsWith(`.${domain}`))) {
    return "YouTube, Instagram, TikTok, Reddit, Threads, Facebook의 https 영상 주소를 넣어 주세요.";
  }
  return null;
}

export function cleanExtraSources(values: string[] | null | undefined): string[] {
  return (values || []).map(value => value.trim()).filter(Boolean).slice(0, MAX_EXTRA_SOURCES);
}

export function queueSourceBoardImport(source: BoardSource) {
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
  const extras = cleanExtraSources(source.extra_sources);
  extras.forEach((value, index) => {
    const error = extraSourceError(value);
    if (error) throw new Error(`${extraSourceLabel(index)}: ${error}`);
  });
  const id = crypto.randomUUID();
  const data: SourceBoardTransfer = {
    url: url.href,
    ...(source.source_role === "original" ? { input_role: "source" as const } : source.source_role === "reference" ? { input_role: "reference" as const } : {}),
    source_board: {
      id: String(source.id), title: (source.title || "").trim(), category: source.category, memo: source.memo || "",
      extra_sources: extras, plan_direction: (source.plan_direction || "").trim().slice(0, MAX_PLAN_DIRECTION),
    },
  };
  try { sessionStorage.setItem(sourceBoardImportKey(id), JSON.stringify(data)); }
  catch { throw new Error("브라우저에 소스를 임시 저장하지 못했습니다. 저장 공간 설정을 확인해 주세요."); }
  return `/studio/shorts-workshop/discover?sourceImport=${id}`;
}
