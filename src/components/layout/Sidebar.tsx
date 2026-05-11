"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  Search,
  Settings,
  LogOut,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const mainMenuItems = [
  { label: "리서치", href: "/research", icon: Search },
  { label: "프로젝트", href: "/projects", icon: FolderKanban },
  { label: "채널/영상 분석", href: "/analytics", icon: BarChart3 },
  { label: "대본작성", href: "/scripts", icon: PenLine },
];

const postProductionItems = [
  { label: "사운드", href: "/post/sound", icon: Music },
  { label: "이미지/영상", href: "/post/image", icon: Image },
  { label: "편집", href: "/post/edit", icon: Film },
  { label: "업로드", href: "/post/upload", icon: Upload },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  
  const isPostProductionActive = pathname.startsWith("/post");
  const [isPostOpen, setIsPostOpen] = useState(isPostProductionActive);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email ?? null);
      }
    };
    fetchUser();
  }, []);

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      router.replace('/login');
      router.refresh();
    } catch (error) {
      console.error("Logout failed:", error);
      alert("로그아웃에 실패했습니다.");
    }
  };

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
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${isActive
                  ? "bg-brand-pink/20 text-brand-olive-dark"
                  : "text-muted-foreground hover:bg-brand-cream hover:text-foreground"
                }`}
            >
              <Icon
                size={18}
                className={`transition-colors duration-200 ${isActive
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
          className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${isPostProductionActive
              ? "bg-brand-pink/20 text-brand-olive-dark"
              : "text-muted-foreground hover:bg-brand-cream hover:text-foreground"
            }`}
        >
          <Clapperboard
            size={18}
            className={`transition-colors duration-200 ${isPostProductionActive
                ? "text-brand-olive"
                : "text-muted-foreground group-hover:text-brand-olive-light"
              }`}
          />
          <span>후반작업</span>
          <ChevronDown
            size={16}
            className={`ml-auto transition-transform duration-200 ${isPostOpen ? "rotate-180" : ""
              } ${isPostProductionActive
                ? "text-brand-olive"
                : "text-muted-foreground"
              }`}
          />
        </button>

        {/* Sub-menu */}
        <div
          className={`overflow-hidden transition-all duration-200 ${isPostOpen ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
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
                  className={`group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-all duration-200 ${isActive
                      ? "bg-brand-pink/15 text-brand-olive-dark"
                      : "text-muted-foreground hover:bg-brand-cream hover:text-foreground"
                    }`}
                >
                  <Icon
                    size={15}
                    className={`transition-colors duration-200 ${isActive
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

        {/* Channel Management */}
        <Link
          href="/channels"
          className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${pathname === "/channels"
              ? "bg-brand-pink/20 text-brand-olive-dark"
              : "text-muted-foreground hover:bg-brand-cream hover:text-foreground"
            }`}
        >
          <Settings
            size={18}
            className={`transition-colors duration-200 ${pathname === "/channels"
                ? "text-brand-olive"
                : "text-muted-foreground group-hover:text-brand-olive-light"
              }`}
          />
          <span>채널 관리</span>
          {pathname === "/channels" && (
            <div className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-pink" />
          )}
        </Link>
      </nav>

      {/* Bottom area */}
      <div className="border-t border-sidebar-border px-4 py-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-pink/30">
              <User size={16} className="text-brand-olive-dark" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="truncate text-[11px] font-medium text-foreground" title={userEmail || 'User'}>
                {userEmail || 'Loading...'}
              </span>
              <span className="text-[10px] text-muted-foreground">Free Plan</span>
            </div>
          </div>
          
          <button 
            onClick={handleSignOut}
            className="group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-brand-cream hover:text-foreground"
          >
            <LogOut size={14} className="text-muted-foreground group-hover:text-brand-pink" />
            <span>로그아웃</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
