"use client";

import { usePathname } from "next/navigation";

const pageTitles: Record<string, string> = {
  "/": "대시보드",
  "/ideas": "아이디어 노트",
  "/scripts": "스크립트",
  "/checklist": "촬영 체크리스트",
  "/edit-notes": "편집 메모",
  "/upload-tracker": "업로드 트래커",
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
