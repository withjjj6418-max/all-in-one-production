"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Lightbulb,
  FileText,
  CheckSquare,
  StickyNote,
  Upload,
} from "lucide-react";

const menuItems = [
  { label: "대시보드", href: "/", icon: LayoutDashboard },
  { label: "아이디어 노트", href: "/ideas", icon: Lightbulb },
  { label: "스크립트", href: "/scripts", icon: FileText },
  { label: "촬영 체크리스트", href: "/checklist", icon: CheckSquare },
  { label: "편집 메모", href: "/edit-notes", icon: StickyNote },
  { label: "업로드 트래커", href: "/upload-tracker", icon: Upload },
];

export function Sidebar() {
  const pathname = usePathname();

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

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {menuItems.map((item) => {
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
