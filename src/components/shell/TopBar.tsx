"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, LogOut, Menu, Search, Settings, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { Logo } from "@/components/Logo";
import type { ShellUser } from "./AppShell";
import { withBase } from "@/lib/base-path";

export function TopBar(props: {
  user: ShellUser;
  onToggleNav: () => void;
  onTogglePanel: () => void;
  panelOpen: boolean;
  panelAvailable: boolean;
  quotaPercent: number;
}) {
  const { t } = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const home = props.user.role === "student" ? "/s" : props.user.role === "teacher" ? "/t" : "/a";

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  return (
    <header className="z-30 flex h-14 print:hidden shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:gap-4 sm:px-4">
      <button className="btn btn-ghost p-2 lg:hidden" onClick={props.onToggleNav} aria-label={t("top.menu")}>
        <Menu className="h-5 w-5" />
      </button>
      <Link href={home} className="shrink-0" aria-label="Campus AI">
        <Logo />
      </Link>

      <form action={withBase("/search")} className="relative ml-2 hidden max-w-md flex-1 md:block" role="search">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input name="q" type="search" placeholder={t("top.search")} aria-label={t("common.search")} className="input rounded-full bg-slate-50 py-1.5 pl-9" />
      </form>
      <div className="flex-1 md:hidden" />

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <Link href="/search" className="btn btn-ghost p-2 md:hidden" aria-label={t("common.search")}>
          <Search className="h-5 w-5" />
        </Link>
        <span className="btn btn-ghost cursor-not-allowed p-2 text-slate-300" title={t("top.notifications")} aria-disabled>
          <Bell className="h-5 w-5" />
        </span>
        {props.panelAvailable && (
          <button
            onClick={props.onTogglePanel}
            aria-pressed={props.panelOpen}
            title={t("top.aiPanel")}
            className={`btn gap-1 px-2.5 ${props.panelOpen ? "btn-primary" : ""}`}
          >
            <Sparkles className="h-4 w-4" /> AI
          </button>
        )}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 hover:bg-slate-100"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-lg">{props.user.avatar}</span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-sm font-medium" data-testid="topbar-name">{props.user.displayName}</span>
              <span className="block text-xs text-slate-500">{t(`role.${props.user.role}`)}</span>
            </span>
            <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              <div className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
                {t("chat.quota")}: {t("chat.quotaToday", { pct: props.quotaPercent })}
              </div>
              <Link href="/me" role="menuitem" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
                <Settings className="h-4 w-4" /> {t("top.me")}
              </Link>
              <form action={withBase("/api/auth/logout")} method="post">
                <button role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50">
                  <LogOut className="h-4 w-4" /> {t("top.logout")}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
