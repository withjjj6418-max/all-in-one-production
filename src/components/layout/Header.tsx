"use client";

import { usePathname } from "next/navigation";

const pageTitles: Record<string, string> = {
  "/": "대시보드",
  "/research": "리서치",
  "/projects": "프로젝트",
  "/analytics": "채널/영상 분석",
  "/scripts": "대본작성",
  "/post/sound": "사운드 스튜디오",
  "/post/image": "이미지/영상",
  "/post/edit": "편집실",
  "/post/upload": "업로드",
  "/channels": "채널 관리",
};

export function Header() {
  const pathname = usePathname();
  const title = pageTitles[pathname] ?? "대시보드";

  return (
    <header className="sticky top-0 z-20 flex h-[60px] items-center border-b border-border bg-white/80 px-8 backdrop-blur-sm">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">
        {title}
      </h1>
    </header>
  );
}
