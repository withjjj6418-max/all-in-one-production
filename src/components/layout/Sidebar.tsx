"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  FolderKanban,
  BarChart3,
  PenLine,
  ChevronDown,
  Image,
  Search,
  LogOut,
  User,
  Menu,
  CheckCircle,
  Layers3,
  BookOpenText,
  WandSparkles,
  FileAudio,
  Upload,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const mainMenuItems = [
  { label: "영상소스모음", href: "/research", icon: Search },
  { label: "영상 분석", href: "/analytics", icon: BarChart3 },
];

const shortsMenuItems = [
  { label: "완료", href: "/completed", icon: CheckCircle },
  { label: "영상소스모음", href: "/research", icon: Search },
  { label: "영상 분석", href: "/analytics", icon: BarChart3 },
];

// 클라이언트 싱글톤 인스턴스 생성
const supabase = createClient();

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [currentQuery, setCurrentQuery] = useState("");
  const [isStoryStudioOpen, setIsStoryStudioOpen] = useState(true);

  useEffect(() => {
    // 클라이언트에서만 현재 쿼리와 마지막 프로젝트를 읽어 SSR 결과와 맞춘다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    if (typeof window !== "undefined") {
      setCurrentQuery(window.location.search);
    }
  }, [pathname]);

  const pathStoryProjectId = pathname.match(/^\/studio\/shorts-story\/projects\/(\d+)/)?.[1] ?? null;
  const queryStoryProjectId = mounted ? new URLSearchParams(currentQuery).get("project_id") : null;
  const rememberedStoryProjectId = mounted && typeof window !== "undefined" ? window.localStorage.getItem("last-shorts-story-project-id") : null;
  const storyProjectId = pathStoryProjectId || queryStoryProjectId || rememberedStoryProjectId;

  useEffect(() => {
    if (pathStoryProjectId && typeof window !== "undefined") window.localStorage.setItem("last-shorts-story-project-id", pathStoryProjectId);
  }, [pathStoryProjectId]);
  
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
        <div className="space-y-1">
          <h3 className="px-3 mb-2 text-[11px] font-bold tracking-wider text-muted-foreground/70">제작 공간</h3>
          <Link
            href="/studio"
            onClick={() => setIsMobileOpen(false)}
            className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${pathname === "/studio"
                ? "bg-brand-olive text-white shadow-sm"
                : "bg-brand-cream text-brand-olive-dark hover:bg-brand-pink/20"
              }`}
          >
            <Layers3 size={18} />
            <span>제작 스튜디오</span>
            <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-bold ${pathname === "/studio" ? "bg-white/20 text-white" : "bg-white text-brand-olive"}`}>NEW</span>
          </Link>

          <button
            type="button"
            onClick={() => setIsStoryStudioOpen((current) => !current)}
            className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${pathname.startsWith("/studio/shorts-story") || (pathname === "/scripts" && Boolean(storyProjectId)) ? "bg-rose-50 text-rose-700" : "text-muted-foreground hover:bg-brand-cream hover:text-foreground"}`}
          >
            <BookOpenText size={18} className="text-rose-600" />
            <span>숏폼(사연)</span>
            <ChevronDown size={16} className={`ml-auto transition-transform ${isStoryStudioOpen ? "rotate-180" : ""}`} />
          </button>

          <div className={`overflow-hidden transition-all duration-200 ${isStoryStudioOpen ? "max-h-80 opacity-100" : "max-h-0 opacity-0"}`}>
            <div className="ml-4 space-y-0.5 border-l border-sidebar-border py-1 pl-3">
              {[
                { key: "projects", label: "프로젝트", href: "/studio/shorts-story", icon: FolderKanban, needsProject: false },
                { key: "story", label: "원문각색", href: storyProjectId ? `/studio/shorts-story/projects/${storyProjectId}/story` : "/studio/shorts-story", icon: WandSparkles, needsProject: true },
                { key: "script", label: "대본수정", href: storyProjectId ? `/scripts?project_id=${storyProjectId}&tab=write` : "/studio/shorts-story", icon: PenLine, needsProject: true },
                { key: "voice", label: "TTS", href: storyProjectId ? `/studio/shorts-story/projects/${storyProjectId}/voice/cast` : "/studio/shorts-story", icon: FileAudio, needsProject: true },
                { key: "characters", label: "캐릭터", href: storyProjectId ? `/studio/shorts-story/projects/${storyProjectId}/characters` : "/studio/shorts-story", icon: Image, needsProject: true },
                { key: "uploads", label: "업로드목록", href: "/studio/shorts-story/uploads", icon: Upload, needsProject: false },
              ].map((item) => {
                const isActive = item.key === "projects" ? pathname === "/studio/shorts-story"
                  : item.key === "uploads" ? pathname === "/studio/shorts-story/uploads"
                  : item.key === "story" ? pathname.endsWith("/story")
                  : item.key === "script" ? pathname === "/scripts" && currentQuery.includes(`project_id=${storyProjectId}`)
                  : item.key === "voice" ? pathname.endsWith("/voice/cast") || pathname.endsWith("/voice")
                  : pathname.endsWith("/characters");
                const Icon = item.icon;
                const waitingForProject = item.needsProject && !storyProjectId;
                return <Link key={item.key} href={item.href} title={waitingForProject ? "사연 프로젝트를 먼저 선택해주세요" : undefined} onClick={() => setIsMobileOpen(false)} className={`group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition ${isActive ? "bg-brand-pink/15 text-brand-olive-dark" : waitingForProject ? "text-muted-foreground/50" : "text-muted-foreground hover:bg-brand-cream hover:text-foreground"}`}><Icon size={15} className={isActive ? "text-brand-olive" : "text-muted-foreground"} /><span>{item.label}</span>{isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-pink" />}</Link>;
              })}
            </div>
          </div>
        </div>

        {/* 🎬 쇼츠 그룹 */}
        <div className="space-y-1">
          <h3 className="px-3 mb-2 text-[11px] font-bold tracking-wider text-muted-foreground/70">🎬 쇼츠</h3>
          
          {shortsMenuItems.map((item) => {
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
