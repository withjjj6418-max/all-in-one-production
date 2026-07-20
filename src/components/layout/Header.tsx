"use client";

import { usePathname } from "next/navigation";

const pageTitles: Record<string, string> = {
  "/": "대시보드",
  "/research": "영상소스모음",
  "/projects": "프로젝트",
  "/analytics": "영상 분석",
  "/scripts": "대본작성",
  "/post/sound": "사운드 스튜디오",
  "/post/image": "이미지/영상",
  "/post/edit": "편집실",
  "/channels": "채널 관리",
};

export function Header() {
  const pathname = usePathname();
  const title = pathname === "/studio/shorts-story/uploads"
    ? "사연 업로드 목록"
    : pathname.endsWith("/publish")
    ? "검수 · 업로드 완료"
    : pathname.endsWith("/voice/cast")
    ? "캐릭터별 목소리"
    : pathname.endsWith("/editing")
    ? "Premiere 편집 패키지"
    : pathname.endsWith("/characters")
    ? "캐릭터 작업 목록"
    : pathname.endsWith("/voice")
    ? "TTS · 자동 자막"
    : pathname.endsWith("/story")
    ? "원문 수집 · AI 각색"
    : pathname.startsWith("/studio/shorts-story/projects/")
    ? "사연 제작 워크벤치"
    : pathname.startsWith("/studio/shorts-story")
      ? "숏폼(사연)"
      : pathname === "/studio"
        ? "제작 스튜디오"
        : pageTitles[pathname] ?? "대시보드";

  return (
    <header className="hidden lg:flex sticky top-0 z-20 h-[60px] items-center border-b border-border bg-white/80 px-8 backdrop-blur-sm">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">
        {title}
      </h1>
    </header>
  );
}
