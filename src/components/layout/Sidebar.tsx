"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
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
  Languages,
  ScanText,
  Video,
  Film,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// 클라이언트 싱글톤 인스턴스 생성
const supabase = createClient();

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [currentQuery, setCurrentQuery] = useState("");
  const [isStoryStudioOpen, setIsStoryStudioOpen] = useState(false);
  const [isJapanStudioOpen, setIsJapanStudioOpen] = useState(false);

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
  const pathJapanProjectId = pathname.match(/^\/studio\/longform-japan\/projects\/(\d+)/)?.[1] ?? null;
  const rememberedJapanProjectId = mounted && typeof window !== "undefined" ? window.localStorage.getItem("last-longform-japan-project-id") : null;
  const japanProjectId = pathJapanProjectId || rememberedJapanProjectId;

  useEffect(() => {
    if (pathStoryProjectId && typeof window !== "undefined") window.localStorage.setItem("last-shorts-story-project-id", pathStoryProjectId);
  }, [pathStoryProjectId]);

  useEffect(() => {
    if (pathJapanProjectId && typeof window !== "undefined") window.localStorage.setItem("last-longform-japan-project-id", pathJapanProjectId);
  }, [pathJapanProjectId]);
  
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
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 scrollbar-hide">
        <Link
          href="/research"
          onClick={() => setIsMobileOpen(false)}
          className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${pathname === "/research"
              ? "bg-brand-pink/20 text-brand-olive-dark"
              : "text-muted-foreground hover:bg-brand-cream hover:text-foreground"
            }`}
        >
          <Search size={18} className={pathname === "/research" ? "text-brand-olive" : "text-muted-foreground group-hover:text-brand-olive-light"} />
          <span>영상소스모음</span>
          {pathname === "/research" && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-pink" />}
        </Link>

        <div className="space-y-1">
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

          <div className={`flex items-center rounded-lg transition-all duration-200 ${pathname.startsWith("/studio/shorts-story") || (pathname === "/scripts" && Boolean(storyProjectId)) ? "bg-rose-50 text-rose-700" : "text-muted-foreground hover:bg-brand-cream hover:text-foreground"}`}>
            <Link href="/studio/shorts-story" onClick={() => setIsMobileOpen(false)} className="group flex min-w-0 flex-1 items-center gap-3 rounded-l-lg px-3 py-2.5 text-sm font-medium">
              <BookOpenText size={18} className="shrink-0 text-rose-600" />
              <span>숏폼(사연)</span>
            </Link>
            <button type="button" onClick={() => setIsStoryStudioOpen((current) => !current)} aria-label={isStoryStudioOpen ? "숏폼(사연) 메뉴 접기" : "숏폼(사연) 메뉴 펼치기"} aria-expanded={isStoryStudioOpen} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-r-lg hover:bg-rose-100/70">
              <ChevronDown size={16} className={`transition-transform ${isStoryStudioOpen ? "rotate-180" : ""}`} />
            </button>
          </div>

          <div className={`overflow-hidden transition-all duration-200 ${isStoryStudioOpen ? "max-h-80 opacity-100" : "max-h-0 opacity-0"}`}>
            <div className="ml-4 space-y-0.5 border-l border-sidebar-border py-1 pl-3">
              {[
                { key: "story", label: "원문각색", href: storyProjectId ? `/studio/shorts-story/projects/${storyProjectId}/story` : "/studio/shorts-story", icon: WandSparkles, needsProject: true },
                { key: "script", label: "대본수정", href: storyProjectId ? `/scripts?project_id=${storyProjectId}&tab=write` : "/studio/shorts-story", icon: PenLine, needsProject: true },
                { key: "voice", label: "TTS", href: storyProjectId ? `/studio/shorts-story/projects/${storyProjectId}/voice/cast` : "/studio/shorts-story", icon: FileAudio, needsProject: true },
                { key: "characters", label: "캐릭터", href: storyProjectId ? `/studio/shorts-story/projects/${storyProjectId}/characters` : "/studio/shorts-story", icon: Image, needsProject: true },
                { key: "editing", label: "프리미어", href: storyProjectId ? `/studio/shorts-story/projects/${storyProjectId}/editing` : "/studio/shorts-story", icon: Film, needsProject: true },
                { key: "uploads", label: "업로드목록", href: "/studio/shorts-story/uploads", icon: Upload, needsProject: false },
              ].map((item) => {
                const isActive = item.key === "uploads" ? pathname === "/studio/shorts-story/uploads"
                  : item.key === "story" ? pathname.endsWith("/story")
                  : item.key === "script" ? pathname === "/scripts" && currentQuery.includes(`project_id=${storyProjectId}`)
                  : item.key === "voice" ? pathname.endsWith("/voice/cast") || pathname.endsWith("/voice")
                  : item.key === "editing" ? pathname.endsWith("/editing")
                  : pathname.endsWith("/characters");
                const Icon = item.icon;
                const waitingForProject = item.needsProject && !storyProjectId;
                return <Link key={item.key} href={item.href} title={waitingForProject ? "사연 프로젝트를 먼저 선택해주세요" : undefined} onClick={() => setIsMobileOpen(false)} className={`group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition ${isActive ? "bg-brand-pink/15 text-brand-olive-dark" : waitingForProject ? "text-muted-foreground/50" : "text-muted-foreground hover:bg-brand-cream hover:text-foreground"}`}><Icon size={15} className={isActive ? "text-brand-olive" : "text-muted-foreground"} /><span>{item.label}</span>{isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-pink" />}</Link>;
              })}
            </div>
          </div>

          <div className={`flex items-center rounded-lg transition-all duration-200 ${pathname.startsWith("/studio/longform-japan") ? "bg-sky-50 text-sky-700" : "text-muted-foreground hover:bg-brand-cream hover:text-foreground"}`}>
            <Link href="/studio/longform-japan" onClick={() => setIsMobileOpen(false)} className="group flex min-w-0 flex-1 items-center gap-3 rounded-l-lg px-3 py-2.5 text-sm font-medium">
              <Languages size={18} className="shrink-0 text-sky-700" />
              <span>롱폼(일본)</span>
            </Link>
            <button type="button" onClick={() => setIsJapanStudioOpen((current) => !current)} aria-label={isJapanStudioOpen ? "롱폼(일본) 메뉴 접기" : "롱폼(일본) 메뉴 펼치기"} aria-expanded={isJapanStudioOpen} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-r-lg hover:bg-sky-100/70">
              <ChevronDown size={16} className={`transition-transform ${isJapanStudioOpen ? "rotate-180" : ""}`} />
            </button>
          </div>

          <div className={`overflow-hidden transition-all duration-200 ${isJapanStudioOpen ? "max-h-[32rem] opacity-100" : "max-h-0 opacity-0"}`}>
            <div className="ml-4 space-y-0.5 border-l border-sidebar-border py-1 pl-3">
              {[
                { key: "source", label: "원문수집", icon: ScanText, href: japanProjectId ? `/studio/longform-japan/projects/${japanProjectId}/source` : "/studio/longform-japan", needsProject: true },
                { key: "adapt", label: "각색", icon: WandSparkles, href: japanProjectId ? `/studio/longform-japan/projects/${japanProjectId}/adapt` : "/studio/longform-japan", needsProject: true },
                { key: "script", label: "대본수정", icon: PenLine, href: japanProjectId ? `/studio/longform-japan/projects/${japanProjectId}/script` : "/studio/longform-japan", needsProject: true },
                { key: "translate", label: "대본번역", icon: Languages, href: japanProjectId ? `/studio/longform-japan/projects/${japanProjectId}/translate` : "/studio/longform-japan", needsProject: true },
                { key: "voice", label: "TTS · SRT", icon: FileAudio, href: japanProjectId ? `/studio/longform-japan/projects/${japanProjectId}/voice` : "/studio/longform-japan", needsProject: true },
                { key: "image", label: "이미지", icon: Image, href: japanProjectId ? `/studio/longform-japan/projects/${japanProjectId}/image` : "/studio/longform-japan", needsProject: true },
                { key: "motion", label: "루프영상", icon: Video, href: japanProjectId ? `/studio/longform-japan/projects/${japanProjectId}/motion` : "/studio/longform-japan", needsProject: true },
                { key: "premiere", label: "프리미어", icon: Film, href: japanProjectId ? `/studio/longform-japan/projects/${japanProjectId}/premiere` : "/studio/longform-japan", needsProject: true },
                { key: "uploads", label: "업로드목록", icon: Upload, href: "/studio/longform-japan/uploads", needsProject: false },
              ].map((item) => {
                const isActive = item.key === "uploads" ? pathname === "/studio/longform-japan/uploads" : pathname.endsWith(`/${item.key}`);
                const waitingForProject = item.needsProject && !japanProjectId;
                const Icon = item.icon;
                return <Link key={item.key} href={item.href} title={waitingForProject ? "일본 롱폼 프로젝트를 먼저 선택해주세요" : undefined} onClick={() => setIsMobileOpen(false)} className={`group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition ${isActive ? "bg-sky-50 text-sky-700" : waitingForProject ? "text-muted-foreground/50" : "text-muted-foreground hover:bg-brand-cream hover:text-foreground"}`}><Icon size={15} /><span>{item.label}</span>{isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sky-600" />}</Link>;
              })}
            </div>
          </div>

          <Link
            href="/completed"
            onClick={() => setIsMobileOpen(false)}
            className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${pathname === "/completed" ? "bg-brand-pink/20 text-brand-olive-dark" : "text-muted-foreground hover:bg-brand-cream hover:text-foreground"}`}
          >
            <CheckCircle size={18} className={pathname === "/completed" ? "text-brand-olive" : "text-muted-foreground group-hover:text-brand-olive-light"} />
            <span>완료</span>
            {pathname === "/completed" && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-pink" />}
          </Link>
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
