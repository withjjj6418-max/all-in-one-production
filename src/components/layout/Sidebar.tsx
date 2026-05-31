"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Plus,
  FolderKanban,
  BarChart3,
  Sparkles,
  PenLine,
  Clapperboard,
  ChevronDown,
  Music,
  Image,
  Film,
  Search,
  Settings,
  LogOut,
  User,
  Menu,
  FileText,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const mainMenuItems = [
  { label: "프로젝트", href: "/projects", icon: FolderKanban },
  { label: "소스리서치", href: "/research", icon: Search },
  { label: "영상 분석", href: "/analytics", icon: BarChart3 },
];

const postProductionItems = [
  { label: "사운드", href: "/post/sound", icon: Music },
  { label: "이미지/영상", href: "/post/image", icon: Image },
  { label: "편집", href: "/post/edit", icon: Film },
];

// 클라이언트 싱글톤 인스턴스 생성
const supabase = createClient();

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [currentQuery, setCurrentQuery] = useState("");

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      setCurrentQuery(window.location.search);
    }
  }, [pathname]);
  
  const isPostProductionActive = pathname.startsWith("/post");
  const [isPostOpen, setIsPostOpen] = useState(isPostProductionActive);

  const isScriptsActive = pathname.startsWith("/scripts") || pathname === "/create";
  const [isScriptsOpen, setIsScriptsOpen] = useState(isScriptsActive);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      console.log('Sidebar: 1. fetchUser started');
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        console.log('Sidebar: 2. getUser result:', { user, error });
        
        if (error) {
          console.error('Sidebar: Error fetching user:', error);
          setUserEmail('로그인 필요');
          return;
        }

        if (user) {
          console.log('Sidebar: 3. User found:', user.email);
          setUserEmail(user.email ?? '이메일 없음');
        } else {
          console.log('Sidebar: 3. No user found');
          setUserEmail('미인증 사용자');
          // 필요한 경우 여기서 로그아웃 처리를 하거나 로그인 페이지로 보낼 수 있음
        }
      } catch (err) {
        console.error('Sidebar: Unexpected error:', err);
        setUserEmail('오류 발생');
      }
    };
    fetchUser();
  }, [supabase.auth]);

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
    <>
      {/* 🍔 모바일 햄버거 버튼 */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="fixed left-4 top-3.5 z-40 flex h-9 w-9 items-center justify-center rounded-lg border border-sidebar-border bg-sidebar text-muted-foreground shadow-sm hover:text-foreground lg:hidden"
        aria-label="메뉴 열기"
      >
        <Menu size={20} />
      </button>

      {/* 🖤 모바일 오버레이 배경 */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* 🎬 사이드바 */}
      <aside className={`fixed left-0 top-0 z-30 flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-300 -translate-x-full lg:translate-x-0 ${
        isMobileOpen ? "translate-x-0" : ""
      }`}>
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



      {/* Navigation */}
      <nav className="flex-1 space-y-5 px-3 py-4 overflow-y-auto scrollbar-hide">
        {/* 🎬 쇼츠 그룹 */}
        <div className="space-y-1">
          <h3 className="px-3 mb-2 text-[11px] font-bold tracking-wider text-muted-foreground/70">🎬 쇼츠</h3>
          
          {mainMenuItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileOpen(false)}
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

          {/* 대본작성 Toggle */}
          <button
            onClick={() => setIsScriptsOpen((prev) => !prev)}
            className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${isScriptsActive
                ? "bg-brand-pink/20 text-brand-olive-dark"
                : "text-muted-foreground hover:bg-brand-cream hover:text-foreground"
              }`}
          >
            <PenLine
              size={18}
              className={`transition-colors duration-200 ${isScriptsActive
                  ? "text-brand-olive"
                  : "text-muted-foreground group-hover:text-brand-olive-light"
                }`}
            />
            <span>대본작성</span>
            <ChevronDown
              size={16}
              className={`ml-auto transition-transform duration-200 ${isScriptsOpen ? "rotate-180" : ""
                } ${isScriptsActive
                  ? "text-brand-olive"
                  : "text-muted-foreground"
                }`}
            />
          </button>

          {/* Sub-menu (대본작성 하위 항목) */}
          <div
            className={`overflow-hidden transition-all duration-200 ${isScriptsOpen ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
              }`}
          >
            <div className="ml-4 space-y-0.5 border-l border-sidebar-border pl-3 py-1">
              {[
                { label: "창작", href: "/create", icon: Sparkles },
                { label: "수정", href: "/scripts?tab=write", icon: PenLine },
                { label: "목록", href: "/scripts?tab=list", icon: FileText },
              ].map((item) => {
                const isItemActive = item.href.includes("?") 
                  ? (pathname === item.href.split("?")[0] && currentQuery.includes(item.href.split("?")[1]))
                  : (pathname === item.href);

                const showActiveDot = mounted && isItemActive;
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileOpen(false)}
                    className={`group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-all duration-200 ${showActiveDot
                        ? "bg-brand-pink/15 text-brand-olive-dark"
                        : "text-muted-foreground hover:bg-brand-cream hover:text-foreground"
                      }`}
                  >
                    <Icon
                      size={15}
                      className={`transition-colors duration-200 ${showActiveDot
                          ? "text-brand-olive"
                          : "text-muted-foreground group-hover:text-brand-olive-light"
                        }`}
                    />
                    <span>{item.label}</span>
                    {showActiveDot && (
                      <div className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-pink" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

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
                    onClick={() => setIsMobileOpen(false)}
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
            onClick={() => setIsMobileOpen(false)}
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
        </div>

        {/* 구분선 */}
        <div className="mx-2 border-t border-sidebar-border" />

        {/* 🎥 롱폼 그룹 */}
        <div className="space-y-1 opacity-40 grayscale-[50%]">
          <h3 className="px-3 mb-2 text-[11px] font-bold tracking-wider text-muted-foreground/70">🎥 롱폼</h3>
          
          {mainMenuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={`longform-${item.href}`}
                onClick={() => alert("🚧 롱폼 기능은 추후 제작 예정입니다.")}
                className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-brand-cream"
              >
                <Icon size={18} className="text-muted-foreground" />
                <span>{item.label}</span>
              </button>
            );
          })}

          <button
            onClick={() => alert("🚧 롱폼 기능은 추후 제작 예정입니다.")}
            className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-brand-cream"
          >
            <Clapperboard size={18} className="text-muted-foreground" />
            <span>후반작업</span>
            <ChevronDown size={16} className="ml-auto text-muted-foreground opacity-50" />
          </button>

          <button
            onClick={() => alert("🚧 롱폼 기능은 추후 제작 예정입니다.")}
            className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-brand-cream"
          >
            <Settings size={18} className="text-muted-foreground" />
            <span>채널 관리</span>
          </button>
        </div>
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
    </>
  );
}
