"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Clock,
  Database,
  MoreHorizontal,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Scale,
  Search,
  User,
  X,
  Zap,
} from "lucide-react";
import { cn } from "./ui";

export type SidebarActiveItem = "research" | "quick" | "compare" | "corpus" | "admin";

export interface RecentSearchItem {
  text: string;
  time?: string;
}

interface SidebarProps {
  activeItem: SidebarActiveItem;
  onSelectMode?: (mode: "research" | "quick" | "compare") => void;
  recentSearches?: RecentSearchItem[];
  onSelectRecent?: (query: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({
  activeItem,
  onSelectMode,
  recentSearches: propRecents,
  onSelectRecent,
  isCollapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const [localRecents, setLocalRecents] = useState<RecentSearchItem[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);

  // Synchronize recent searches from props or localStorage
  useEffect(() => {
    if (propRecents && propRecents.length > 0) {
      setLocalRecents(propRecents);
      return;
    }
    try {
      const stored = JSON.parse(localStorage.getItem("elr-recent-v2") ?? "[]");
      if (Array.isArray(stored) && stored.length > 0) {
        setLocalRecents(stored);
      }
    } catch {
      // fallback
    }
  }, [propRecents]);

  const handleModeClick = (mode: "research" | "quick" | "compare") => {
    if (onSelectMode) {
      onSelectMode(mode);
    }
    if (onMobileClose) {
      onMobileClose();
    }
  };

  const handleRecentClick = (text: string) => {
    if (onSelectRecent) {
      onSelectRecent(text);
    } else {
      window.location.href = `/?q=${encodeURIComponent(text)}`;
    }
    if (onMobileClose) {
      onMobileClose();
    }
  };

  const navItemClass = (active: boolean) =>
    cn(
      "relative flex items-center rounded-xl transition-all duration-150 text-left group",
      isCollapsed
        ? "justify-center size-11 mx-auto my-1"
        : "w-full gap-3 px-3 py-2.5 my-0.5 text-sm font-medium",
      active
        ? "bg-[#17253a] text-white shadow-xs"
        : "text-[#8da0b8] hover:bg-[#142135] hover:text-white",
    );

  const activeIndicator = (active: boolean) =>
    active && (
      <span
        className={cn(
          "absolute rounded-full bg-[#deb152]",
          isCollapsed
            ? "left-0 top-2 bottom-2 w-1"
            : "left-0 top-2.5 bottom-2.5 w-1 rounded-r",
        )}
      />
    );

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          onClick={onMobileClose}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Main Sidebar Element */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col justify-between border-r border-[#1a2638] bg-[#0d1625] text-white transition-all duration-300 md:static md:translate-x-0 md:h-screen md:sticky md:top-0 md:shrink-0",
          mobileOpen ? "translate-x-0 w-72 p-4" : "-translate-x-full md:translate-x-0",
          isCollapsed ? "md:w-20 md:p-3" : "md:w-72 md:p-5",
        )}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Top Brand Header */}
          <div
            className={cn(
              "flex items-center shrink-0",
              isCollapsed ? "justify-center" : "justify-between",
            )}
          >
            {isCollapsed ? (
              /* Collapsed mode: single button that shows logo, swaps to expand icon on hover (ChatGPT style) */
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Expand sidebar"
                className="group relative flex size-11 items-center justify-center rounded-xl border border-transparent transition-all duration-200 hover:border-[#1e2d42] hover:bg-[#142135]"
              >
                {/* Logo (Default) */}
                <div className="flex size-8 shrink-0 items-center justify-center transition-all duration-200 group-hover:scale-75 group-hover:opacity-0">
                  <Image
                    src="/logo.png"
                    alt="Negarit Logo"
                    width={32}
                    height={32}
                    className="size-full object-contain"
                    priority
                  />
                </div>

                {/* Collapse / Expand Icon (Hover) */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 scale-75 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100 pointer-events-none">
                  <PanelLeftOpen className="size-5 text-[#deb152] transition-colors" />
                </div>

                {/* Floating tooltip like ChatGPT */}
                <span className="pointer-events-none absolute left-full ml-3 hidden md:inline-flex items-center rounded-lg border border-[#1e2d42] bg-[#101b2b] px-2.5 py-1 text-xs font-medium text-white shadow-xl opacity-0 -translate-x-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0 z-50 whitespace-nowrap">
                  Expand sidebar
                </span>
              </button>
            ) : (
              /* Expanded mode: brand logo + title on left, collapse button on right */
              <>
                <Link
                  href="/"
                  className="flex items-center gap-3 group transition-transform"
                  title="Negarit · Ethiopian Legal AI"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center transition-transform group-hover:scale-105">
                    <Image
                      src="/logo.png"
                      alt="Negarit Logo"
                      width={36}
                      height={36}
                      className="size-full object-contain"
                      priority
                    />
                  </div>

                  <div className="overflow-hidden">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-serif text-lg font-bold tracking-tight text-white">
                        Negarit
                      </span>
                      <span className="ethiopic text-sm font-semibold text-[#deb152]">ነጋሪት</span>
                    </div>
                    <p className="text-[11px] font-medium text-[#7e92ac] truncate">
                      Ethiopian Legal AI
                    </p>
                  </div>
                </Link>

                {/* Collapse toggle button for Desktop (Header only) */}
                <div className="hidden md:flex items-center">
                  <button
                    type="button"
                    onClick={onToggleCollapse}
                    title="Collapse sidebar"
                    aria-label="Collapse sidebar"
                    className="flex size-8 items-center justify-center rounded-lg border border-[#1e2d42] bg-[#121d2d] text-[#7e92ac] transition-colors hover:border-[#deb152]/60 hover:bg-[#17253a] hover:text-white"
                  >
                    <PanelLeftClose className="size-4" />
                  </button>
                </div>

                {/* Close button for Mobile */}
                <button
                  type="button"
                  onClick={onMobileClose}
                  className="rounded-lg p-1 text-[#7e92ac] hover:bg-[#17253a] hover:text-white md:hidden"
                >
                  <X className="size-5" />
                </button>
              </>
            )}
          </div>

          {/* Scrollable Navigation Sections */}
          <div className="flex-1 overflow-y-auto scroll-thin mt-6 pr-0.5 space-y-6">
            {/* Section: WORKSPACE */}
            <div>
              {!isCollapsed ? (
                <p className="px-3 text-[10.5px] font-bold uppercase tracking-wider text-[#556982]">
                  WORKSPACE
                </p>
              ) : (
                <div className="my-2 border-t border-[#1a2638]" />
              )}

              <nav className="mt-2 space-y-1">
                {/* Legal Research */}
                {onSelectMode ? (
                  <button
                    type="button"
                    onClick={() => handleModeClick("research")}
                    title="Legal Research"
                    className={navItemClass(activeItem === "research")}
                  >
                    {activeIndicator(activeItem === "research")}
                    <Search className={cn("size-4.5 shrink-0", activeItem === "research" ? "text-[#deb152]" : "text-[#7e92ac] group-hover:text-white")} />
                    {!isCollapsed && <span>Legal Research</span>}
                  </button>
                ) : (
                  <Link
                    href="/?mode=research"
                    title="Legal Research"
                    className={navItemClass(activeItem === "research")}
                  >
                    {activeIndicator(activeItem === "research")}
                    <Search className={cn("size-4.5 shrink-0", activeItem === "research" ? "text-[#deb152]" : "text-[#7e92ac] group-hover:text-white")} />
                    {!isCollapsed && <span>Legal Research</span>}
                  </Link>
                )}

                {/* Quick Answer */}
                {onSelectMode ? (
                  <button
                    type="button"
                    onClick={() => handleModeClick("quick")}
                    title="Quick Answer"
                    className={navItemClass(activeItem === "quick")}
                  >
                    {activeIndicator(activeItem === "quick")}
                    <Zap className={cn("size-4.5 shrink-0", activeItem === "quick" ? "text-[#deb152]" : "text-[#7e92ac] group-hover:text-white")} />
                    {!isCollapsed && <span>Quick Answer</span>}
                  </button>
                ) : (
                  <Link
                    href="/?mode=quick"
                    title="Quick Answer"
                    className={navItemClass(activeItem === "quick")}
                  >
                    {activeIndicator(activeItem === "quick")}
                    <Zap className={cn("size-4.5 shrink-0", activeItem === "quick" ? "text-[#deb152]" : "text-[#7e92ac] group-hover:text-white")} />
                    {!isCollapsed && <span>Quick Answer</span>}
                  </Link>
                )}

                {/* Compare Laws */}
                {onSelectMode ? (
                  <button
                    type="button"
                    onClick={() => handleModeClick("compare")}
                    title="Compare Laws"
                    className={navItemClass(activeItem === "compare")}
                  >
                    {activeIndicator(activeItem === "compare")}
                    <Scale className={cn("size-4.5 shrink-0", activeItem === "compare" ? "text-[#deb152]" : "text-[#7e92ac] group-hover:text-white")} />
                    {!isCollapsed && <span>Compare Laws</span>}
                  </button>
                ) : (
                  <Link
                    href="/?mode=compare"
                    title="Compare Laws"
                    className={navItemClass(activeItem === "compare")}
                  >
                    {activeIndicator(activeItem === "compare")}
                    <Scale className={cn("size-4.5 shrink-0", activeItem === "compare" ? "text-[#deb152]" : "text-[#7e92ac] group-hover:text-white")} />
                    {!isCollapsed && <span>Compare Laws</span>}
                  </Link>
                )}
              </nav>
            </div>

            {/* Section: ADMIN (Only Corpus Library, Admin console removed as requested) */}
            <div>
              {!isCollapsed ? (
                <p className="px-3 text-[10.5px] font-bold uppercase tracking-wider text-[#556982]">
                  ADMIN
                </p>
              ) : (
                <div className="my-2 border-t border-[#1a2638]" />
              )}

              <nav className="mt-2 space-y-1">
                <Link
                  href="/admin"
                  title="Corpus library"
                  className={navItemClass(activeItem === "corpus" || activeItem === "admin")}
                >
                  {activeIndicator(activeItem === "corpus" || activeItem === "admin")}
                  <Database className={cn("size-4.5 shrink-0", activeItem === "corpus" || activeItem === "admin" ? "text-[#deb152]" : "text-[#7e92ac] group-hover:text-white")} />
                  {!isCollapsed && <span>Corpus library</span>}
                </Link>
              </nav>
            </div>

            {/* Section: RECENT SEARCHES (Below ADMIN) */}
            <div>
              {!isCollapsed ? (
                <div className="flex items-center justify-between px-3">
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#556982]">
                    RECENT SEARCHES
                  </p>
                  {localRecents.length > 0 && (
                    <span className="text-[10px] text-[#556982] font-mono">
                      {localRecents.length}
                    </span>
                  )}
                </div>
              ) : (
                <div className="my-2 border-t border-[#1a2638]" />
              )}

              {isCollapsed ? (
                <div className="flex justify-center py-1" title="Recent searches available in expanded view">
                  <Clock className="size-4 text-[#556982]" />
                </div>
              ) : (
                <div className="mt-2 space-y-1">
                  {localRecents.length === 0 ? (
                    <p className="px-3 py-2 text-xs italic text-[#556982]">No recent searches</p>
                  ) : (
                    localRecents.slice(0, 6).map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleRecentClick(item.text)}
                        title={item.text}
                        className="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-[#142135]"
                      >
                        <Clock className="size-3.5 shrink-0 text-[#556982] transition-colors group-hover:text-[#deb152]" />
                        <span className="truncate text-[#8da0b8] transition-colors group-hover:text-white">
                          {item.text}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Bottom User Profile Row (ChatGPT Style) ────────────────────────── */}
        <div className="relative shrink-0 pt-3 border-t border-[#1a2638]">
          <div
            onClick={() => setProfileOpen((v) => !v)}
            title="Amanuel · Legal Researcher"
            className={cn(
              "flex items-center rounded-xl p-2 transition-all cursor-pointer hover:bg-[#142135] group",
              isCollapsed ? "justify-center" : "gap-3 justify-between",
            )}
          >
            {/* Avatar with Online Status */}
            <div className="relative shrink-0">
              <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-tr from-[#deb152] via-[#caa043] to-[#8a6527] text-ink-950 font-bold text-sm shadow-sm ring-1 ring-white/10 group-hover:ring-[#deb152]/50 transition-all">
                A
              </div>
              <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-[#10b981] ring-2 ring-[#0d1625]" />
            </div>

            {/* User details (Expanded mode) */}
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-xs font-semibold text-white group-hover:text-[#deb152] transition-colors">
                    Amanuel
                  </p>
                  <span className="rounded bg-[#deb152]/15 px-1.5 py-0.2 text-[9.5px] font-bold text-[#deb152]">
                    PRO
                  </span>
                </div>
                <p className="truncate text-[10.5px] text-[#7e92ac]">Legal Researcher</p>
              </div>
            )}

            {!isCollapsed && (
              <MoreHorizontal className="size-4 shrink-0 text-[#556982] group-hover:text-white transition-colors" />
            )}
          </div>

          {/* Quick Profile Dropdown Popover */}
          {profileOpen && (
            <div
              className={cn(
                "absolute z-50 bottom-full mb-2 w-56 rounded-xl border border-[#1e2d42] bg-[#101b2b] p-2.5 shadow-xl text-xs",
                isCollapsed ? "left-full ml-2 w-48" : "left-0",
              )}
            >
              <div className="border-b border-[#1a283c] pb-2 mb-2">
                <p className="font-semibold text-white">Amanuel</p>
                <p className="text-[11px] text-[#7e92ac]">amanuel@legal.et</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between py-1 text-ink-300">
                  <span className="text-[#8da0b8]">Workspace</span>
                  <span className="font-semibold text-white">Negarit AI</span>
                </div>
                <div className="flex items-center justify-between py-1 text-ink-300">
                  <span className="text-[#8da0b8]">Jurisdiction</span>
                  <span className="font-semibold text-[#deb152]">Federal Ethiopia</span>
                </div>
                <div className="flex items-center justify-between py-1 text-ink-300">
                  <span className="text-[#8da0b8]">Plan</span>
                  <span className="font-semibold text-[#10b981]">Active · Pro</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
