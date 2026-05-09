"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Plus,
  FolderKanban,
  BarChart3,
  PenLine,
  Clapperboard,
  ChevronDown,
  Music,
  Image,
  Film,
  Upload,
} from "lucide-react";

const mainMenuItems = [
  { label: "프로젝트", href: "/projects", icon: FolderKanban },
  { label: "채널/영상 분석", href: "/analytics", icon: BarChart3 },
  { label: "대본작성", href: "/scripts", icon: PenLine },
];

const postProductionItems = [
  { label: "사운드", href: "/post/sound", icon: Music },
  { label: "이미지/영상", href: "/post/media", icon: Image },
  { label: "편집", href: "/post/editing", icon: Film },
  { label: "업로드", href: "/post/upload", icon: Upload },
];

export function Sidebar() {
  const pathname = usePathname();
  const isPostProductionActive = pathname.startsWith("/post");
  const [isPostOpen, setIsPostOpen] = useState(isPostProductionActive);

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar">
      {/* App Title */}
      <div className="flex h-[60px] items-center gap-2.5 border-b border-sidebar-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-olive">
          <span className="text-sm font-bold text-white">A</span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-tight text-foreground">
            All In One
          </span>
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground">
            PRODUCTION
          </span>
        </div>
      </div>

      {/* New Project Button */}
      <div className="px-3 pt-4 pb-2">
        <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-pink py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-pink-dark">
          <Plus size={16} strokeWidth={2.5} />
          <span>새 프로젝트</span>
        </button>
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-sidebar-border" />

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-3">
        {mainMenuItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-brand-pink/20 text-brand-olive-dark"
                  : "text-muted-foreground hover:bg-brand-cream hover:text-foreground"
              }`}
            >
              <Icon
                size={18}
                className={`transition-colors duration-200 ${
                  isActive
                    ? "text-brand-olive"
                    : "text-muted-foreground group-hover:text-brand-olive-light"
                }`}
              />
              <span>{item.label}</span>
              {isActive && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-pink" />
              )}
            </Link>
          );
        })}

        {/* Post-Production Toggle */}
        <button
          onClick={() => setIsPostOpen((prev) => !prev)}
          className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
            isPostProductionActive
              ? "bg-brand-pink/20 text-brand-olive-dark"
              : "text-muted-foreground hover:bg-brand-cream hover:text-foreground"
          }`}
        >
          <Clapperboard
            size={18}
            className={`transition-colors duration-200 ${
              isPostProductionActive
                ? "text-brand-olive"
                : "text-muted-foreground group-hover:text-brand-olive-light"
            }`}
          />
          <span>후반작업</span>
          <ChevronDown
            size={16}
            className={`ml-auto transition-transform duration-200 ${
              isPostOpen ? "rotate-180" : ""
            } ${
              isPostProductionActive
                ? "text-brand-olive"
                : "text-muted-foreground"
            }`}
          />
        </button>

        {/* Sub-menu */}
        <div
          className={`overflow-hidden transition-all duration-200 ${
            isPostOpen ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="ml-4 space-y-0.5 border-l border-sidebar-border pl-3 py-1">
            {postProductionItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-brand-pink/15 text-brand-olive-dark"
                      : "text-muted-foreground hover:bg-brand-cream hover:text-foreground"
                  }`}
                >
                  <Icon
                    size={15}
                    className={`transition-colors duration-200 ${
                      isActive
                        ? "text-brand-olive"
                        : "text-muted-foreground group-hover:text-brand-olive-light"
                    }`}
                  />
                  <span>{item.label}</span>
                  {isActive && (
                    <div className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-pink" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Bottom area */}
      <div className="border-t border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-pink/30">
            <span className="text-xs font-semibold text-brand-olive-dark">U</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-foreground">User</span>
            <span className="text-[11px] text-muted-foreground">Free Plan</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
